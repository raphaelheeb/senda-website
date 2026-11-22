// Fit calculator: plausibility checks over typical riders.
import { test } from "node:test";
import assert from "node:assert/strict";
import cfg from "../src/_data/configurator.json" with { type: "json" };
import { fitVent } from "../src/scripts/fit.js";

const v = cfg.vent;
const ids = v.sizes.map((s) => s.id);
const rider = (h, legs = 0.47, arms = 0.38) => ({ height: h, inseam: +(h * legs).toFixed(1), arm: +(h * arms).toFixed(1) });

test("average 178 cm rider: M or L, stem 100–120", () => {
  const r = fitVent(v, rider(178), "race");
  assert.ok(r.ok);
  assert.ok(["M", "L"].includes(r.size), r.size);
  assert.ok(+r.stem >= 100 && +r.stem <= 120, r.stem);
  assert.equal(r.crank, "172.5");
  assert.ok(r.saddleHeight > 720 && r.saddleHeight < 760);
});

test("taller riders never get a smaller frame", () => {
  let last = -1;
  for (let h = 158; h <= 196; h += 2) {
    const r = fitVent(v, rider(h), "race");
    assert.ok(r.ok, `${h}: ${r.reason}`);
    const i = ids.indexOf(r.size);
    assert.ok(i >= last, `${h} cm got ${r.size}`);
    last = i;
  }
});

test("relaxed: same size or one up, stem not longer, more spacers", () => {
  for (let h = 160; h <= 194; h += 2) {
    const race = fitVent(v, rider(h), "race");
    const relaxed = fitVent(v, rider(h), "relaxed");
    const d = ids.indexOf(relaxed.size) - ids.indexOf(race.size);
    assert.ok(d === 0 || d === 1, `${h}: ${race.size} -> ${relaxed.size}`);
    if (d === 0) {
      assert.ok(+relaxed.stem <= +race.stem, `${h}: stem ${race.stem} -> ${relaxed.stem}`);
      assert.ok(+relaxed.spacers >= +race.spacers, `${h}: spacers`);
    }
  }
});

test("every result is an option the configurator offers", () => {
  for (const pos of ["race", "relaxed"]) for (let h = 158; h <= 196; h += 3) {
    const r = fitVent(v, rider(h, 0.46, 0.39), pos);
    if (!r.ok) continue;
    assert.ok(ids.includes(r.size));
    assert.ok(v.stems.includes(r.stem) && v.spacers.includes(r.spacers) && v.bars.includes(r.bar) && v.cranks.includes(r.crank));
  }
});

test("implausible or out-of-range measurements are refused", () => {
  assert.equal(fitVent(v, { height: 120, inseam: 55, arm: 45 }).reason, "height");
  assert.equal(fitVent(v, { height: 178, inseam: 120, arm: 67 }).reason, "inseam");
  assert.equal(fitVent(v, { height: 178, inseam: 84, arm: 20 }).reason, "arm");
  assert.equal(fitVent(v, { height: 150, inseam: 66, arm: 57 }).reason, "standover");
});

test("shoulder width picks the nearest bar", () => {
  assert.equal(fitVent(v, { ...rider(178), shoulders: 38 }).bar, "380");
  assert.equal(fitVent(v, { ...rider(178), shoulders: 43 }).bar, "400");
  assert.equal(fitVent(v, rider(178)).bar, "400");
});
