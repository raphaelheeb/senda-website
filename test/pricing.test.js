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

test("Vent Ultegra early bird: 6300 - 500 + 50 shipping, 20% deposit on the bike", () => {
  const r = priceVent(cfg, ventDefaults(cfg.vent, "M"), during);
  assert.equal(r.ok, true);
  assert.equal(r.total, 5850);
  assert.equal(r.deposit, 1160);
  assert.equal(r.balance, 4690);
});

test("Vent prices per groupset, with and without early bird", () => {
  for (const [g, full] of [["105", 5400], ["ULT", 6300], ["DA", 7900]]) {
    const sel = { ...ventDefaults(cfg.vent, "L"), groupset: g };
    assert.equal(priceVent(cfg, sel, during).total, full - 500 + 50);
    assert.equal(priceVent(cfg, sel, after).total, full + 50);
  }
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
  assert.equal(priceVent(cfg, sel, after).total, 6350);
});

test("article code carries every choice", () => {
  const r = priceVent(cfg, ventDefaults(cfg.vent, "M"), during);
  assert.equal(r.code, "VENT-M-SLATE-ULT-172.5-50-34-11-30-45/50-400-100-15-30");
});

test("ORMA Momentum: paid in full, mixed rims, intro price", () => {
  const r = priceMomentum(cfg, { rimFront: "45", rimRear: "50" }, during);
  assert.equal(r.total, 1000);
  assert.equal(r.deposit, r.total);
  assert.equal(priceMomentum(cfg, { rimFront: "45", rimRear: "50" }, after).total, 1100);
  assert.equal(priceMomentum(cfg, { rimFront: "60", rimRear: "50" }).ok, false);
});
