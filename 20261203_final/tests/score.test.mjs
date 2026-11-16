// M3.7 replanning cap and cached walk graphs; M3.8 metrics and fitness (§11.1-11.2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/sim/config.js';
import { loadWorld } from '../src/data/load-node.js';
import { makeStorm } from '../src/sim/storm.js';
import { makeRound, agentBrains, runNight, nightsOf, evaluationSuite } from '../src/sim/round.js';
import { newMemory } from '../src/sim/creature.js';
import { walkerFor } from '../src/sim/paths.js';
import { aggregate } from '../src/sim/score.js';
import { emptyPlan } from '../src/sim/interventions.js';

const world = loadWorld();
const storm = makeStorm(JSON.parse(readFileSync(new URL('../data/baked/storm-2016-01.json', import.meta.url), 'utf8')));

test('M3.7: an agent replans at most every 5 ticks while it has a route to follow', () => {
  const r = makeRound(world, storm, { start: '2016-01-23T19:00', zone: 'azalea-west', seed: 4, brains: agentBrains, creatureMemory: newMemory(world, CONFIG) });
  const last = new Map(); let violations = 0; let replans = 0;
  for (let t = 0; t < 300 && !r.state.done; t++) {
    const before = [...r.state.agents, ...r.state.creatures].map((a) => [a, a.plannedAt, !!a.route && a.routeIdx + 1 < a.route.length]);
    r.step();
    for (const [a, prevAt, hadRoute] of before) {
      if (a.plannedAt !== prevAt && a.plannedAt != null) {
        replans++;
        if (hadRoute && last.has(a.id) && a.plannedAt - last.get(a.id) < CONFIG.replanEveryTicks) violations++;
        last.set(a.id, a.plannedAt);
      }
    }
  }
  assert.ok(replans > 10);
  assert.equal(violations, 0);
});

test('M3.7: one walk graph per agent kind and world, cached', () => {
  assert.equal(walkerFor(world, 'survivor', CONFIG), walkerFor(world, 'survivor', CONFIG));
  assert.notEqual(walkerFor(world, 'survivor', CONFIG), walkerFor(world, 'creature', CONFIG));
});

test('M3.8: every metric of §11.1 comes out of a night', () => {
  const night = nightsOf(evaluationSuite(CONFIG))[0];
  const res = runNight(world, storm, { night: { ...night, rounds: night.rounds.slice(0, 2) } });
  const m = aggregate([res], CONFIG, { world, plan: emptyPlan() });
  for (const key of ['escapeRate', 'catchRate', 'collapseRate', 'lostRate', 'meanLowestWarmth', 'meanMinutesExposed', 'meanTimesSeen', 'meanMinutesClose', 'creatureCoverage', 'creatureNewCellsPerTick', 'F', 'Fprime'])
    assert.ok(Number.isFinite(m[key]), `${key} = ${m[key]}`);
  assert.ok(Math.abs(m.escapeRate + m.catchRate + m.collapseRate + m.lostRate - 1) < 1e-9);
  assert.ok(m.creatureCoverage > 1000 && m.creatureNewCellsPerTick > 0);
});

test('M3.8: F and F′ on a hand-made example', () => {
  const cfg = { ...CONFIG, tickSeconds: 2, roundTicks: 900, lambdaCost: 0.1 };
  const sv = (outcome, tick) => ({ outcome, tick, minWarmth: 50, timesSeen: 0, closeTicks: 0 });
  // 4 survivors: two escape after 10 and 20 minutes, one collapses, one is caught after 15 minutes
  const nights = [{ mapping: { cellsSeen: 100, newCellsPerTick: 2 }, rounds: [{ survivors: [sv('escaped', 300), sv('escaped', 600), sv('collapsed', 900), sv('caught', 450)], creatures: [{ walkedM: 300 }] }] }];
  const m = aggregate(nights, cfg);
  assert.equal(m.escapeRate, 0.5); assert.equal(m.collapseRate, 0.25); assert.equal(m.catchRate, 0.25);
  assert.equal(m.meanEscapeTimeMin, 15);
  assert.ok(Math.abs(m.F - (0.5 - 0.5 * 0.25 - 0.2 * 15 / 30)) < 1e-12);         // 0.275
  assert.ok(Math.abs(m.Fprime - (0.25 + 0.2 * (1 - 15 / 30))) < 1e-12);           // 0.35
  assert.equal(m.metresPerCatch, 300);
  assert.equal(aggregate(nights, { ...cfg, perspective: 'creature' }).fitness, m.Fprime);
});
