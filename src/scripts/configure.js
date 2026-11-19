// Order pages: keeps the selection, shows the live price and sends the order.
// The price shown here is for the visitor only; the server recalculates it.
import { priceOrder, ventDefaults, momentumDefaults, chf } from "./pricing.js";
import { fitVent } from "./fit.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const byId = (list, id) => list.find((x) => (typeof x === "string" ? x : x.id) === String(id));

// Interface text for the page's language, set by the base layout (src/_data/i18n/<lang>.json, key "js").
const T = (window.SENDA && window.SENDA.t) || {};
const tr = (key, vars = {}) => String(T[key] || key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

function init(form) {
  const product = form.dataset.order;
  const lang = form.dataset.lang === "de" ? "de" : "en";
  const cfg = JSON.parse(document.getElementById("order-config").textContent);
  const imgData = document.getElementById("order-images");
  const images = imgData ? JSON.parse(imgData.textContent) : {};
  const $ = (sel) => document.querySelector(sel);
  const radios = (name) => form.querySelectorAll(`input[type=radio][name="${name}"]`);
  const fields = product === "vent"
    ? ["size", "finish", "groupset", "crank", "chainring", "cassette", "rimFront", "rimRear", "bar", "stem", "spacers", "tyre"]
    : ["rimFront", "rimRear", "freehub"];
  const defaults = (size = "M") => (product === "vent" ? ventDefaults(cfg.vent, size) : momentumDefaults(cfg.momentum));

  // Values shown in each collapsed row (plain text; the colour row adds a dot).
  const v = cfg.vent;
  const show = {
    size: (s) => { const z = byId(v.sizes, s.size); return `${z.label} · ${z.cm} cm`; },
    finish: (s) => byId(v.finishes, s.finish).label,
    groupset: (s) => byId(v.groupsets, s.groupset).label.replace("Shimano ", ""),
    gearing: (s) => `${s.crank} · ${s.chainring} · ${s.cassette}`,
    wheels: (s) => `${s.rimFront} / ${s.rimRear} mm`,
    cockpit: (s) => `${s.bar} · ${s.stem} · ${s.spacers} mm`,
    tyre: (s) => `${s.tyre} mm`,
    freehub: (s) => byId(cfg.momentum.freehubs, s.freehub).label,
  };

  // Restore a selection from the address bar (shareable links), else defaults.
  const params = new URLSearchParams(location.search);
  let sel = defaults(params.get("size") || "M");
  for (const f of fields) if (params.get(f)) sel[f] = params.get(f);
  if (!priceOrder(cfg, product, sel, undefined, lang).ok) sel = defaults();

  const apply = () => {
    for (const f of fields) radios(f).forEach((r) => { r.checked = r.value === String(sel[f]); });
  };

  const render = () => {
    const r = priceOrder(cfg, product, sel, undefined, lang);
    if (!r.ok) { sel = defaults(); apply(); return render(); }
    form.querySelectorAll("[data-show]").forEach((el) => {
      const key = el.dataset.show;
      el.innerHTML = esc(show[key](sel));
      if (key === "finish") el.insertAdjacentHTML("afterbegin", `<i style="background:${byId(v.finishes, sel.finish).hex}"></i>`);
    });
    $("[data-summary-list]").innerHTML = r.summary.map(([k, x]) => `<dt>${esc(k)}</dt><dd>${esc(x)}</dd>`).join("");
    $("[data-summary-lines]").innerHTML = r.lines.map(([k, x]) => `<dt>${esc(k)}</dt><dd>${chf(x)}</dd>`).join("");
    $("[data-summary-total]").textContent = chf(r.total);
    $("[data-bar-total]").textContent = chf(r.total);
    $("[data-summary-pay]").textContent = r.payment === "deposit"
      ? tr("deposit", { deposit: chf(r.deposit), balance: chf(r.balance) })
      : tr("full");
    if (product === "vent") {
      const finish = byId(v.finishes, sel.finish);
      const img = images[finish.label];
      const note = $("[data-summary-imgnote]");
      $("[data-summary-img]").src = img || images["Slate Blue"];
      note.hidden = Boolean(img);
      note.textContent = img ? "" : tr("shown_in", { finish: finish.label });
      for (const g of v.groupsets) {
        const m = form.querySelector(`[data-groupset-price="${g.id}"]`);
        if (m) m.innerHTML = r.discount ? `${chf(g.price - r.discount)} <s>${chf(g.price)}</s>` : chf(g.price);
      }
    }
    const url = new URL(location.href);
    for (const f of fields) url.searchParams.set(f, sel[f]);
    history.replaceState(null, "", url);
  };

  form.addEventListener("change", (e) => {
    const t = e.target;
    if (t.type !== "radio" || !fields.includes(t.name)) return;
    if (t.name === "size" && product === "vent") {
      // A new size brings its suggested crank and cockpit; colour and parts stay.
      const d = ventDefaults(v, t.value);
      sel = { ...sel, size: t.value, crank: d.crank, bar: d.bar, stem: d.stem };
      apply();
    } else {
      sel[t.name] = t.value;
    }
    render();
  });

  // Fit calculator: measurements to size, stem, spacers, bar and crank.
  let fitInput = null; // sent with the order so SENDA can check the size
  const fitBox = form.querySelector("[data-fit]");
  if (fitBox) {
    const q = (n) => fitBox.querySelector(`[name="${n}"]`);
    const result = fitBox.querySelector("[data-fit-result]");
    const error = fitBox.querySelector("[data-fit-error]");
    const notes = { race: tr("fit_race"), relaxed: tr("fit_relaxed") };
    const reasons = { height: tr("fit_height"), inseam: tr("fit_inseam"), arm: tr("fit_arm"), standover: tr("fit_standover") };
    let current = null;
    const run = () => {
      const position = fitBox.querySelector("[name=fitPosition]:checked").value;
      fitBox.querySelector("[data-fit-posnote]").textContent = notes[position] || "";
      const input = { height: q("fitHeight").value, inseam: q("fitInseam").value, arm: q("fitArm").value, shoulders: q("fitShoulders").value };
      result.hidden = true;
      error.textContent = "";
      current = null;
      fitInput = null;
      if (!input.height || !input.inseam || !input.arm) return;
      const r = fitVent(v, input, position);
      if (!r.ok) { error.textContent = reasons[r.reason] || ""; return; }
      current = { r, input: { ...input, position } };
      fitInput = { ...current.input, applied: false };
      const z = byId(v.sizes, r.size);
      const w = T.fit_rows || {};
      const rows = [
        [w.size, `${z.label} · ${z.cm} cm`], [w.stem, `${r.stem} mm`], [w.spacers, `${r.spacers} mm`],
        [w.bar, `${r.bar} mm`], [w.crank, `${r.crank} mm`], [w.saddle, `${w.about} ${r.saddleHeight} mm`],
      ];
      fitBox.querySelector("[data-fit-list]").innerHTML = rows.map(([k, x]) => `<div><dt>${k}</dt><dd>${x}</dd></div>`).join("");
      const note = [];
      if (r.alternatives.length) note.push(tr("fit_close", { sizes: r.alternatives.join(` ${tr("fit_and")} `) }));
      if (r.miss > 30) note.push(position === "relaxed" ? tr("fit_limit_relaxed") : tr("fit_limit"));
      fitBox.querySelector("[data-fit-note]").textContent = note.join(" ");
      result.hidden = false;
    };
    fitBox.addEventListener("input", run);
    fitBox.addEventListener("change", run);
    fitBox.querySelector("[data-fit-apply]").addEventListener("click", () => {
      if (!current) return;
      const { r } = current;
      sel = { ...sel, size: r.size, crank: r.crank, bar: r.bar, stem: r.stem, spacers: r.spacers };
      fitInput = { ...current.input, applied: true };
      apply();
      render();
      const btn = fitBox.querySelector("[data-fit-apply]");
      const label = btn.textContent;
      btn.textContent = tr("applied");
      setTimeout(() => { btn.textContent = label; }, 2000);
    });
  }
  form.fitInput = () => fitInput;

  // Two stages: build the bike, then the details.
  const bar = $("[data-order-bar]");
  const setStage = (stage) => {
    form.dataset.stage = stage;
    form.querySelector(".config__build").hidden = stage !== "build";
    form.querySelector(".config__details").hidden = stage !== "details";
    form.querySelectorAll("[data-stage-title]").forEach((el) => { el.hidden = el.dataset.stageTitle !== stage; });
    bar.hidden = stage !== "build";
    window.scrollTo({ top: Math.max(0, form.getBoundingClientRect().top + scrollY - 120) });
    if (stage === "details") form.querySelector("[name=firstName]").focus({ preventScroll: true });
  };
  document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => setStage(b.dataset.go)));
  bar.hidden = false;

  apply();
  render();
  form.addEventListener("submit", (e) => submit(e, form, product, () => sel, cfg, lang));
  // A non-Swiss postcode gets the delivery note as soon as the field is left.
  const zip = form.querySelector("[name=zip]");
  const msg = form.querySelector(".order-msg");
  zip?.addEventListener("blur", () => {
    const foreign = zip.value.trim() !== "" && !zip.checkValidity();
    if (foreign) zip.setAttribute("aria-invalid", "true"); else zip.removeAttribute("aria-invalid");
    if (foreign) msg.textContent = tr("swiss_only", { email: cfg.orderEmail });
    else if (msg.textContent === tr("swiss_only", { email: cfg.orderEmail })) msg.textContent = "";
  });
}

// One id per filled-in form: a double click or a retry sends the same id,
// and the server returns the same order instead of creating a second one.
let requestId = crypto.randomUUID();

async function submit(e, form, product, getSel, cfg, lang) {
  e.preventDefault();
  const msg = form.querySelector(".order-msg");
  const btn = form.querySelector(".order-submit");
  const data = new FormData(form);
  const customer = {};
  for (const k of ["firstName", "lastName", "email", "phone", "street", "zip", "city", "message"]) customer[k] = String(data.get(k) || "").trim();
  customer.country = "CH";
  customer.newsletter = data.get("newsletter") === "on";
  const terms = data.get("terms") === "on";

  const missing = [...form.querySelectorAll("#details [required]")].filter((el) => el.type !== "checkbox" && !el.checkValidity());
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
  if (missing.length || !terms) {
    const zip = form.querySelector("[name=zip]");
    const foreign = missing.includes(zip) && zip.value.trim() !== "";
    msg.textContent = foreign ? tr("swiss_only", { email: cfg.orderEmail }) : missing.length ? tr("fill") : tr("accept_terms");
    missing.forEach((el) => el.setAttribute("aria-invalid", "true"));
    (missing[0] || form.querySelector("[name=terms]")).focus();
    return;
  }

  btn.disabled = true;
  msg.textContent = tr("sending");
  try {
    const res = await fetch("/api/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId, product, lang, selection: getSel(), customer, terms, fit: form.fitInput ? form.fitInput() : null, turnstileToken: data.get("cf-turnstile-response") || "" }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) {
      (out.fields || []).forEach((f) => form.querySelector(`[name="${f}"]`)?.setAttribute("aria-invalid", "true"));
      throw new Error(out.message || tr("failed"));
    }
    done(form, out, customer, cfg, lang);
  } catch (err) {
    msg.textContent = `${err.message} ${tr("retry", { email: cfg.orderEmail })}`;
    btn.disabled = false;
    if (window.turnstile) window.turnstile.reset();
  }
}

function done(form, out, customer, cfg, lang) {
  const box = document.querySelector("[data-order-done]");
  const d = T.done || {};
  const f = (str, vars) => String(str || "").replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  const chf2 = (n) => `${chf(n).replace(" ", "\u00a0")}.00`; // keep "CHF 1’160.00" on one line
  const set = (sel, text) => { box.querySelector(sel).textContent = text; };
  const product = out.payment === "deposit" ? cfg.vent : cfg.momentum;
  const date = new Date(`${product.delivery}T12:00:00Z`).toLocaleDateString(lang === "de" ? "de-CH" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  set("[data-done-title]", f(d.title, { first: customer.firstName }));
  set("[data-done-lead]", out.payment === "deposit" ? d.lead_vent : d.lead_momentum);
  set("[data-done-now]", d.now);
  set("[data-done-now-text]", f(d.now_text, { email: customer.email, number: out.orderNumber }));
  set("[data-done-confirm]", d.confirm);
  set("[data-done-confirm-text]", out.payment === "deposit" ? f(d.confirm_deposit, { deposit: chf2(out.deposit) }) : f(d.confirm_full, { total: chf2(out.total) }));
  set("[data-done-until]", d.until);
  set("[data-done-until-text]", out.payment === "deposit" ? f(d.until_vent, { balance: chf2(out.balance), date }) : f(d.until_momentum, { date }));
  set("[data-done-your-order]", `${d.your_order} · ${out.orderNumber}`);
  box.querySelector("[data-done-list]").innerHTML = out.summary.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")
    + (out.lines || []).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${chf(v)}</dd>`).join("")
    + `<dt class="done-total">${esc(tr("total"))}</dt><dd class="done-total">${chf2(out.total)}</dd>`;
  box.querySelector("[data-done-contact]").innerHTML = esc(f(d.contact, { email: "\u0000" }))
    .replace("\u0000", `<a class="linkline" href="mailto:${cfg.orderEmail}">${cfg.orderEmail}</a>`);
  set("[data-done-sign]", d.sign);
  form.hidden = true;
  document.querySelector("[data-order-bar]").hidden = true;
  const head = document.querySelector(".order-page .crumbs");
  if (head) head.hidden = true;
  box.hidden = false;
  box.focus();
  window.scrollTo({ top: Math.max(0, box.getBoundingClientRect().top + scrollY - 140) });
  requestId = crypto.randomUUID();
}

const orderForm = document.querySelector("[data-order]");
if (orderForm) init(orderForm);
