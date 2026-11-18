// Order pages: keeps the selection, shows the live price and sends the order.
// The price shown here is for the visitor only; the server recalculates it.
import { priceOrder, ventDefaults, chf } from "./pricing.js";

const form = document.querySelector("[data-order]");
if (form) init(form);

function init(form) {
  const product = form.dataset.order;
  const cfg = JSON.parse(document.getElementById("order-config").textContent);
  const imgData = document.getElementById("order-images");
  const images = imgData ? JSON.parse(imgData.textContent) : {};
  const $ = (sel) => form.querySelector(sel);
  const radios = (name) => form.querySelectorAll(`input[type=radio][name="${name}"]`);
  const fields = product === "vent"
    ? ["size", "finish", "groupset", "crank", "chainring", "cassette", "rimFront", "rimRear", "bar", "stem", "spacers", "tyre"]
    : ["rimFront", "rimRear"];

  // Restore a selection from the address bar (shareable links), else defaults.
  const params = new URLSearchParams(location.search);
  let sel = product === "vent"
    ? ventDefaults(cfg.vent, params.get("size") || "M")
    : { rimFront: cfg.momentum.rims[0], rimRear: cfg.momentum.rims[cfg.momentum.rims.length - 1] };
  for (const f of fields) if (params.get(f)) sel[f] = params.get(f);

  const defaults = () => product === "vent"
    ? ventDefaults(cfg.vent, "M")
    : { rimFront: cfg.momentum.rims[0], rimRear: cfg.momentum.rims[cfg.momentum.rims.length - 1] };
  if (!priceOrder(cfg, product, sel).ok) sel = defaults();

  const apply = () => {
    for (const f of fields) radios(f).forEach((r) => { r.checked = r.value === String(sel[f]); });
  };

  const render = () => {
    const r = priceOrder(cfg, product, sel);
    if (!r.ok) { sel = defaults(); apply(); return render(); }
    $("[data-summary-list]").innerHTML = r.summary.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
    $("[data-summary-lines]").innerHTML = r.lines.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${chf(v)}</dd>`).join("");
    $("[data-summary-total]").textContent = chf(r.total);
    $("[data-summary-pay]").textContent = r.payment === "deposit"
      ? `Deposit ${r.depositPercent}%: ${chf(r.deposit)} by invoice after your order. Balance ${chf(r.balance)} before delivery.`
      : `Paid in full by invoice after your order.`;
    if (product === "vent") {
      const finish = cfg.vent.finishes.find((x) => x.id === sel.finish);
      const img = images[finish.label];
      const el = $("[data-summary-img]");
      const note = $("[data-summary-imgnote]");
      if (img) { el.src = img; note.hidden = true; }
      else { el.src = "/assets/img/web/road-toni-studio-1000.jpg"; note.hidden = false; note.textContent = `Shown in Slate Blue. Your bike comes in ${finish.label}.`; }
      // Early-order price beside each groupset
      if (r.discount) for (const g of cfg.vent.groupsets) {
        const m = form.querySelector(`[data-groupset-price="${g.id}"]`);
        if (m) m.innerHTML = `<s>${chf(g.price)}</s> ${chf(g.price - r.discount)}`;
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
      // A new size brings its suggested cockpit and crank; colour and parts stay.
      const d = ventDefaults(cfg.vent, t.value);
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
    if (!cm) { out.textContent = ""; return; }
    const fits = cfg.vent.sizes.filter((s) => cm >= s.height[0] && cm <= s.height[1]);
    if (!fits.length) { out.textContent = "Outside our size range. Write to us and we look at it together."; return; }
    out.innerHTML = fits.length > 1
      ? `Between ${fits.map((s) => s.label).join(" and ")}. Write to us if unsure. `
      : `Suggested size: ${fits[0].label}. `;
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "linkline"; btn.textContent = `Use ${fits[0].label}`;
    btn.addEventListener("click", () => { const r = [...radios("size")].find((x) => x.value === fits[0].id); r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); });
    out.appendChild(btn);
  });

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

  const missing = [...form.querySelectorAll("#details [required]")].filter((el) => !el.checkValidity());
  if (missing.length || !terms) {
    msg.textContent = !terms && !missing.length ? "Please accept the order terms." : "Please fill in the marked fields.";
    missing.forEach((el) => el.setAttribute("aria-invalid", "true"));
    (missing[0] || form.querySelector("[name=terms]")).focus();
    return;
  }
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
  const token = data.get("cf-turnstile-response") || "";

  btn.disabled = true;
  msg.textContent = "Sending your order…";
  try {
    const res = await fetch("/api/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId, product, selection: getSel(), customer, terms, turnstileToken: token }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) throw new Error(out.message || "The order could not be sent.");
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
  box.hidden = false;
  box.focus();
  window.scrollTo({ top: box.getBoundingClientRect().top + scrollY - 120 });
  requestId = crypto.randomUUID();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
