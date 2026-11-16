// M4.4: loose time limits (3 x the targets of CLAUDE.md §3), so that nothing gets much slower
// unnoticed. The real numbers come from `npm run bench`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/sim/config.js';
import { loadWorld } from '../src/data/load-node.js';
import { makeStorm } from '../src/sim/storm.js';
import { makeRound, agentBrains } from '../src/sim/round.js';
import { newMemory } from '../src/sim/creature.js';

const world = loadWorld();
const storm = makeStorm(JSON.parse(readFileSync(new URL('../data/baked/storm-2016-01.json', import.meta.url), 'utf8')));

test('a 900-tick round with the M3 agents stays under 3 x its 150 ms target', () => {
  const run = () => makeRound(world, storm, { start: '2016-01-23T19:00', zone: 'azalea-west', seed: 11, brains: agentBrains, creatureMemory: newMemory(world, CONFIG) }).run();
  run(); // warm
  const t = performance.now(); run(); const ms = performance.now() - t;
  assert.ok(ms < 3 * CONFIG.targets.roundMs, `${ms.toFixed(0)} ms`);
});

test('loading the world stays under 3 x its 300 ms target', () => {
  const t = performance.now(); loadWorld(); const ms = performance.now() - t;
  assert.ok(ms < 900, `${ms.toFixed(0)} ms`);
});
