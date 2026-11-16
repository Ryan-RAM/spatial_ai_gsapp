// Goals, metrics and fitness (semantic model §11.1-11.2). From the results of rounds and nights.
// No DOM.
//
// Survivor: reach an exit (escape, time to escape, path efficiency = shortest true route time /
// time taken); stay warm (lowest warmth, collapse, minutes exposed); stay unseen (times seen,
// minutes within 15 m of the creature). Creature: map the woods (coverage, new cells per tick);
// catch survivors (catch rate, time to catch, metres walked per catch).
//   F  = escapeRate - 0.5 collapseRate - 0.2 meanEscapeTime / 30 min - lambda cost / budget
//   F' = catchRate + 0.2 (1 - meanTimeToCatch / 30 min)

import { fullBudgetCost, planCost } from './interventions.js';

const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

export function aggregate(nights, config, { world = null, plan = null } = {}) {
  const rounds = nights.flatMap((n) => n.rounds);
  const sv = rounds.flatMap((r) => r.survivors);
  const N = sv.length || 1;
  const count = (o) => sv.filter((s) => s.outcome === o).length;
  const tickMin = config.tickSeconds / 60;
  const esc = sv.filter((s) => s.outcome === 'escaped');
  const caught = sv.filter((s) => s.outcome === 'caught');
  const creatureM = rounds.reduce((a, r) => a + r.creatures.reduce((b, c) => b + (c.walkedM ?? 0), 0), 0);
  const m = {
    rounds: rounds.length, survivors: sv.length,
    escapeRate: count('escaped') / N, catchRate: count('caught') / N, collapseRate: count('collapsed') / N, lostRate: count('lost') / N,
    meanEscapeTimeMin: mean(esc.map((s) => s.tick * tickMin)),
    meanPathEfficiency: mean(esc.filter((s) => s.shortestS).map((s) => Math.min(1, s.shortestS / (s.tick * config.tickSeconds)))),
    meanLowestWarmth: mean(sv.map((s) => s.minWarmth)),
    meanMinutesExposed: mean(sv.map((s) => (s.exposedTicks ?? 0) * tickMin)),
    meanTimesSeen: mean(sv.map((s) => s.timesSeen)),
    meanMinutesClose: mean(sv.map((s) => s.closeTicks * tickMin)),
    meanTimeToCatchMin: mean(caught.map((s) => s.tick * tickMin)),
    metresPerCatch: caught.length ? creatureM / caught.length : null,
    creatureCoverage: mean(nights.map((n) => n.mapping?.cellsSeen ?? 0)),
    creatureNewCellsPerTick: mean(nights.map((n) => n.mapping?.newCellsPerTick ?? 0)),
  };
  const round30 = (config.roundTicks * config.tickSeconds) / 60;
  const cost = world && plan ? planCost(world, config, plan).total : 0;
  m.cost = cost;
  m.F = m.escapeRate - 0.5 * m.collapseRate - (m.meanEscapeTimeMin != null ? 0.2 * m.meanEscapeTimeMin / round30 : 0) - config.lambdaCost * cost / fullBudgetCost(config);
  m.Fprime = m.catchRate + (m.meanTimeToCatchMin != null ? 0.2 * (1 - m.meanTimeToCatchMin / round30) : 0);
  m.fitness = config.perspective === 'creature' ? m.Fprime : m.F;
  return m;
}
