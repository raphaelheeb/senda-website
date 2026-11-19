// Review PDFs of the launch site, for comments and corrections in Acrobat (or Preview).
//
// Usage:
//   SENDA_BUILD=production npx @11ty/eleventy   (build the launch scope into _site/)
//   npm run review                              (serves _site/ itself; or pass a base URL)
//
// Output: review/<YYYY-MM-DD>/SENDA-review-<date>-<EN|DE>-<desktop|mobile>.pdf
// One PDF per language and width. Each site page is one tall PDF page, rendered as the
// browser shows it, with real (selectable) text so a correction can be marked on the word.
// A small grey strip on top of every page names it, so comments can refer to "page 04".
// Accordions and FAQs are opened so all text can be reviewed. The order pages also show
// the details step, the thank-you screen and the confirmation email, with sample data.

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join } from "node:path";
import worker from "../worker/index.js";

const day = new Date().toISOString().slice(0, 10);
const outDir = `review/${day}`;
const tmp = `${outDir}/.pages`;

// ---- Serve _site/ (unless a base URL is given) ----
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon", ".xml": "application/xml" };
let BASE = process.argv[2]?.replace(/\/$/, "");
let server;
if (!BASE) {
  server = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let f = join("_site", p);
    try { if ((await stat(f)).isDirectory()) f = join(f, "index.html"); } catch { /* 404 below */ }
    try { res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); res.end(await readFile(f)); }
    catch { res.writeHead(404); res.end("not found"); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  BASE = `http://127.0.0.1:${server.address().port}`;
}

// ---- The order API runs in-process with the real Worker code; mails are captured, not sent ----
const mails = [];
const realFetch = globalThis.fetch;
class MemoryKV {
  constructor() { this.map = new Map(); }
  async get(k, type) { const v = this.map.get(k); return v === undefined ? null : type === "json" ? JSON.parse(v) : v; }
  async put(k, v) { this.map.set(k, v); }
  async delete(k) { this.map.delete(k); }
  async list({ prefix }) { return { keys: [...this.map.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; }
}
const env = { ORDERS: new MemoryKV(), ASSETS: { fetch: () => new Response("") }, TURNSTILE_SECRET: "review", MAILERSEND_TOKEN: "review", MAIL_FROM: "orders@sendabikes.com", ORDER_INBOX: "review@example.com" };
async function apiOrder(route) {
  const req = route.request();
  const body = JSON.parse(req.postData() || "{}");
  body.turnstileToken = "review";
  globalThis.fetch = async (url, init = {}) => {
    const host = new URL(url).host;
    if (host === "challenges.cloudflare.com") return Response.json({ success: true });
    if (host === "api.mailersend.com") mails.push(JSON.parse(init.body));
    return new Response("{}", { status: 202 });
  };
  const pending = [];
  const res = await worker.fetch(new Request(`${BASE}/api/order`, {
    method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(body),
  }), env, { waitUntil: (p) => pending.push(p) });
  const text = await res.text();
  await Promise.all(pending);
  globalThis.fetch = realFetch;
  await route.fulfill({ status: res.status, contentType: "application/json", body: text });
}

// ---- Pages ----
const SAMPLE = { firstName: "Anna", lastName: "Muster", email: "anna.muster@example.ch", phone: "+41 79 123 45 67", street: "Bahnhofstrasse 1", zip: "8001", city: "Zürich" };
const PAGES = [
  ["01", "Home", "/"],
  ["02", "Bikes", "/bikes/"],
  ["03", "SENDA Vent", "/bikes/vent/"],
  ["04", "Vent order: build", "/bikes/vent/configure/", "build"],
  ["05", "Vent order: details", "/bikes/vent/configure/", "details"],
  ["06", "Vent order: thank you", "/bikes/vent/configure/", "done"],
  ["07", "Vent confirmation email", null, "mail-vent"],
  ["08", "Gravel (teaser)", "/bikes/gravel/"],
  ["09", "Wheelsets", "/wheelsets/"],
  ["10", "ORMA Momentum", "/wheelsets/orma-momentum/"],
  ["11", "Momentum order: build", "/wheelsets/orma-momentum/configure/", "build"],
  ["12", "Momentum order: details", "/wheelsets/orma-momentum/configure/", "details"],
  ["13", "Momentum order: thank you", "/wheelsets/orma-momentum/configure/", "done"],
  ["14", "Momentum confirmation email", null, "mail-momentum"],
  ["15", "ORMA", "/orma/"],
  ["16", "About", "/about/"],
  ["17", "Service", "/service/"],
  ["18", "Order terms", "/terms/"],
];
const WIDTHS = [["desktop", 1440, 900], ["mobile", 390, 844]];
const LANGS = ["en", "de"];

const chromePath = [
  process.env.REVIEW_CHROME,
  "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
].find((p) => p && existsSync(p));
const browser = await chromium.launch(chromePath ? { executablePath: chromePath } : {});

async function settle(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
    window.scrollTo(0, 0);
  });
  await page.addStyleTag({ content: ".reveal{opacity:1!important;transform:none!important}.review-bar,.cf-turnstile{display:none!important}*{transition:none!important;animation:none!important}" });
  await page.evaluate(() => Promise.all([...document.images].map((i) => { i.loading = "eager"; return i.decode().catch(() => {}); })));
  await page.waitForTimeout(400);
}

async function openAll(page) {
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.removeAttribute("name"); d.open = true; }));
}

async function stamp(page, text) {
  await page.evaluate((text) => {
    const s = document.createElement("div");
    s.textContent = text;
    s.style.cssText = "position:relative;z-index:100;background:#efefef;color:#666;font:12px/1 'JetBrains Mono',monospace;letter-spacing:.04em;text-transform:uppercase;padding:10px 16px;border-bottom:1px solid #d2d2d2";
    document.body.prepend(s);
  }, text);
}

async function toPdf(page, file, width) {
  await page.emulateMedia({ media: "screen" });
  const h = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
  // A PDF page can be at most 200 in (19'200 px); longer pages continue on a second sheet.
  const sheet = Math.min(h + 2, 19000);
  await page.pdf({ path: file, width: `${width}px`, height: `${sheet}px`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
}

await rm(outDir, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });

for (const lang of LANGS) {
  const prefix = lang === "de" ? "/de" : "";
  mails.length = 0;
  const mailFor = {};
  for (const [label, width, height] of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: label === "mobile", hasTouch: label === "mobile", locale: lang === "de" ? "de-CH" : "en-GB" });
    await context.addInitScript(() => {
      try { localStorage.setItem("senda_cookie_consent", "declined"); localStorage.setItem("senda_analytics_excluded", "1"); } catch {}
    });
    await context.route("**/challenges.cloudflare.com/**", (r) => r.abort());
    await context.route("**/api/order", apiOrder);
    const files = [];
    for (const [no, title, path, state] of PAGES) {
      const page = await context.newPage();
      const file = `${tmp}/${lang}-${label}-${no}.pdf`;
      const where = path ? `${prefix}${path}` : "email";
      if (state?.startsWith("mail-")) {
        const m = mailFor[state];
        if (!m) { await page.close(); continue; }
        await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#f4f4f4"><div style="background:#fff;max-width:${Math.min(width, 680)}px;margin:0 auto">${m.html}</div></body>`);
        await stamp(page, `${no} · ${title} · Subject: ${m.subject}`);
        await page.waitForTimeout(300);
        await toPdf(page, file, width);
        files.push(file); await page.close(); continue;
      }
      await page.goto(BASE + prefix + path, { waitUntil: "networkidle" });
      if (state === "build") {
        await openAll(page);
        if (path.includes("/vent/")) {
          await page.fill("[name=fitHeight]", "180");
          await page.fill("[name=fitInseam]", "85");
          await page.fill("[name=fitArm]", "64");
          await page.locator("[name=fitArm]").dispatchEvent("input");
          await page.waitForTimeout(200);
        }
        await openAll(page);
      }
      if (state === "details" || state === "done") {
        await page.locator("[data-go=details]:visible").first().click();
        for (const [k, v] of Object.entries(SAMPLE)) await page.fill(`[name=${k}]`, v);
        await page.fill("[name=message]", "");
        if (state === "done") {
          await page.check("[name=terms]");
          const before = mails.length;
          await page.locator(".order-submit").click();
          await page.waitForSelector("[data-order-done]:not([hidden])", { timeout: 10000 });
          await openAll(page);
          const key = path.includes("/vent/") ? "mail-vent" : "mail-momentum";
          const customerMail = mails.slice(before).find((m) => m.to?.[0]?.email === SAMPLE.email);
          if (customerMail && !mailFor[key]) mailFor[key] = customerMail;
        }
      }
      if (!state) await openAll(page);
      await settle(page);
      await stamp(page, `${no} · ${title} · ${where} · ${lang.toUpperCase()} ${label} ${width}px`);
      await toPdf(page, file, width);
      files.push(file);
      await page.close();
    }
    await context.close();
    const out = `${outDir}/SENDA-review-${day}-${lang.toUpperCase()}-${label}.pdf`;
    execFileSync("qpdf", ["--empty", "--pages", ...files, "--", out]);
    console.log(out);
  }
}

await browser.close();
server?.close();
await rm(tmp, { recursive: true, force: true });
console.log(`Done: ${outDir}/`);
