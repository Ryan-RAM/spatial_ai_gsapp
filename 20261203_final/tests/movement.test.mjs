// M2.7: movement, sharing space and the end of a round (rules M1-M3, C1-C3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/sim/config.js';
import { makeWalker } from '../src/sim/paths.js';
import { makeOccupancy, advance, catches, escapes, roundOver, WAIT_LIMIT_S } from '../src/sim/movement.js';
import { makeSnow } from '../src/sim/snow.js';
import { makeTestWorld } from './helpers.mjs';

const CORRIDOR = ['=============================='];
function setup(rows, opts) {
  const world = makeTestWorld(rows, opts);
  return { world, survivor: makeWalker(world, 'survivor', CONFIG), creature: makeWalker(world, 'creature', CONFIG), occupancy: makeOccupancy(world) };
}
const agent = (id, kind, cell, route) => ({ id, kind, cell, heading: 90, running: false, route, routeIdx: 0, carry: 0, waited: 0 });
const tick = (a, s, walker, extra = {}) => advance(a, { world: s.world, walker, occupancy: s.occupancy, snow: extra.snow ?? null, t: extra.t ?? 0, dt: CONFIG.tickSeconds, config: CONFIG, sounds: extra.sounds });

test('walking pace: 3 m at 1.3 m/s takes about 2.3 s, so a cell every tick or two; running doubles it', () => {
  const s = setup(CORRIDOR);
  const walk = agent(0, 'survivor', 0, Array.from({ length: 30 }, (_, k) => k)); s.occupancy.put(0, 0);
  const run = { ...agent(1, 'survivor', 0, walk.route), running: true };
  let w = 0; let r = 0;
  for (let k = 0; k < 10; k++) { w += tick(walk, s, s.survivor); }
  const s2 = setup(CORRIDOR); s2.occupancy.put(1, 0);
  for (let k = 0; k < 10; k++) { r += tick(run, s2, s2.survivor); }
  assert.ok(Math.abs(w - 20 / (3 / 1.3)) <= 1, `walked ${w} cells in 20 s`);
  assert.ok(r >= 2 * w - 1 && r <= 2 * w + 1, `ran ${r} cells, walked ${w}`);
});

test('M1: one agent per cell; a blocked agent waits, then asks for a new plan after 3 s', () => {
  const s = setup(CORRIDOR);
  const a = agent(0, 'survivor', 2, [2, 3, 4]); const b = agent(1, 'survivor', 3, [3]);
  s.occupancy.put(0, 2); s.occupancy.put(1, 3);
  tick(a, s, s.survivor);
  assert.equal(a.cell, 2); assert.ok(!a.needsPlan);
  tick(a, s, s.survivor);
  assert.ok(a.waited >= WAIT_LIMIT_S && a.needsPlan);
  assert.equal(s.occupancy.at(3), 1);
});

test('M2: each kind enters only its own walk graph', () => {
  const s = setup(['==t==']);
  const sv = agent(0, 'survivor', 1, [1, 2, 3]); s.occupancy.put(0, 1);
  tick(sv, s, s.survivor);
  assert.equal(sv.cell, 1); assert.ok(sv.needsPlan, 'the survivor cannot step into the thicket');
  const cr = agent(1, 'creature', 1, [1, 2, 3]); const s2 = setup(['==t==']); s2.occupancy.put(1, 1);
  for (let k = 0; k < 4; k++) tick(cr, s2, s2.creature);
  assert.equal(cr.cell, 3);
});

test('M3 and S2: steps leave tracks and sounds; walking is quieter, deep snow louder', () => {
  const s = setup(CORRIDOR); const snow = makeSnow(s.world); const sounds = [];
  snow.update({ t: 0, cumSnowCm: 66, windMs: 0, windFromDeg: 0 });
  const a = agent(0, 'survivor', 0, [0, 1, 2, 3]); s.occupancy.put(0, 0);
  // in 66 cm of snow a step takes 3 / (1.3 x 0.27) = 8.5 s: a few ticks
  for (let k = 0; k < 6 && !sounds.length; k++) tick(a, s, s.survivor, { snow, sounds });
  assert.ok(sounds.length >= 1 && snow.trackCount === sounds.length);
  assert.equal(sounds[0].kind, 'step');
  assert.equal(sounds[0].extraM, CONFIG.walkQuietM - 5, 'walking in 66 cm of snow: 18 m quieter, 5 m louder');
  const b = { ...agent(1, 'survivor', 0, [0, 1, 2, 3]), running: true }; const s2 = setup(CORRIDOR); s2.occupancy.put(1, 0); const loud = [];
  tick(b, s2, s2.survivor, { sounds: loud });
  assert.equal(loud[0].kind, 'run'); assert.equal(loud[0].extraM, 0);
  assert.ok(snow.track(snow.trackAt(a.cell)).heading === 90, 'heading east');
});

test('C1: caught on the same or a neighbouring cell, never through a wall', () => {
  const s = setup(['...', '.#.', '...']);
  assert.ok(catches(s.world, 0, 1)); assert.ok(catches(s.world, 0, 0)); assert.ok(catches(s.world, 0, 3));
  assert.ok(!catches(s.world, 0, 2), 'two cells away');
  const wall = setup(['=#=']);
  assert.ok(!catches(wall.world, 0, 2));
  const thin = makeTestWorld(['..'], { trees: [{ x: 3, y: 1.5, h: 10, trunk: 0.5 }] });
  assert.ok(!catches(thin, 0, 1), 'a trunk exactly between them blocks the grab');
});

test('C2 and C3: escape on an exit cell; the round ends when nobody is left or time runs out', () => {
  const exits = new Set([9]);
  assert.ok(escapes(exits, 9)); assert.ok(!escapes(exits, 8));
  const sv = [{ outcome: null }, { outcome: 'caught' }];
  assert.ok(!roundOver(sv, 10, 900)); assert.ok(roundOver(sv, 900, 900));
  sv[0].outcome = 'escaped'; assert.ok(roundOver(sv, 10, 900));
});
