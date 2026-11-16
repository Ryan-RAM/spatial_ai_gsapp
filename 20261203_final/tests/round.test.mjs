// M2.9: rounds and the evaluation suite: reproducibility and common random numbers (§11.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CONFIG } from '../src/sim/config.js';
import { loadWorld } from '../src/data/load-node.js';
import { makeStorm } from '../src/sim/storm.js';
import { makeRound, evaluationSuite, baselineBrains } from '../src/sim/round.js';
import { emptyPlan } from '../src/sim/interventions.js';

const world = loadWorld();
const storm = makeStorm(JSON.parse(readFileSync(new URL('../data/baked/storm-2016-01.json', import.meta.url), 'utf8')));
const hash = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
const FAST = { ...CONFIG, roundTicks: 150 };

test('the suite: 6 start times x 2 zones x 2 seeds = 24 rounds, in a fixed order with fixed seeds', () => {
  const s = evaluationSuite(CONFIG);
  assert.equal(s.length, 24);
  assert.equal(s[0].start, '2016-01-23T17:00'); assert.equal(s[23].start, '2016-01-24T03:00');
  assert.equal(new Set(s.map((r) => r.seed)).size, 24);
  assert.deepEqual(evaluationSuite(CONFIG), s);
});

test('reproducible: the same seed gives byte-identical results', () => {
  const r = { start: '2016-01-23T19:00', zone: 'azalea-west', seed: 42, brains: baselineBrains, config: FAST };
  const a = makeRound(world, storm, r).run(); const b = makeRound(world, storm, r).run();
  assert.equal(hash(a), hash(b));
  const c = makeRound(world, storm, { ...r, seed: 43 }).run();
  assert.notEqual(hash(a), hash(c), 'another seed, another round');
});

test('common random numbers: changing the plan does not change the spawn points or the agents\' draws', () => {
  const base = { start: '2016-01-23T21:00', zone: 'stone-arch', seed: 7, brains: baselineBrains, config: FAST };
  const r1 = makeRound(world, storm, { ...base, plan: emptyPlan() });
  const lamps = [{ edge: 0, s: 0 }, { edge: 5, s: 2 }];
  const r2 = makeRound(world, storm, { ...base, plan: { ...emptyPlan(), lamps } });
  assert.deepEqual(r1.state.agents.map((a) => a.cell), r2.state.agents.map((a) => a.cell));
  assert.deepEqual(r1.state.creatures.map((c) => c.cell), r2.state.creatures.map((c) => c.cell));
  assert.deepEqual(r1.state.agents.map((a) => a.rng.next()), r2.state.agents.map((a) => a.rng.next()));
});

test('a round plays out with the mechanics: survivors in separate cells, outcomes from the allowed set, warmth falls', () => {
  const round = makeRound(world, storm, { start: '2016-01-23T19:00', zone: 'azalea-west', seed: 3, brains: baselineBrains, config: CONFIG });
  assert.notEqual(round.state.agents[0].cell, round.state.agents[1].cell, 'one agent per cell');
  const res = round.run();
  assert.ok(res.ticks > 0 && res.ticks <= CONFIG.roundTicks);
  for (const s of res.survivors) {
    assert.ok(['escaped', 'caught', 'collapsed', 'lost'].includes(s.outcome));
    assert.ok(s.minWarmth < 100);
  }
});
