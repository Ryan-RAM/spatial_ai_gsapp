// M8.4: every gallery environment is a valid plan, has a story, and reproduces its score
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWorld } from '../src/data/load-node.js';
import { CONFIG } from '../src/sim/config.js';
import { makeStorm } from '../src/sim/storm.js';
import { checkPlan } from '../src/sim/interventions.js';
import { decodePlan } from '../src/sim/presets.js';
import { evaluatePlan } from '../src/sim/evaluate.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url)));
const G = read('gallery.json'); const S = read('gallery-stories.json');
const world = await loadWorld({ withHorizon: true });

test('at least 6 environments, each valid (I1, I3) and with a story', () => {
  assert.ok(S.order.length >= 6);
  for (const id of S.order) {
    const env = G.environments.find((e) => e.id === id); assert.ok(env, id); assert.ok(S.stories[id]?.length > 40, `story for ${id}`);
    assert.deepEqual(checkPlan(world, CONFIG, decodePlan(env.plan)), [], id);
    assert.ok(env.heat.survivor.length > 0 && env.heat.ends.length > 0);
    for (const [, o] of env.heat.ends) assert.ok('eckl'.includes(o));
  }
});
test('loading an environment reproduces its score (same seed, same number)', () => {
  const storm = makeStorm(read('baked/storm-2016-01.json'));
  const env = G.environments.find((e) => e.id === 'plan-b-dark');
  const m = evaluatePlan(world, storm, decodePlan(env.plan), CONFIG).metrics;
  assert.equal(+m.F.toFixed(4), env.metrics.F); assert.equal(+m.catchRate.toFixed(4), env.metrics.catchRate);
});
