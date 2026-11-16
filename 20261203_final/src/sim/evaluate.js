// The headless evaluator (semantic model §11.4, ROADMAP M6.2): an intervention plan, scored on the
// fixed EvaluationSuite. The suite splits into independent nights (zone x seed), so the same code
// runs serially here, or one night per Web Worker (src/sim/worker.js, src/ui/pool.js) or per Node
// worker thread. Common random numbers make the scores of different plans comparable; the same
// plan always gets the same score. No DOM.

import { CONFIG } from './config.js';
import { evaluationSuite, nightsOf, runNight } from './round.js';
import { applyPlan } from './interventions.js';
import { aggregate } from './score.js';

export const suiteNights = (config = CONFIG) => nightsOf(evaluationSuite(config));

// strip a night's result to what the score needs (small enough to post between threads)
export function compactNight(n) {
  return {
    key: n.key, mapping: n.mapping, memoryCellsEnd: n.memoryCellsEnd,
    rounds: n.rounds.map((r) => ({ id: r.id, start: r.start, zone: r.zone, survivors: r.survivors.map((s) => ({ outcome: s.outcome, tick: s.tick, minWarmth: s.minWarmth, timesSeen: s.timesSeen, closeTicks: s.closeTicks, exposedTicks: s.exposedTicks, confusions: s.confusions, shortestS: s.shortestS })), creatures: r.creatures.map((c) => ({ catches: c.catches, walkedM: c.walkedM })) })),
  };
}

export function evaluateNight(world, storm, plan, night, config = CONFIG, layers = applyPlan(world, config, plan)) {
  return compactNight(runNight(world, storm, { config, plan, layers, night }));
}

export function evaluatePlan(world, storm, plan, config = CONFIG) {
  const layers = applyPlan(world, config, plan);
  const nights = suiteNights(config).map((night) => evaluateNight(world, storm, plan, night, config, layers));
  return { nights, metrics: aggregate(nights, config, { world, plan }) };
}
