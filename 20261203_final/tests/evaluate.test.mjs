// M6.2: the evaluator is reproducible, and the parallel version (one worker thread per night, the
// Node stand-in for the Web Workers) gives exactly the serial scores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { CONFIG } from '../src/sim/config.js';
import { loadWorld } from '../src/data/load-node.js';
import { makeStorm } from '../src/sim/storm.js';
import { evaluatePlan, suiteNights, compactNight } from '../src/sim/evaluate.js';
import { aggregate } from '../src/sim/score.js';
import { emptyPlan } from '../src/sim/interventions.js';
import { mutate } from '../src/sim/mutate.js';
import { makeRng } from '../src/sim/rng.js';

const world = loadWorld();
const storm = makeStorm(JSON.parse(readFileSync(new URL('../data/baked/storm-2016-01.json', import.meta.url), 'utf8')));
let plan = emptyPlan(); const rng = makeRng(11); for (let q = 0; q < 8; q++) plan = mutate(world, CONFIG, plan, rng).plan;

test('the same plan gets the same score, every time', () => {
  const a = evaluatePlan(world, storm, plan); const b = evaluatePlan(world, storm, plan);
  assert.deepEqual(a.metrics, b.metrics);
  assert.equal(a.nights.length, 4); assert.equal(a.nights.flatMap((n) => n.rounds).length, 24);
});

test('in parallel (one worker thread per night) the score is exactly the serial one', async () => {
  const serial = evaluatePlan(world, storm, plan).metrics;
  const nights = await Promise.all(suiteNights().map((night) => new Promise((res, rej) => {
    const w = new Worker(new URL('../bench/night-worker.mjs', import.meta.url));
    w.on('message', (m) => { if (m === 'ready') w.postMessage({ night, plan }); else { res(compactNight(m)); w.terminate(); } });
    w.on('error', rej);
  })));
  assert.deepEqual(aggregate(nights, CONFIG, { world, plan }), serial);
});
