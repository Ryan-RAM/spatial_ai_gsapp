// M6.1: mutation operators respect rules I1-I3 (property test), every operator gets drawn, and
// mutation is deterministic given the seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/sim/config.js';
import { loadWorld } from '../src/data/load-node.js';
import { mutate, OPERATORS } from '../src/sim/mutate.js';
import { emptyPlan, checkPlan, routesExist } from '../src/sim/interventions.js';
import { makeRng } from '../src/sim/rng.js';

const world = loadWorld();

test('10,000 random mutations: every child satisfies I1-I3, every operator is used', () => {
  const rng = makeRng(2026); const used = new Map(); let plan = emptyPlan(); let checkedI2 = 0;
  for (let q = 0; q < 10000; q++) {
    const m = mutate(world, CONFIG, plan, rng);
    assert.ok(m, `no valid child at step ${q}`);
    assert.deepEqual(checkPlan(world, CONFIG, m.plan), [], `step ${q} (${m.op})`);
    if (q % 50 === 0) { assert.ok(routesExist(world, CONFIG, m.plan), `I2 at step ${q}`); checkedI2++; }
    used.set(m.op, (used.get(m.op) ?? 0) + 1);
    plan = q % 400 === 399 ? emptyPlan() : m.plan; // a random walk through plan space, restarted now and then
  }
  for (const op of OPERATORS) assert.ok(used.get(op) > 0, `${op} never used`);
  assert.ok(checkedI2 >= 200);
});

test('deterministic: the same seed gives the same children', () => {
  const run = () => { const r = makeRng(7); let p = emptyPlan(); const out = []; for (let q = 0; q < 30; q++) { const m = mutate(world, CONFIG, p, r); out.push(m.op); p = m.plan; } return [out, p]; };
  assert.deepEqual(run(), run());
});

test('each child says what changed', () => {
  const m = mutate(world, CONFIG, emptyPlan(), makeRng(3));
  assert.equal(typeof m.diff.text, 'string'); assert.ok(m.diff.text.length > 5);
  assert.ok(Number.isFinite(m.diff.cost));
});
