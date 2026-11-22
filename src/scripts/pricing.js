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
  "rimFront", "rimRear", "bar", "stem", "tyre",
];

/** Option lists per field, read from the data file. */
export function ventOptions(vent) {
  return {
    size: ids(vent.sizes), finish: ids(vent.finishes), groupset: ids(vent.groupsets),
    crank: vent.cranks, chainring: ids(vent.chainrings), cassette: ids(vent.cassettes),
    rimFront: vent.rims, rimRear: vent.rims, bar: vent.bars, stem: vent.stems,
    tyre: ids(vent.tyres),
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
    rimFront: vent.rims[0], rimRear: vent.rims[vent.rims.length - 1], tyre: ids(vent.tyres)[0],
  });
  for (const f of VENT_FIELDS) if (!opts[f].includes(sel[f])) sel[f] = opts[f][0];
  return sel;
}

/** Labels for summaries, price lines and emails, per language. */
export const WORDS = {
  en: {
    size: "Frame size", colour: "Colour", groupset: "Groupset", crank: "Crank length", chainrings: "Chainrings",
    cassette: "Cassette", wheels: "Wheels", wheelsValue: "ORMA Momentum {f} front / {r} rear", bar: "Handlebar width",
    stem: "Stem length", spacers: "Spacers", tyres: "Tyres", rim: "Rim depth", rimValue: "{f} mm front / {r} mm rear",
    freehub: "Freehub", shipping: "Shipping within Switzerland", early: "Early-order discount", intro: "Introductory price",
    surface: { Glossy: "glossy", Satin: "satin", Pearl: "pearl", Matte: "matte" },
    chainringLabels: { "50-34": "50-34 (compact)", "52-36": "52-36 (semi-compact)" },
  },
  de: {
    size: "Rahmengrösse", colour: "Farbe", groupset: "Schaltgruppe", crank: "Kurbellänge", chainrings: "Kettenblätter",
    cassette: "Kassette", wheels: "Laufräder", wheelsValue: "ORMA Momentum {f} vorne / {r} hinten", bar: "Lenkerbreite",
    stem: "Vorbaulänge", spacers: "Spacer", tyres: "Reifen", rim: "Felgenhöhe", rimValue: "{f} mm vorne / {r} mm hinten",
    freehub: "Freilauf", shipping: "Versand innerhalb der Schweiz", early: "Frühbestellrabatt", intro: "Einführungspreis",
    surface: { Glossy: "glänzend", Satin: "seidenmatt", Pearl: "Perlmutt", Matte: "matt" },
    chainringLabels: { "50-34": "50-34 (Kompakt)", "52-36": "52-36 (Semi-Kompakt)" },
  },
};
const words = (lang) => WORDS[lang] || WORDS.en;

/**
 * Validates a SENDA Vent selection and prices it.
 * Returns { ok, errors[], lines[], subtotal, discount, shipping, total, deposit, balance, code, summary[] }.
 */
export function priceVent(cfg, sel, now = new Date(), lang = "en") {
  const w = words(lang);
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
    [w.size, `${size.label} (${size.cm} cm)`],
    [w.colour, `${finish.label}, ${w.surface[finish.surface] || finish.surface.toLowerCase()}`],
    [w.groupset, groupset.label],
    [w.crank, `${sel.crank} mm`],
    [w.chainrings, w.chainringLabels[sel.chainring] || label(vent.chainrings, sel.chainring)],
    [w.cassette, label(vent.cassettes, sel.cassette)],
    [w.wheels, w.wheelsValue.replace("{f}", sel.rimFront).replace("{r}", sel.rimRear)],
    [w.bar, `${sel.bar} mm`],
    [w.stem, `${sel.stem} mm`],
    [w.tyres, `${vent.tyreModel}, ${label(vent.tyres, sel.tyre)}`],
  ];
  const lines = [[`${vent.name}, ${groupset.label}`, base]];
  if (discount) lines.push([w.early, -discount]);
  lines.push([w.shipping, shipping]);

  const code = [
    vent.code, sel.size, sel.finish, sel.groupset, sel.crank, sel.chainring, sel.cassette,
    `${sel.rimFront}/${sel.rimRear}`, sel.bar, sel.stem, sel.tyre,
  ].join("-");

  return {
    ok: true, errors: [], product: "vent", lines, summary, code,
    subtotal: base, discount, shipping, total, deposit, balance: total - deposit,
    payment: "deposit", depositPercent: vent.deposit.percent, delivery: vent.delivery,
  };
}

export const MOMENTUM_FIELDS = ["rimFront", "rimRear", "freehub"];

/** Validates and prices an ORMA Momentum wheelset (paid in full). */
export function priceMomentum(cfg, sel, now = new Date(), lang = "en") {
  const w = words(lang);
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
  if (discount) lines.push([w.intro, -discount]);
  lines.push([w.shipping, shipping]);
  return {
    ok: true, errors: [], product: "momentum", lines,
    summary: [[w.rim, w.rimValue.replace("{f}", sel.rimFront).replace("{r}", sel.rimRear)], [w.freehub, hub.label]],
    code: `${m.code}-${sel.rimFront}/${sel.rimRear}-${sel.freehub}`,
    subtotal: m.price, discount, shipping, total, deposit: total, balance: 0,
    payment: "full", delivery: m.delivery,
  };
}

/** Defaults for an ORMA Momentum order. */
export function momentumDefaults(m) {
  return { rimFront: m.rims[0], rimRear: m.rims[m.rims.length - 1], freehub: ids(m.freehubs)[0] };
}

export function priceOrder(cfg, product, sel, now, lang = "en") {
  if (product === "vent") return priceVent(cfg, sel, now, lang);
  if (product === "momentum") return priceMomentum(cfg, sel, now, lang);
  return { ok: false, errors: ["product"] };
}

/** Swiss format with apostrophe: 5400 -> "CHF 5’400"; negative values keep the minus sign. */
export const thousands = (n) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, "’");
export function chf(n) {
  const s = thousands(n);
  return `${n < 0 ? "−" : ""}CHF ${s}`;
}
