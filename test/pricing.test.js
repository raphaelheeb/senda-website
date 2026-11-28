import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { priceVent, priceMomentum, ventDefaults, offerActive, zurichDate } from "../src/scripts/pricing.js";

const cfg = JSON.parse(readFileSync(new URL("../src/_data/configurator.json", import.meta.url)));
const during = new Date("2026-12-31T22:30:00Z"); // 23:30 in Zurich, last day of the offer
const after = new Date("2026-12-31T23:30:00Z");  // 00:30 on 1 January in Zurich

test("offer end is inclusive and uses Zurich time", () => {
  assert.equal(zurichDate(during), "2026-12-31");
  assert.equal(zurichDate(after), "2027-01-01");
  assert.equal(offerActive("2026-12-31", during), true);
  assert.equal(offerActive("2026-12-31", after), false);
});

test("Vent Ultegra Di2: CHF 6'350 list - 400 introductory discount, shipping included, 30% deposit", () => {
  const r = priceVent(cfg, ventDefaults(cfg.vent, "M"));
  assert.equal(r.ok, true);
  assert.equal(r.total, 5950);
  assert.equal(r.shipping, 0);
  assert.equal(r.deposit, 1785);
  assert.equal(r.balance, 4165);
});

test("Vent prices per groupset; the discount has no end date", () => {
  for (const [g, full] of [["105", 5450], ["ULT", 6350], ["DA", 7950]]) {
    const sel = { ...ventDefaults(cfg.vent, "L"), groupset: g };
    assert.equal(priceVent(cfg, sel, during).total, full - 400);
    assert.equal(priceVent(cfg, sel, new Date("2027-06-01T10:00:00Z")).total, full - 400);
  }
});

test("power meter: + CHF 500 with Ultegra and Dura-Ace, not offered with 105", () => {
  const sel = { ...ventDefaults(cfg.vent, "M"), power: "yes" };
  assert.equal(priceVent(cfg, { ...sel, groupset: "ULT" }).total, 6450);
  assert.equal(priceVent(cfg, { ...sel, groupset: "DA" }).total, 8050);
  assert.equal(priceVent(cfg, { ...sel, groupset: "105" }).ok, false);
  assert.match(priceVent(cfg, { ...sel, groupset: "ULT" }).code, /-PM$/);
});

test("spacers: all fitted by default, fewer only on request", () => {
  const sel = ventDefaults(cfg.vent, "M");
  assert.equal(sel.spacers, "all");
  assert.equal(priceVent(cfg, { ...sel, spacers: "fewer" }).ok, true);
  assert.equal(priceVent(cfg, { ...sel, spacers: "10" }).ok, false);
});

test("defaults are valid for every size", () => {
  for (const s of cfg.vent.sizes) assert.equal(priceVent(cfg, ventDefaults(cfg.vent, s.id), during).ok, true, s.id);
});

test("unknown or missing options are rejected", () => {
  const sel = ventDefaults(cfg.vent, "M");
  assert.deepEqual(priceVent(cfg, { ...sel, stem: "150" }).errors, ["stem"]);
  assert.deepEqual(priceVent(cfg, { ...sel, groupset: "XTR" }).errors, ["groupset"]);
  const { tyre, ...noTyre } = sel;
  assert.deepEqual(priceVent(cfg, noTyre).errors, ["tyre"]);
  assert.equal(priceVent(cfg, null).ok, false);
});

test("browser-sent prices cannot change the total", () => {
  const sel = { ...ventDefaults(cfg.vent, "M"), price: 1, total: 1, discount: 6000 };
  assert.equal(priceVent(cfg, sel, after).total, 5950);
});

test("article code carries every choice", () => {
  const r = priceVent(cfg, ventDefaults(cfg.vent, "M"), during);
  assert.equal(r.code, "VENT-M-SLATE-ULT-172.5-50-34-11-30-45/50-400-100-30");
});

test("ORMA Momentum: paid in full, mixed rims, intro price, shipping included", () => {
  const r = priceMomentum(cfg, { rimFront: "45", rimRear: "50", freehub: "HG" }, during);
  assert.equal(r.total, 1080);
  assert.equal(r.shipping, 0);
  assert.equal(r.deposit, r.total);
  assert.equal(r.code, "MOM-45/50-HG");
  assert.equal(priceMomentum(cfg, { rimFront: "45", rimRear: "50", freehub: "XDR" }, after).total, 1080);
  assert.equal(priceMomentum(cfg, { rimFront: "45", rimRear: "50", freehub: "N3W" }).ok, false, "Campagnolo not offered");
  assert.equal(priceMomentum(cfg, { rimFront: "60", rimRear: "50", freehub: "HG" }).ok, false);
});
