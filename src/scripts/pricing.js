// Price and validation logic shared by the configurator (browser) and the
// order endpoint (Cloudflare Worker). The worker is the authority: it runs
// this with the configurator data file and ignores any price the browser sends.

/** Today's date in Zurich as "YYYY-MM-DD". */
export function zurichDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/** True while an offer runs; `until` is inclusive (Zurich date). */
export function offerActive(until, now = new Date()) {
  return Boolean(until) && zurichDate(now) <= until;
}

const ids = (list) => list.map((x) => (typeof x === "string" ? x : x.id));
const find = (list, id) => list.find((x) => (typeof x === "string" ? x : x.id) === id);
const label = (list, id) => {
  const x = find(list, id);
  return typeof x === "string" ? x : x && x.label;
};

export const VENT_FIELDS = [
  "size", "finish", "groupset", "crank", "chainring", "cassette",
  "rimFront", "rimRear", "bar", "stem", "spacers", "tyre",
];

/** Option lists per field, read from the data file. */
export function ventOptions(vent) {
  return {
    size: ids(vent.sizes), finish: ids(vent.finishes), groupset: ids(vent.groupsets),
    crank: vent.cranks, chainring: ids(vent.chainrings), cassette: ids(vent.cassettes),
    rimFront: vent.rims, rimRear: vent.rims, bar: vent.bars, stem: vent.stems,
    spacers: vent.spacers, tyre: ids(vent.tyres),
  };
}

/** Starting selection for a size: the size's defaults, then the first option. */
export function ventDefaults(vent, sizeId) {
  const size = find(vent.sizes, sizeId) || vent.sizes[Math.floor(vent.sizes.length / 2)];
  const opts = ventOptions(vent);
  const sel = {};
  for (const f of VENT_FIELDS) sel[f] = opts[f][0];
  Object.assign(sel, {
    size: size.id, groupset: vent.defaultGroupset || sel.groupset,
    crank: size.defaults.crank, bar: size.defaults.bar, stem: size.defaults.stem,
    rimFront: vent.rims[0], rimRear: vent.rims[vent.rims.length - 1], spacers: "15", tyre: "30",
  });
  for (const f of VENT_FIELDS) if (!opts[f].includes(sel[f])) sel[f] = opts[f][0];
  return sel;
}

/**
 * Validates a SENDA Vent selection and prices it.
 * Returns { ok, errors[], lines[], subtotal, discount, shipping, total, deposit, balance, code, summary[] }.
 */
export function priceVent(cfg, sel, now = new Date()) {
  const vent = cfg.vent;
  const opts = ventOptions(vent);
  const errors = [];
  for (const f of VENT_FIELDS) {
    if (!sel || !opts[f].includes(String(sel[f]))) errors.push(f);
  }
  if (errors.length) return { ok: false, errors };

  const groupset = find(vent.groupsets, sel.groupset);
  const finish = find(vent.finishes, sel.finish);
  const base = groupset.price + (finish.surcharge || 0);
  const early = offerActive(vent.earlyBird.until, now);
  const discount = early ? vent.earlyBird.discount : 0;
  const shipping = vent.shipping ?? cfg.shipping.price;
  const total = base - discount + shipping;
  const deposit = Math.round(((base - discount) * vent.deposit.percent) / 100);

  const size = find(vent.sizes, sel.size);
  const summary = [
    ["Frame size", `${size.label} (${size.cm} cm)`],
    ["Colour", `${finish.label}, ${finish.surface.toLowerCase()}`],
    ["Groupset", groupset.label],
    ["Crank length", `${sel.crank} mm`],
    ["Chainrings", label(vent.chainrings, sel.chainring)],
    ["Cassette", label(vent.cassettes, sel.cassette)],
    ["Wheels", `ORMA Momentum ${sel.rimFront} front / ${sel.rimRear} rear`],
    ["Handlebar width", `${sel.bar} mm`],
    ["Stem length", `${sel.stem} mm`],
    ["Spacers", `${sel.spacers} mm`],
    ["Tyres", `${vent.tyreModel}, ${label(vent.tyres, sel.tyre)}`],
  ];
  const lines = [[`${vent.name}, ${groupset.label}`, base]];
  if (discount) lines.push([vent.earlyBird.label, -discount]);
  lines.push([cfg.shipping.label, shipping]);

  const code = [
    vent.code, sel.size, sel.finish, sel.groupset, sel.crank, sel.chainring, sel.cassette,
    `${sel.rimFront}/${sel.rimRear}`, sel.bar, sel.stem, sel.spacers, sel.tyre,
  ].join("-");

  return {
    ok: true, errors: [], product: "vent", lines, summary, code,
    subtotal: base, discount, shipping, total, deposit, balance: total - deposit,
    payment: "deposit", depositPercent: vent.deposit.percent, delivery: vent.delivery,
  };
}

export const MOMENTUM_FIELDS = ["rimFront", "rimRear", "freehub"];

/** Validates and prices an ORMA Momentum wheelset (paid in full). */
export function priceMomentum(cfg, sel, now = new Date()) {
  const m = cfg.momentum;
  const allowed = { rimFront: m.rims, rimRear: m.rims, freehub: ids(m.freehubs) };
  const errors = MOMENTUM_FIELDS.filter((f) => !sel || !allowed[f].includes(String(sel[f])));
  if (errors.length) return { ok: false, errors };
  const early = offerActive(m.earlyBird.until, now);
  const discount = early ? m.price - m.earlyBird.price : 0;
  const shipping = m.shipping ?? cfg.shipping.price;
  const total = m.price - discount + shipping;
  const hub = find(m.freehubs, sel.freehub);
  const lines = [[`${m.name} ${sel.rimFront}/${sel.rimRear}`, m.price]];
  if (discount) lines.push([m.earlyBird.label, -discount]);
  lines.push([cfg.shipping.label, shipping]);
  return {
    ok: true, errors: [], product: "momentum", lines,
    summary: [["Rim depth", `${sel.rimFront} mm front / ${sel.rimRear} mm rear`], ["Freehub", hub.label]],
    code: `${m.code}-${sel.rimFront}/${sel.rimRear}-${sel.freehub}`,
    subtotal: m.price, discount, shipping, total, deposit: total, balance: 0,
    payment: "full", delivery: m.delivery,
  };
}

/** Defaults for an ORMA Momentum order. */
export function momentumDefaults(m) {
  return { rimFront: m.rims[0], rimRear: m.rims[m.rims.length - 1], freehub: ids(m.freehubs)[0] };
}

export function priceOrder(cfg, product, sel, now) {
  if (product === "vent") return priceVent(cfg, sel, now);
  if (product === "momentum") return priceMomentum(cfg, sel, now);
  return { ok: false, errors: ["product"] };
}

/** "5400" -> "CHF 5,400"; negative values keep the minus sign. */
export function chf(n) {
  const s = Math.abs(n).toLocaleString("en-US");
  return `${n < 0 ? "−" : ""}CHF ${s}`;
}
