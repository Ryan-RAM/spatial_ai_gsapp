// M6.7: presets follow real paths and satisfy I1-I3; plans travel in the URL; plowRoute grows
// plowing toward an exit; a plowed route lets survivors escape where the empty plan does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/sim/config.js';
import { loadWorld } from '../src/data/load-node.js';
import { presets, encodePlan, decodePlan, routeToExit, nearestNode } from '../src/sim/presets.js';
import { checkPlan, routesExist, emptyPlan } from '../src/sim/interventions.js';
import { mutate } from '../src/sim/mutate.js';
import { makeRng } from '../src/sim/rng.js';
import { makeStorm } from '../src/sim/storm.js';
import { evaluatePlan } from '../src/sim/evaluate.js';

const world = loadWorld();
const storm = makeStorm(JSON.parse(readFileSync(new URL('../data/baked/storm-2016-01.json', import.meta.url), 'utf8')));
const P = presets(world);

test('at least three presets, each valid under I1-I3', () => {
  assert.ok(P.length >= 3);
  for (const p of P) { assert.deepEqual(checkPlan(world, CONFIG, p.plan), [], p.id); assert.ok(routesExist(world, CONFIG, p.plan), p.id); }
  const b = P.find((p) => p.id === 'plan-b').plan;
  assert.ok(b.plowed.length > 5 && b.lamps.length === 3 && b.signs.length === 1);
});

test('a plan survives the URL', () => {
  for (const p of P) assert.deepEqual(decodePlan(encodePlan(p.plan)), p.plan);
  assert.match(encodePlan(P[1].plan), /^[A-Za-z0-9_-]+$/);
});

test('routeToExit follows connected edges to an exit', () => {
  const z = CONFIG.spawnZones[0]; const from = nearestNode(world, z.x, z.y); const r = routeToExit(world, from);
  assert.ok(r.edges.length > 3 && Number.isFinite(r.length));
  assert.ok(world.paths.exits.some((e) => e.node === r.goal));
});

test('plowRoute extends plowing along the way out', () => {
  const rng = makeRng(4); let plan = emptyPlan(); let found = false;
  for (let q = 0; q < 200 && !found; q++) { const m = mutate(world, CONFIG, plan, rng); if (m.op === 'plowRoute') { found = true; assert.ok(m.plan.plowed.length >= 2); } }
  assert.ok(found);
});

test('the premise: Plan B gets survivors out where the empty plan gets none', () => {
  const empty = evaluatePlan(world, storm, emptyPlan()).metrics; const b = evaluatePlan(world, storm, P.find((p) => p.id === 'plan-b').plan).metrics;
  assert.equal(empty.escapeRate, 0);
  assert.ok(b.escapeRate > 0.1, `Plan B escape rate ${b.escapeRate}`);
  assert.ok(b.F > empty.F);
});
