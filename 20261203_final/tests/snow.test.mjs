// M2.5: snow and tracks (rules S1-S3, T1-T2, semantic model §4.2, §15 item 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeSnow, HINDRANCE_CM, PLOWED_CM } from '../src/sim/snow.js';
import { makeStorm, localSeconds } from '../src/sim/storm.js';
import { makeTestWorld } from './helpers.mjs';

const storm = makeStorm(JSON.parse(readFileSync(new URL('../data/baked/storm-2016-01.json', import.meta.url), 'utf8')));
// one open lawn cell, one under evergreen crowns, one sheltered (openness 0.1)
function smallWorld() {
  const w = makeTestWorld(['....']);
  // openness already includes the canopy's shelter (world.bin): full evergreen canopy -> about 0.1
  w.canopyEv[1] = 255; w.openness[1] = 25; w.openness[2] = 25; w.openness[0] = 255; w.openness[3] = 255;
  return w;
}
const run = (snow, from, to, stepMin = 10) => {
  for (let t = localSeconds(from); t <= localSeconds(to); t += stepMin * 60) snow.update(storm.at(t));
};

test('S1: at 19:00 open level ground holds about 66 cm; under evergreens 40 % of that', () => {
  const w = smallWorld(); const snow = makeSnow(w);
  snow.update(storm.at(localSeconds('2016-01-23T19:00')));
  assert.ok(Math.abs(snow.depth[0] - 66) < 1.5, `open ${snow.depth[0]}`);
  assert.ok(Math.abs(snow.depth[1] / snow.depth[0] - 0.4) < 1e-6);
});

test('S1: drift follows the wind direction (lee doubles, exposed halves)', () => {
  const w = smallWorld();
  w.drift.N[0] = 200; w.drift.NE[0] = 50; // lee for a north wind, exposed for a north-east wind
  const snow = makeSnow(w);
  const s = storm.at(localSeconds('2016-01-23T19:00'));
  snow.update({ ...s, windFromDeg: 0 }); const lee = snow.depth[0];
  snow.update({ ...s, windFromDeg: 45 }); const exposed = snow.depth[0];
  snow.update({ ...s, windFromDeg: 22.5 }); const between = snow.depth[0];
  assert.ok(Math.abs(lee / exposed - 4) < 1e-6);
  assert.ok(Math.abs(between - (lee + exposed) / 2) < 1e-4);
});

test('S2 and S3: deep snow is a hindrance; plowed cells hold 5 cm', () => {
  const w = smallWorld(); const snow = makeSnow(w);
  snow.plowed[3] = 1;
  snow.update(storm.at(localSeconds('2016-01-23T19:00')));
  assert.ok(snow.isHindrance(0) && snow.depth[0] > HINDRANCE_CM);
  assert.equal(snow.depth[3], PLOWED_CM);
  assert.ok(!snow.isHindrance(3));
});

test('T1-T2: tracks fill fastest in the open in a strong wind, slowest under evergreens', () => {
  const w = smallWorld(); const snow = makeSnow(w);
  run(snow, '2016-01-23T08:00', '2016-01-23T09:00'); // heavy snow, NE wind 13-20 kt
  const t = localSeconds('2016-01-23T09:00');
  const qOpen = snow.step(0, t, 0, 90); const qEv = snow.step(1, t, 0, 90); const qShel = snow.step(2, t, 0, 90);
  assert.equal(snow.readability(qOpen), 1);
  run(snow, '2016-01-23T09:02', '2016-01-23T09:10', 2); // 10 minutes of heavy snow
  const rOpen = snow.readability(qOpen); const rEv = snow.readability(qEv); const rShel = snow.readability(qShel);
  assert.ok(rOpen < rShel && rShel < rEv, `open ${rOpen.toFixed(2)} < sheltered ${rShel.toFixed(2)} < evergreen ${rEv.toFixed(2)}`);
  assert.equal(snow.track(snow.trackAt(0)).cell, 0);
});

test('§15 item 2: at 19:00 a track in the open fills within about 20-30 minutes; under evergreens it lasts much longer', () => {
  const w = smallWorld(); w.openness[0] = 255; const snow = makeSnow(w);
  run(snow, '2016-01-23T18:30', '2016-01-23T19:00', 1);
  const t0 = localSeconds('2016-01-23T19:00');
  const qOpen = snow.step(0, t0, 0, 0); const qEv = snow.step(1, t0, 0, 0);
  let gone = null;
  for (let m = 1; m <= 120; m++) { snow.update(storm.at(t0 + m * 60)); if (gone === null && snow.readability(qOpen) === 0) gone = m; }
  assert.ok(gone !== null && gone >= 20 && gone <= 30, `the open track is gone after ${gone} min`);
  assert.ok(snow.readability(qEv) > 0, 'the track under evergreens is still readable after 2 h');
});

test('the track buffer wraps and forgets the oldest steps', () => {
  const w = makeTestWorld(['....']); const snow = makeSnow(w, { capacity: 4 });
  snow.update(storm.at(localSeconds('2016-01-23T19:00')));
  for (let q = 0; q < 6; q++) snow.step(q % 4, q, 0, 0);
  assert.equal(snow.trackCount, 4);
  for (let k = 0; k < 4; k++) assert.ok(snow.trackAt(k) >= 0);
});
