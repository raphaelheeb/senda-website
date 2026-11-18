// Fit calculator for the SENDA Vent configurator.
//
// From height, inseam, arm length (and optionally shoulder width) and a riding
// position it places a rider on the bike and finds the frame size, stem length
// and spacer stack whose hoods land closest to where the rider's hands want to be.
//
// Model (all in mm, origin at the bottom bracket, x forward, y up):
//   saddle   = saddle height along the seat tube (inseam × factor)
//   hip      = saddle + offset
//   shoulder = hip + torso length at the position's torso angle
//   hands    = shoulder + arm length, rotated by the shoulder angle
//   hoods    = frame stack/reach + headset + spacers along the steerer + stem + bar offset
// Every number comes from the `fit` block in configurator.json, so it can be tuned
// without touching code. The result is a starting point, not a fitting.

const rad = (d) => (d * Math.PI) / 180;
const pick = (table, value) => table.reduce((out, [min, v]) => (value >= min ? v : out), table[0][1]);

/** Where the rider's hoods want to be, and the saddle, for one frame size. */
export function riderTarget(fit, body, position, seatAngle) {
  const p = fit.positions[position];
  const saddleHeight = body.inseam * fit.saddleHeightFactor;
  const saddle = [-saddleHeight * Math.cos(rad(seatAngle)), saddleHeight * Math.sin(rad(seatAngle))];
  const hip = [saddle[0] + fit.hipFromSaddle[0], saddle[1] + fit.hipFromSaddle[1]];
  const torso = body.height * fit.shoulderHeightFactor - (body.inseam + body.height * fit.hipAboveCrotchFactor);
  const shoulder = [hip[0] + torso * Math.cos(rad(p.torsoAngle)), hip[1] + torso * Math.sin(rad(p.torsoAngle))];
  const arm = body.arm * (p.armReachFactor ?? fit.armReachFactor);
  const armDir = rad(p.torsoAngle - p.shoulderAngle);
  const hands = [shoulder[0] + arm * Math.cos(armDir), shoulder[1] + arm * Math.sin(armDir)];
  return { saddleHeight, saddle, hands };
}

/** Hood position for a size, stem and spacer stack. */
export function hoodPosition(fit, size, stem, spacers) {
  const ha = rad(size.headAngle);
  const up = fit.headsetStack + spacers; // along the steerer, above the head tube
  const clamp = [size.reach - up * Math.cos(ha), size.stack + up * Math.sin(ha)];
  const stemDir = rad(90 - size.headAngle + fit.stemAngle);
  const bar = [clamp[0] + stem * Math.cos(stemDir), clamp[1] + stem * Math.sin(stemDir)];
  return [bar[0] + fit.hoodsFromBar[0], bar[1] + fit.hoodsFromBar[1]];
}

/**
 * body: { height, inseam, arm, shoulders? } in cm (as typed by the visitor).
 * Returns { ok, size, stem, spacers, bar, crank, saddleHeight, miss, alternatives } or { ok:false, reason }.
 */
export function fitVent(vent, input, position = "race") {
  const fit = vent.fit;
  const body = {
    height: Number(input.height) * 10,
    inseam: Number(input.inseam) * 10,
    arm: Number(input.arm) * 10,
    shoulders: input.shoulders ? Number(input.shoulders) * 10 : 0,
  };
  if (!(body.height >= 1450 && body.height <= 2100)) return { ok: false, reason: "height" };
  if (!(body.inseam >= 0.38 * body.height && body.inseam <= 0.55 * body.height)) return { ok: false, reason: "inseam" };
  if (!(body.arm >= 0.28 * body.height && body.arm <= 0.46 * body.height)) return { ok: false, reason: "arm" };
  if (!fit.positions[position]) return { ok: false, reason: "position" };

  const stems = vent.stems.map(Number);
  const spacers = vent.spacers.map(Number);
  const solve = (pos, base) => {
    const results = [];
    vent.sizes.forEach((size, i) => {
      // A frame you cannot stand over is out, whatever the reach.
      if (size.standover > body.inseam - fit.standoverClearance) return;
      // A relaxed position comes from spacers and stem first: at most one size up from the race fit.
      if (base !== undefined && (i < base || i > base + 1)) return;
      const t = riderTarget(fit, body, pos, size.seatAngle);
      let best = null;
      for (const stem of stems) {
        for (const sp of spacers) {
          const h = hoodPosition(fit, size, stem, sp);
          const miss = Math.hypot(h[0] - t.hands[0], h[1] - t.hands[1]);
          // Small preference for a mid-length stem, a moderate spacer stack and the race-fit size.
          const score = miss
            + fit.stemWeight * Math.abs(stem - fit.preferredStem)
            + fit.spacerWeight * sp
            + (base !== undefined ? fit.sizeStepWeight * (i - base) : 0);
          if (!best || score < best.score) best = { index: i, size: size.id, stem, spacers: sp, miss, score, saddleHeight: t.saddleHeight };
        }
      }
      results.push(best);
    });
    return results.sort((a, b) => a.score - b.score);
  };
  const race = solve("race");
  const results = position === "race" || !race.length ? race : solve(position, race[0].index);
  if (!results.length) return { ok: false, reason: "standover" };
  results.sort((a, b) => a.score - b.score);
  const top = results[0];

  const barTable = fit.barByHeight;
  let bar = pick(barTable, body.height);
  if (body.shoulders) {
    bar = vent.bars.reduce((b, x) => (Math.abs(Number(x) - body.shoulders) < Math.abs(Number(b) - body.shoulders) ? x : b), vent.bars[0]);
  }
  return {
    ok: true,
    size: top.size,
    stem: String(top.stem),
    spacers: String(top.spacers),
    bar: String(bar),
    crank: String(pick(fit.crankByInseam, body.inseam)),
    saddleHeight: Math.round(top.saddleHeight / 5) * 5,
    miss: Math.round(top.miss),
    // Within 10 mm of the best fit: worth mentioning ("between M and L").
    alternatives: results.slice(1).filter((r) => r.score - top.score < 10).map((r) => r.size),
  };
}
