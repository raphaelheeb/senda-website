// Order intake: validate, check Turnstile, price on the server, store in KV.
// Emails, the Google Sheet row and the newsletter sign-up run afterwards
// (processOrder) and are retried by the cron trigger until each one is done.
import cfg from "../src/_data/configurator.json" with { type: "json" };
import { priceOrder, zurichDate } from "../src/scripts/pricing.js";
import { sendCustomerMail, sendInternalMail, appendSheetRow, subscribeNewsletter } from "./integrations.js";

const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
const MAX_BODY = 20_000;
const MAX_ATTEMPTS = 60; // every 10 minutes: about ten hours of retries
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

const CUSTOMER_FIELDS = {
  firstName: { required: true, max: 80 },
  lastName: { required: true, max: 80 },
  email: { required: true, max: 160, test: (v) => EMAIL.test(v) },
  phone: { required: true, max: 40, test: (v) => /^[+0-9 ()./-]{6,40}$/.test(v) },
  street: { required: true, max: 120 },
  zip: { required: true, max: 4, test: (v) => /^[1-9][0-9]{3}$/.test(v) },
  city: { required: true, max: 80 },
  message: { required: false, max: 1000 },
};

// German versions of the messages customers can see.
const DE = {
  "Please fill in your details.": "Bitte fülle Deine Angaben aus.",
  "Please check the marked fields.": "Bitte prüfe die markierten Felder.",
  "For now we deliver within Switzerland only. Please enter a Swiss postcode with four digits.": "Wir liefern vorerst nur innerhalb der Schweiz. Bitte gib eine Schweizer PLZ mit vier Ziffern ein.",
  "Orders are briefly unavailable.": "Bestellungen sind kurz nicht möglich.",
  "The spam check did not complete.": "Die Spam-Prüfung wurde nicht abgeschlossen.",
  "The spam check is briefly unavailable.": "Die Spam-Prüfung ist kurz nicht verfügbar.",
  "The order could not be stored.": "Die Bestellung konnte nicht gespeichert werden.",
  "Unexpected request.": "Unerwartete Anfrage.",
  "Please accept the order terms.": "Bitte akzeptiere die Bestellbedingungen.",
  "This configuration is not available. Please reload the page.": "Diese Konfiguration ist nicht verfügbar. Bitte lade die Seite neu.",
};

export class OrderError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

/** Optional body measurements from the fit calculator; anything odd is dropped, never an error. */
export function cleanFit(f) {
  if (!f || typeof f !== "object") return null;
  const num = (x, lo, hi) => { const n = Number(x); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null; };
  const out = {
    height: num(f.height, 100, 230), inseam: num(f.inseam, 40, 130), arm: num(f.arm, 30, 110),
    shoulders: num(f.shoulders, 20, 70), position: ["race", "relaxed"].includes(f.position) ? f.position : null,
    applied: f.applied === true,
  };
  return out.height && out.inseam && out.arm ? out : null;
}

/** Checks the customer block; returns a clean copy. */
export function validateCustomer(c) {
  if (!c || typeof c !== "object") throw new OrderError(400, "Please fill in your details.");
  const out = {};
  const bad = [];
  for (const [k, rule] of Object.entries(CUSTOMER_FIELDS)) {
    const v = typeof c[k] === "string" ? c[k].replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim() : "";
    if ((rule.required && !v) || v.length > rule.max || (v && rule.test && !rule.test(v))) bad.push(k);
    out[k] = v;
  }
  if (c.country && c.country !== "CH") bad.push("country");
  if (bad.includes("zip") && out.zip) throw new OrderError(400, "For now we deliver within Switzerland only. Please enter a Swiss postcode with four digits.", bad);
  if (bad.length) throw new OrderError(400, "Please check the marked fields.", bad);
  out.country = "CH";
  out.newsletter = c.newsletter === true;
  return out;
}

async function verifyTurnstile(env, token, ip) {
  const secret = env.TURNSTILE_SECRET || (env.SENDA_ENV === "production" ? "" : TURNSTILE_TEST_SECRET);
  if (!secret) throw new OrderError(503, "Orders are briefly unavailable.");
  if (!token || typeof token !== "string" || token.length > 4096) {
    throw new OrderError(400, "The spam check did not complete.");
  }
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  let out = {};
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
    out = await res.json().catch(() => ({}));
  } catch {
    throw new OrderError(503, "The spam check is briefly unavailable.");
  }
  if (!out.success) throw new OrderError(400, "The spam check did not complete.");
}

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O, 1/I
function randomCode(n) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => ALPHABET[b % 32]).join("");
}

/** "SV-261118-7K3Q" (Vent) or "OM-261118-7K3Q" (ORMA Momentum). */
async function newOrderNumber(kv, product, now) {
  const prefix = product === "vent" ? "SV" : "OM";
  const day = zurichDate(now).slice(2).replaceAll("-", "");
  for (let i = 0; i < 5; i++) {
    const n = `${prefix}-${day}-${randomCode(4)}`;
    if (!(await kv.get(`order:${n}`))) return n;
  }
  throw new OrderError(500, "The order could not be stored.");
}

function publicResult(order) {
  const p = order.price;
  return {
    ok: true, orderNumber: order.number, summary: p.summary, lines: p.lines,
    total: p.total, deposit: p.deposit, balance: p.balance, payment: p.payment,
  };
}

/** POST /api/order */
export async function handleOrder(request, env, ctx, now = new Date()) {
  const kv = env.ORDERS;
  if (!kv) throw new OrderError(503, "Orders are briefly unavailable.");
  if (!(request.headers.get("content-type") || "").includes("application/json")) {
    throw new OrderError(415, "Unexpected request.");
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new OrderError(413, "Unexpected request.");
  let body;
  try { body = JSON.parse(raw); } catch { throw new OrderError(400, "Unexpected request."); }

  const { requestId, product, selection, customer, terms, turnstileToken, fit } = body || {};
  const lang = body && body.lang === "de" ? "de" : "en";
  try {
    return await storeOrder(env, ctx, now, request, { requestId, product, selection, customer, terms, turnstileToken, fit, lang });
  } catch (e) {
    if (e instanceof OrderError && lang === "de") e.message = DE[e.message] || e.message;
    throw e;
  }
}

async function storeOrder(env, ctx, now, request, { requestId, product, selection, customer, terms, turnstileToken, fit, lang }) {
  const kv = env.ORDERS;
  if (typeof requestId !== "string" || !UUID.test(requestId)) throw new OrderError(400, "Unexpected request.");

  // Same requestId again (double click, retry after a lost response): same answer, no second order.
  const seen = await kv.get(`req:${requestId}`);
  if (seen) {
    const prior = await kv.get(`order:${seen}`, "json");
    if (prior) return publicResult(prior);
  }

  if (terms !== true) throw new OrderError(400, "Please accept the order terms.", ["terms"]);
  const cust = validateCustomer(customer);
  const sel = {};
  for (const [k, v] of Object.entries(selection || {})) sel[k] = String(v).slice(0, 20);
  const price = priceOrder(cfg, product, sel, now, lang);
  if (!price.ok) throw new OrderError(400, "This configuration is not available. Please reload the page.", price.errors);

  const ip = request.headers.get("cf-connecting-ip") || "";
  await verifyTurnstile(env, turnstileToken, ip);

  const number = await newOrderNumber(kv, product, now);
  const order = {
    number, requestId, product, lang, selection: sel, customer: cust, price, fit: product === "vent" ? cleanFit(fit) : null,
    receivedAt: now.toISOString(),
    meta: { ip, country: request.cf?.country || "", ua: (request.headers.get("user-agent") || "").slice(0, 200) },
    tasks: {
      customerMail: "pending", internalMail: "pending", sheet: "pending",
      newsletter: cust.newsletter ? "pending" : "not-requested",
    },
    attempts: 0, errors: [],
  };
  // The order itself is the record: stored before anything else can fail.
  await kv.put(`order:${number}`, JSON.stringify(order));
  await kv.put(`req:${requestId}`, number, { expirationTtl: 60 * 60 * 24 * 30 });
  await kv.put(`pending:${number}`, "1");

  const work = processOrder(env, number).catch((e) => console.error("processOrder", number, e));
  if (ctx && ctx.waitUntil) ctx.waitUntil(work); else await work;
  return publicResult(order);
}

const TASKS = {
  customerMail: { needs: ["MAILERSEND_TOKEN"], run: sendCustomerMail },
  internalMail: { needs: ["MAILERSEND_TOKEN"], run: sendInternalMail },
  sheet: { needs: ["GOOGLE_SA_EMAIL", "GOOGLE_SA_KEY", "SHEET_ID"], run: appendSheetRow },
  newsletter: { needs: ["ML_TOKEN", "ML_GROUP"], run: subscribeNewsletter },
};

/**
 * Runs every open task of one order and records the outcome. A task whose
 * secrets are not set yet waits ("pending") and is picked up by the cron
 * once they are; nothing is lost in between, the order stays in KV.
 * After MAX_ATTEMPTS real attempts a task is marked "failed" and left alone.
 */
export async function processOrder(env, number, { minAgeMs = 0, now = Date.now() } = {}) {
  const kv = env.ORDERS;
  const order = await kv.get(`order:${number}`, "json");
  if (!order) { await kv.delete(`pending:${number}`); return; }
  // The cron leaves fresh orders alone: the request that stored them is still sending.
  if (now - Date.parse(order.receivedAt) < minAgeMs) return order;
  const ready = Object.entries(TASKS).filter(([name, t]) => order.tasks[name] === "pending" && t.needs.every((k) => env[k]));
  if (!ready.length) return order; // nothing to do yet: no write, no attempt counted
  order.attempts += 1;
  for (const [name, task] of ready) {
    try {
      await task.run(env, order, cfg);
      order.tasks[name] = "done";
    } catch (e) {
      order.errors = [...order.errors.slice(-9), `${new Date().toISOString()} ${name}: ${String(e.message || e).slice(0, 300)}`];
    }
  }
  if (order.attempts >= MAX_ATTEMPTS) {
    for (const [name] of ready) if (order.tasks[name] === "pending") order.tasks[name] = "failed";
  }
  await kv.put(`order:${number}`, JSON.stringify(order));
  if (!Object.values(order.tasks).includes("pending")) await kv.delete(`pending:${number}`);
  return order;
}

/** Cron: retry every order with open tasks. */
export async function retryPending(env) {
  let cursor;
  do {
    const page = await env.ORDERS.list({ prefix: "pending:", cursor });
    for (const k of page.keys) {
      try { await processOrder(env, k.name.slice("pending:".length), { minAgeMs: 2 * 60 * 1000 }); }
      catch (e) { console.error("retry", k.name, e); }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}
