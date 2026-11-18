// Order pages: keeps the selection, shows the live price and sends the order.
// The price shown here is for the visitor only; the server recalculates it.
import { priceOrder, ventDefaults, momentumDefaults, chf } from "./pricing.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const byId = (list, id) => list.find((x) => (typeof x === "string" ? x : x.id) === String(id));

function init(form) {
  const product = form.dataset.order;
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
  if (!priceOrder(cfg, product, sel).ok) sel = defaults();

  const apply = () => {
    for (const f of fields) radios(f).forEach((r) => { r.checked = r.value === String(sel[f]); });
  };

  const render = () => {
    const r = priceOrder(cfg, product, sel);
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
      ? `Deposit ${chf(r.deposit)} after your order, balance ${chf(r.balance)} before delivery.`
      : `Invoiced in full after your order.`;
    if (product === "vent") {
      const finish = byId(v.finishes, sel.finish);
      const img = images[finish.label];
      const note = $("[data-summary-imgnote]");
      $("[data-summary-img]").src = img || images["Slate Blue"];
      note.hidden = Boolean(img);
      note.textContent = img ? "" : `Shown in Slate Blue. Yours comes in ${finish.label}.`;
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

  // Size guide: height to size.
  const h = form.querySelector("[data-height]");
  if (h) h.addEventListener("input", () => {
    const out = form.querySelector("[data-height-result]");
    const cm = Number(h.value);
    out.textContent = "";
    if (!cm || cm < 100) return;
    const fits = v.sizes.filter((s) => cm >= s.height[0] && cm <= s.height[1]);
    if (!fits.length) { out.textContent = "Outside our size range. Write to us and we find a solution."; return; }
    out.append(fits.length > 1 ? `Between ${fits.map((s) => s.label).join(" and ")}. ` : `Size ${fits[0].label}. `);
    for (const s of fits) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "textbtn"; b.textContent = `Choose ${s.label}`;
      b.addEventListener("click", () => {
        const r = [...radios("size")].find((x) => x.value === s.id);
        r.checked = true;
        r.dispatchEvent(new Event("change", { bubbles: true }));
      });
      out.append(b, " ");
    }
  });

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
  form.addEventListener("submit", (e) => submit(e, form, product, () => sel, cfg));
}

// One id per filled-in form: a double click or a retry sends the same id,
// and the server returns the same order instead of creating a second one.
let requestId = crypto.randomUUID();

async function submit(e, form, product, getSel, cfg) {
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
    msg.textContent = missing.length ? "Please fill in the marked fields." : "Please accept the order terms.";
    missing.forEach((el) => el.setAttribute("aria-invalid", "true"));
    (missing[0] || form.querySelector("[name=terms]")).focus();
    return;
  }

  btn.disabled = true;
  msg.textContent = "Sending your order…";
  try {
    const res = await fetch("/api/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId, product, selection: getSel(), customer, terms, turnstileToken: data.get("cf-turnstile-response") || "" }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) {
      (out.fields || []).forEach((f) => form.querySelector(`[name="${f}"]`)?.setAttribute("aria-invalid", "true"));
      throw new Error(out.message || "The order could not be sent.");
    }
    done(form, out, customer);
  } catch (err) {
    msg.textContent = `${err.message} Please try again, or write to ${cfg.orderEmail}.`;
    btn.disabled = false;
    if (window.turnstile) window.turnstile.reset();
  }
}

function done(form, out, customer) {
  const box = document.querySelector("[data-order-done]");
  box.querySelector("[data-done-number]").textContent = out.orderNumber;
  box.querySelector("[data-done-email]").textContent = customer.email;
  box.querySelector("[data-done-next]").textContent = out.payment === "deposit"
    ? `Within two working days we confirm your order by email, with the invoice for the deposit of ${chf(out.deposit)}.`
    : `Within two working days we confirm your order by email, with the invoice of ${chf(out.total)}.`;
  box.querySelector("[data-done-list]").innerHTML = out.summary.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")
    + `<dt>Total</dt><dd>${chf(out.total)}</dd>`;
  form.hidden = true;
  document.querySelector("[data-order-bar]").hidden = true;
  box.hidden = false;
  box.focus();
  window.scrollTo({ top: Math.max(0, box.getBoundingClientRect().top + scrollY - 120) });
  requestId = crypto.randomUUID();
}

const orderForm = document.querySelector("[data-order]");
if (orderForm) init(orderForm);
