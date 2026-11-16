// M3.4-M3.6: the survivor: drift and fixes, K3 (getting lost by d_V), warmth look-ahead to a
// shelter (§15 item 4), fleeing and hiding, calling out, closures it has seen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/sim/config.js';
import { loadWorld } from '../src/data/load-node.js';
import { makeStorm } from '../src/sim/storm.js';
import { makeRound, agentBrains } from '../src/sim/round.js';
import { survivorBrain, K3_LIKE, K3_MIN_APART_M } from '../src/sim/survivor.js';
import { newMemory } from '../src/sim/creature.js';
import { applyPlan, emptyPlan } from '../src/sim/interventions.js';
import { addLandmark } from '../src/sim/landmarks.js';
import { horizonDistance, neighbourDistance } from '../src/sim/fingerprints.js';
import { walkerFor } from '../src/sim/paths.js';
import { beliefSpeed } from '../src/sim/knowledge.js';
import { makeFrames } from '../src/sim/frames.js';

const world = loadWorld();
const storm = makeStorm(JSON.parse(readFileSync(new URL('../data/baked/storm-2016-01.json', import.meta.url), 'utf8')));
// a round whose creature sits far away (in the NE corner), so the survivors are alone
function lonely(plan = emptyPlan(), seed = 3, start = '2016-01-23T19:00') {
  const memory = newMemory(world, CONFIG); const far = world.cellOf(420, 60);
  const brains = { ...agentBrains, creatureStart: ({ occupancy }) => (occupancy.at(far) === -1 ? far : null) };
  return makeRound(world, storm, { start, zone: 'azalea-west', seed, brains, creatureMemory: memory, plan, layers: applyPlan(world, CONFIG, plan) });
}
const ctxOf = (r) => ({ world, config: CONFIG, state: r.state, weather: storm.at(r.state.t), snow: r.state.snow, walker: walkerFor(world, 'survivor', CONFIG), sounds: [] });

test('drift: without fixes the sense of east wanders; reading a sign zeroes it and gives the way out', () => {
  const r = lonely(); r.step();
  const s = r.state.agents[0]; s.drift = 0;
  const drifts = [];
  for (let t = 0; t < 300; t++) { s.drift += s.rng.normal(0, 1.2); drifts.push(Math.abs(s.drift)); }
  assert.ok(Math.max(...drifts) > 10, 'it drifts by more than 10 degrees in 10 minutes');
  // a sign right where it stands (common random numbers: the spawn does not depend on the plan)
  const P = makeFrames(world).toP(...world.center(s.cell));
  const plan = { ...emptyPlan(), signs: [{ edge: P.edge, s: P.s }] };
  const r2 = lonely(plan); const s2 = r2.state.agents[0];
  for (let t = 0; t < 4 && s2.knownExit == null; t++) { s2.heading = (t * 90) % 360; r2.step(); }
  assert.ok(s2.knownExit != null, 'it read the sign');
  assert.ok(Math.abs(s2.drift) < 3);
});

test('K3: where a far place looks like a remembered one, the survivor is fooled', () => {
  const like = K3_LIKE * neighbourDistance(world);
  // find two cells far apart that look alike from eye level
  const cells = []; for (let k = 0; k < world.n; k += 3) if ([1, 2, 3, 4].includes(world.cover[k]) && world.horizon.rowOf[k] >= 0) cells.push(k);
  let pair = null;
  for (let q = 0; q < 60000 && !pair; q++) {
    const a = cells[(q * 7919) % cells.length]; const b = cells[(q * 104729 + 17) % cells.length];
    const [ax, ay] = world.center(a); const [bx, by] = world.center(b);
    if (Math.hypot(ax - bx, ay - by) > K3_MIN_APART_M && horizonDistance(world, a, b) < like) pair = [a, b];
  }
  assert.ok(pair, 'the Ramble has places that look alike');
  const r = lonely(); r.step(); const s = r.state.agents[0];
  addLandmark(s.k, world, { type: 'junction', cell: pair[0], tick: 0 });
  r.state.occupancy.move(s.id, s.cell, pair[1]); s.cell = pair[1];
  const before = s.confusions ?? 0; r.state.tick = 10;
  survivorBrain(s, ctxOf(r));
  assert.equal((s.confusions ?? 0) - before, 1);
});

test('§15 item 4: if it would freeze before the exit, it goes to a shelter it knows and warms up', () => {
  const r = lonely(); r.step(); const s = r.state.agents[0];
  const junction = world.paths.nodes.filter((n) => n.degree >= 3).sort((a, b) => Math.hypot(a.x - world.center(s.cell)[0], a.y - world.center(s.cell)[1]) - Math.hypot(b.x - world.center(s.cell)[0], b.y - world.center(s.cell)[1]))[0];
  const plan = { ...emptyPlan(), shelters: [junction.id] };
  const r2 = lonely(plan); r2.step(); const s2 = r2.state.agents[0];
  s2.knownShelter = world.cellOf(junction.x, junction.y); s2.warmth = 8; s2.route = null;
  survivorBrain(s2, ctxOf(r2));
  assert.equal(s2.state, 'sheltering');
  assert.equal(s2.route[s2.route.length - 1], s2.knownShelter);
  // standing in it: warmth rises, it stays put
  r2.state.occupancy.move(s2.id, s2.cell, s2.knownShelter); s2.cell = s2.knownShelter;
  const w0 = s2.warmth; r2.step(); assert.ok(s2.warmth > w0 && s2.inShelter);
});

test('fleeing when it sees the creature close (running), hiding when it only hears it', () => {
  const r = lonely(); r.step(); const s = r.state.agents[0]; const c = r.state.creatures[0];
  const [sx, sy] = world.center(s.cell);
  const spot = [[0, 9], [9, 0], [-9, 0], [0, -9]].map(([dx, dy]) => world.cellOf(sx + dx, sy + dy)).find((q) => q >= 0 && r.state.occupancy.at(q) === -1);
  r.state.occupancy.move(c.id, c.cell, spot); c.cell = spot;
  const [cx, cy] = world.center(spot); s.heading = (Math.atan2(cx - sx, cy - sy) * 180 / Math.PI + 360) % 360; s.plannedAt = -99;
  survivorBrain(s, ctxOf(r));
  assert.equal(s.state, 'fleeing'); assert.ok(s.running);
  const r2 = lonely(); r2.step(); const s2 = r2.state.agents[0];
  r2.state.lastSounds = [{ origin: s2.cell, kind: 'step', by: 100, agentKind: 'creature', extraM: -25 }];
  survivorBrain(s2, ctxOf(r2));
  assert.equal(s2.state, 'hiding'); assert.equal(s2.route, null);
});

test('M3.6 calling out: a survivor who notices the creature tells its companion within 30 m', () => {
  const r = lonely(); r.step(); const [a, b] = r.state.agents;
  r.state.lastSounds = [{ origin: a.cell, kind: 'step', by: 100, agentKind: 'creature', extraM: -25 }];
  const told = b.k.threats.length; const ctx = ctxOf(r);
  survivorBrain(a, ctx);
  assert.ok(b.k.threats.length > told, 'the companion now knows where the threat is');
  assert.ok(ctx.sounds.some((snd) => snd.kind === 'cry'), 'calling out is loud');
});

test('a closure it has seen is blocked in its beliefs', () => {
  const r = lonely(); r.step(); const s = r.state.agents[0];
  const closed = new Uint8Array(world.n); closed[s.cell] = 1; s.k.seen[s.cell] = world.cover[s.cell] + 1;
  assert.equal(beliefSpeed(s.k, null, closed)(s.cell), 0);
  assert.ok(beliefSpeed(s.k, null, null)(s.cell) > 0);
});
