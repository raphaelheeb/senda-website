// Outbound services for an order: MailerSend (emails), Google Sheets (order
// list), MailerLite (newsletter). Each function throws on failure so the
// caller can retry it later. Secrets come from Cloudflare (env), never the repo.
import { chf } from "../src/scripts/pricing.js";

/** Amounts to be paid, with centimes: 4950 -> "CHF 4’950.00". */
export const chf2 = (n) => `${chf(n)}.00`;

const TIMEOUT = 10_000;

async function call(url, init, what) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`${what} ${res.status} ${text}`);
  }
  return res;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MONTHS = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  de: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
};
export const monthYear = (iso, lang = "en") => { const [y, m] = iso.split("-"); return `${(MONTHS[lang] || MONTHS.en)[Number(m) - 1]} ${y}`; };

// Customer email text, per language. Placeholders in braces.
const MAIL = {
  en: {
    subject: "Your {name} order {number}",
    greeting: "Dear {first} {last}",
    intro: "Thank you for your order. We have received it as follows.",
    number: "Order number",
    code: "Article code",
    total: "Total incl. {rate}% VAT",
    deposit: "Deposit ({percent}%): {deposit}. Within two working days we confirm your order with the invoice for the deposit.",
    balance: "Balance: {balance}, invoiced before delivery.",
    full: "Amount: {total}. Within two working days we confirm your order with the invoice.",
    delivery: "Planned delivery: {date}.",
    address: "Delivery address",
    country: "Switzerland",
    refundDeposit: "Your order is binding under our order terms. If SENDA cannot deliver, or delivers substantially later than planned, you receive your deposit back in full.",
    refundFull: "Your order is binding under our order terms. If SENDA cannot deliver, or delivers substantially later than planned, you receive your payment back in full.",
    terms: "Order terms",
    termsUrl: "https://sendabikes.com/terms/",
    close: "If anything is not right, reply to this email.",
  },
  de: {
    subject: "Deine Bestellung {name} {number}",
    greeting: "Hallo {first} {last}",
    intro: "Danke für Deine Bestellung. Wir haben sie wie folgt erhalten.",
    number: "Bestellnummer",
    code: "Artikelcode",
    total: "Total inkl. {rate}% MWST",
    deposit: "Anzahlung ({percent} %): {deposit}. Innert zwei Arbeitstagen bestätigen wir Deine Bestellung mit der Rechnung für die Anzahlung.",
    balance: "Restbetrag: {balance}, in Rechnung gestellt vor der Lieferung.",
    full: "Betrag: {total}. Innert zwei Arbeitstagen bestätigen wir Deine Bestellung mit der Rechnung.",
    delivery: "Geplante Lieferung: {date}.",
    address: "Lieferadresse",
    country: "Schweiz",
    refundDeposit: "Deine Bestellung ist gemäss unseren Bestellbedingungen verbindlich. Kann SENDA nicht liefern oder liefert deutlich später als geplant, erhältst Du Deine Anzahlung vollständig zurück.",
    refundFull: "Deine Bestellung ist gemäss unseren Bestellbedingungen verbindlich. Kann SENDA nicht liefern oder liefert deutlich später als geplant, erhältst Du Deine Zahlung vollständig zurück.",
    terms: "Bestellbedingungen",
    termsUrl: "https://sendabikes.com/de/terms/",
    close: "Falls etwas nicht stimmt, antworte einfach auf diese E-Mail.",
  },
};
const fill = (str, vars) => str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

/** Content of the customer confirmation, as text blocks shared by the text and HTML versions. */
export function customerMailContent(order, cfg) {
  const lang = order.lang === "de" ? "de" : "en";
  const w = MAIL[lang];
  const p = order.price;
  const c = order.customer;
  const name = order.product === "vent" ? cfg.vent.name : cfg.momentum.name;
  const pay = p.payment === "deposit"
    ? [fill(w.deposit, { percent: p.depositPercent, deposit: chf2(p.deposit) }), fill(w.balance, { balance: chf2(p.balance) })]
    : [fill(w.full, { total: chf2(p.total) })];
  return {
    lang,
    labels: w,
    subject: fill(w.subject, { name, number: order.number }),
    greeting: fill(w.greeting, { first: c.firstName, last: c.lastName }),
    intro: w.intro,
    number: order.number,
    summary: p.summary,
    code: p.code,
    lines: p.lines.map(([k, v]) => [k, chf(v)]),
    total: chf2(p.total),
    totalLabel: fill(w.total, { rate: cfg.vatRate ?? 8.1 }),
    pay,
    delivery: fill(w.delivery, { date: monthYear(p.delivery, lang) }),
    address: [`${c.firstName} ${c.lastName}`, c.street, `${c.zip} ${c.city}`, w.country],
    refund: p.payment === "deposit" ? w.refundDeposit : w.refundFull,
    terms: w.termsUrl,
    close: w.close,
  };
}

function renderText(m) {
  const w = m.labels;
  return [
    `${m.greeting},`, "", m.intro, "",
    `${w.number}: ${m.number}`, "",
    ...m.summary.map(([k, v]) => `${k}: ${v}`), "",
    ...m.lines.map(([k, v]) => `${k}: ${v}`),
    "----------------------------------------",
    `${m.totalLabel}: ${m.total}`, "",
    ...m.pay, m.delivery, "",
    `${w.address}:`, ...m.address, "",
    m.refund, `${w.terms}: ${m.terms}`, "",
    m.close, "", "SENDA", "Quietly fast.", "sendabikes.com",
  ].join("\n");
}

function renderHtml(m) {
  const w = m.labels;
  const row = ([k, v], strong, rule) => {
    const line = rule ? "border-top:1px solid #151515;" : "";
    const weight = strong ? "font-weight:600;color:#151515;" : "";
    return `<tr><td style="padding:8px 16px 6px 0;vertical-align:top;${line}${strong ? weight : "color:#666;"}">${esc(k)}</td><td style="padding:8px 0 6px;text-align:right;white-space:nowrap;${line}${weight}">${esc(v)}</td></tr>`;
  };
  const table = (rows) => `<table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #d2d2d2;margin:16px 0">${rows}</table>`;
  return `<!doctype html><html lang="${m.lang}"><body style="margin:0;background:#fff">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;font:16px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#444">
<p style="font:600 13px/1 monospace;letter-spacing:.12em;color:#151515">SENDA</p>
<p>${esc(m.greeting)},</p><p>${esc(m.intro)}</p>
<p style="color:#151515">${esc(w.number)} <strong>${esc(m.number)}</strong></p>
${table(m.summary.map((r) => row(r)).join(""))}
${table(m.lines.map((r, i) => row(r, i === 0)).join("") + row([m.totalLabel, m.total], true, true))}
${m.pay.map((t) => `<p>${esc(t)}</p>`).join("")}<p>${esc(m.delivery)}</p>
<p style="color:#666">${esc(w.address)}<br>${m.address.map(esc).join("<br>")}</p>
<p>${esc(m.refund)} <a href="${m.terms}" style="color:#151515">${esc(w.terms)}</a></p>
<p>${esc(m.close)}</p>
<p style="color:#151515">SENDA<br><span style="color:#666">Quietly fast.</span></p>
</div></body></html>`;
}

async function mailersend(env, payload) {
  await call("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.MAILERSEND_TOKEN}` },
    body: JSON.stringify({
      from: { email: env.MAIL_FROM || "info@sendabikes.com", name: "SENDA" },
      reply_to: { email: env.ORDER_INBOX || "info@sendabikes.com", name: "SENDA" },
      ...payload,
    }),
  }, "MailerSend");
}

export async function sendCustomerMail(env, order, cfg) {
  const m = customerMailContent(order, cfg);
  await mailersend(env, {
    to: [{ email: order.customer.email, name: `${order.customer.firstName} ${order.customer.lastName}` }],
    subject: m.subject, text: renderText(m), html: renderHtml(m),
  });
}

/** "178 / 84 / 68 cm, shoulders 40 cm, race, applied" or "". */
export function fitText(fit) {
  if (!fit) return "";
  return `height ${fit.height} / inseam ${fit.inseam} / arm ${fit.arm} cm`
    + (fit.shoulders ? `, shoulders ${fit.shoulders} cm` : "")
    + (fit.position ? `, ${fit.position}` : "")
    + (fit.applied ? ", fit applied" : ", fit not applied");
}

export function internalMailText(order) {
  const c = order.customer;
  const p = order.price;
  return [
    `New order ${order.number}, received ${order.receivedAt}`, "",
    `${c.firstName} ${c.lastName}`, c.email, c.phone, c.street, `${c.zip} ${c.city}`, "",
    ...p.summary.map(([k, v]) => `${k}: ${v}`), `Article code: ${p.code}`, "",
    ...p.lines.map(([k, v]) => `${k}: ${chf(v)}`), `Total incl. VAT: ${chf2(p.total)}`,
    p.payment === "deposit" ? `Deposit to invoice: ${chf2(p.deposit)} / balance ${chf2(p.balance)}` : `Invoice in full: ${chf2(p.total)}`, "",
    `Measurements: ${fitText(order.fit) || "not given"}`,
    `Newsletter: ${c.newsletter ? "yes" : "no"}`,
    `Message: ${c.message || "none"}`, "",
    `Language ${order.lang || "en"} · request ${order.requestId} · ${order.meta.country} · ${order.meta.ip}`,
  ].join("\n");
}

export async function sendInternalMail(env, order) {
  const c = order.customer;
  await mailersend(env, {
    to: [{ email: env.ORDER_INBOX || "info@sendabikes.com", name: "SENDA orders" }],
    reply_to: { email: c.email, name: `${c.firstName} ${c.lastName}` },
    subject: `New order ${order.number} · ${c.firstName} ${c.lastName} · ${chf(order.price.total)}`,
    text: internalMailText(order),
  });
}

// ---------- Google Sheets (service account, JWT signed with WebCrypto) ----------

export const SHEET_COLUMNS = [
  "Received", "Order", "Product", "Article code", "First name", "Last name", "Email", "Phone",
  "Street", "Postcode", "Town", "Size", "Colour", "Groupset", "Crank", "Chainrings", "Cassette",
  "Rim front", "Rim rear", "Bar", "Stem", "Spacers", "Tyres", "List price", "Discount", "Shipping",
  "Total", "Deposit / invoice", "Balance", "Measurements", "Newsletter", "Message", "Status",
];

export function sheetRow(order) {
  const c = order.customer;
  const s = order.selection;
  const p = order.price;
  const received = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich", dateStyle: "short", timeStyle: "short" }).format(new Date(order.receivedAt));
  return [
    received, order.number, order.product === "vent" ? "SENDA Vent" : "ORMA Momentum", p.code,
    c.firstName, c.lastName, c.email, c.phone, c.street, c.zip, c.city,
    s.size || "", s.finish || "", s.groupset || "", s.crank || "", s.chainring || "", s.cassette || "",
    s.rimFront || "", s.rimRear || "", s.bar || "", s.stem || "", s.spacers || "", s.tyre || "",
    p.subtotal, p.discount, p.shipping, p.total, p.deposit, p.balance, fitText(order.fit),
    c.newsletter ? "yes" : "no", c.message, "New",
  ];
}

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlText = (s) => b64url(new TextEncoder().encode(s));

let cachedToken = null;
async function googleToken(env) {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  const pem = env.GOOGLE_SA_KEY.replace(/\\n/g, "\n");
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (ch) => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const iat = Math.floor(Date.now() / 1000);
  const head = b64urlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64urlText(JSON.stringify({
    iss: env.GOOGLE_SA_EMAIL, scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600,
  }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const res = await call("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64url(sig)}` }),
  }, "Google token");
  const out = await res.json();
  cachedToken = { value: out.access_token, exp: Date.now() + (out.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

export async function appendSheetRow(env, order) {
  const token = await googleToken(env);
  const range = encodeURIComponent(`${env.SHEET_TAB || "Orders"}!A1`);
  await call(`https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ values: [sheetRow(order)] }),
  }, "Google Sheets");
}

// ---------- MailerLite ----------

export async function mailerliteSubscribe(env, email, list) {
  const group = list === "orma" ? (env.ML_GROUP_ORMA || env.ML_GROUP) : env.ML_GROUP;
  await call("https://connect.mailerlite.com/api/subscribers", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${env.ML_TOKEN}` },
    body: JSON.stringify({ email, groups: [group] }),
  }, "MailerLite");
}

export async function subscribeNewsletter(env, order) {
  await mailerliteSubscribe(env, order.customer.email, order.product === "momentum" ? "orma" : "senda");
}
