// Order endpoint: runs the worker against an in-memory KV and stubbed services.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";
import { processOrder, retryPending } from "../worker/order.js";
import { sheetRow, SHEET_COLUMNS, customerMailContent } from "../worker/integrations.js";
import cfg from "../src/_data/configurator.json" with { type: "json" };
import { ventDefaults } from "../src/scripts/pricing.js";

class MemoryKV {
  constructor() { this.map = new Map(); this.writes = 0; }
  async get(k, type) { const v = this.map.get(k); return v === undefined ? null : type === "json" ? JSON.parse(v) : v; }
  async put(k, v) { this.writes++; this.map.set(k, v); }
  async delete(k) { this.map.delete(k); }
  async list({ prefix }) { return { keys: [...this.map.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; }
}

let calls;
let fail;
beforeEach(() => {
  calls = [];
  fail = new Set();
  globalThis.fetch = async (url, init = {}) => {
    const host = new URL(url).host;
    calls.push({ host, url, body: init.body });
    if (fail.has(host)) return new Response("down", { status: 503 });
    if (host === "challenges.cloudflare.com") return Response.json({ success: init.body.get("response") !== "bad" });
    return new Response("{}", { status: 202 });
  };
});

const SECRETS = { MAILERSEND_TOKEN: "x", ML_TOKEN: "x", ML_GROUP: "1" };
const env = (extra = {}) => ({ ORDERS: new MemoryKV(), ASSETS: { fetch: () => new Response("page") }, ...extra });
const customer = { firstName: "Anna", lastName: "Muster", email: "anna@example.ch", phone: "+41 79 123 45 67", street: "Bahnhofstrasse 1", zip: "8001", city: "Zürich", message: "", newsletter: true };
const body = (over = {}) => ({
  requestId: crypto.randomUUID(), product: "vent", selection: ventDefaults(cfg.vent, "M"),
  customer, terms: true, turnstileToken: "ok", ...over,
});
const post = (e, data, headers = {}) => worker.fetch(new Request("https://senda.test/api/order", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(data),
}), e, null);

test("valid order is stored, priced on the server and mailed", async () => {
  const e = env(SECRETS);
  const res = await post(e, body({ selection: { ...ventDefaults(cfg.vent, "M"), price: 1 } }));
  const out = await res.json();
  assert.equal(res.status, 200);
  assert.match(out.orderNumber, /^SV-\d{6}-[2-9A-HJ-NP-Z]{4}$/);
  const stored = await e.ORDERS.get(`order:${out.orderNumber}`, "json");
  assert.ok(stored.price.total > 5000, "browser price ignored");
  assert.equal(stored.tasks.customerMail, "done");
  assert.equal(stored.tasks.internalMail, "done");
  assert.equal(stored.tasks.newsletter, "done");
  assert.equal(stored.tasks.sheet, "pending", "no Google secrets yet: waits");
  assert.equal(calls.filter((c) => c.host === "api.mailersend.com").length, 2);
});

test("same requestId twice gives the same order, not a second one", async () => {
  const e = env(SECRETS);
  const b = body();
  const a = await (await post(e, b)).json();
  const again = await (await post(e, b)).json();
  assert.equal(a.orderNumber, again.orderNumber);
  assert.equal([...e.ORDERS.map.keys()].filter((k) => k.startsWith("order:")).length, 1);
  assert.equal(calls.filter((c) => c.host === "api.mailersend.com").length, 2);
});

test("invalid input is refused before anything is stored", async () => {
  const e = env(SECRETS);
  const cases = [
    [body({ terms: false }), 400],
    [body({ customer: { ...customer, zip: "80" } }), 400],
    [body({ customer: { ...customer, email: "anna" } }), 400],
    [body({ customer: { ...customer, country: "DE" } }), 400],
    [body({ selection: { ...ventDefaults(cfg.vent, "M"), groupset: "XTR" } }), 400],
    [body({ product: "gravel" }), 400],
    [body({ requestId: "1" }), 400],
    [body({ turnstileToken: "bad" }), 400],
  ];
  for (const [b, status] of cases) assert.equal((await post(e, b)).status, status, JSON.stringify(b).slice(0, 80));
  assert.equal(e.ORDERS.map.size, 0);
});

test("foreign origin and wrong method are refused", async () => {
  const e = env(SECRETS);
  assert.equal((await post(e, body(), { origin: "https://evil.example" })).status, 403);
  const get = await worker.fetch(new Request("https://senda.test/api/order"), e, null);
  assert.equal(get.status, 405);
  const page = await worker.fetch(new Request("https://senda.test/bikes/vent/"), e, null);
  assert.equal(await page.text(), "page");
});

test("production without a Turnstile secret refuses orders", async () => {
  const e = env({ ...SECRETS, SENDA_ENV: "production" });
  assert.equal((await post(e, body())).status, 503);
});

test("a failed email stays pending and the cron sends it later", async () => {
  const e = env(SECRETS);
  fail.add("api.mailersend.com");
  const out = await (await post(e, body())).json();
  let o = await e.ORDERS.get(`order:${out.orderNumber}`, "json");
  assert.equal(o.tasks.customerMail, "pending");
  assert.ok(await e.ORDERS.get(`pending:${out.orderNumber}`));
  assert.equal(o.errors.length, 2);

  fail.clear();
  // Cron leaves orders younger than two minutes alone
  await retryPending(e);
  assert.equal((await e.ORDERS.get(`order:${out.orderNumber}`, "json")).tasks.customerMail, "pending");
  await processOrder(e, out.orderNumber, { minAgeMs: 2 * 60 * 1000, now: Date.now() + 3 * 60 * 1000 });
  o = await e.ORDERS.get(`order:${out.orderNumber}`, "json");
  assert.equal(o.tasks.customerMail, "done");
  assert.equal(o.tasks.internalMail, "done");
});

test("missing secrets: nothing is attempted, nothing is written by the cron", async () => {
  const e = env();
  const out = await (await post(e, body())).json();
  const writes = e.ORDERS.writes;
  await processOrder(e, out.orderNumber);
  assert.equal(e.ORDERS.writes, writes);
  const o = await e.ORDERS.get(`order:${out.orderNumber}`, "json");
  assert.equal(o.attempts, 0);
  assert.equal(o.tasks.customerMail, "pending");
});

test("ORMA Momentum order is paid in full", async () => {
  const e = env(SECRETS);
  const out = await (await post(e, body({ product: "momentum", selection: { rimFront: "45", rimRear: "50" } }))).json();
  assert.match(out.orderNumber, /^OM-/);
  assert.equal(out.payment, "full");
  assert.equal(out.deposit, out.total);
});

test("sheet row matches the columns; mail text has no exclamation marks", async () => {
  const e = env(SECRETS);
  const out = await (await post(e, body())).json();
  const o = await e.ORDERS.get(`order:${out.orderNumber}`, "json");
  assert.equal(sheetRow(o).length, SHEET_COLUMNS.length);
  const m = customerMailContent(o, cfg);
  assert.ok(!JSON.stringify(m).includes("!"));
  assert.match(m.delivery, /March 2027/);
});
