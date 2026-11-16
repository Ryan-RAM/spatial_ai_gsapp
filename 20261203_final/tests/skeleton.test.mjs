// M0.1: the skeleton holds together. Config sanity and seeded randomness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/sim/config.js';
import { makeRng, substream } from '../src/sim/rng.js';

test('config: the evaluation suite has 24 rounds (§11.4)', () => {
  const { startTimes, spawnZones, seeds } = CONFIG.suite;
  assert.equal(startTimes.length * spawnZones * seeds, 24);
});

test('config: a round is 30 minutes of storm time (§7.9)', () => {
  assert.equal(CONFIG.roundTicks * CONFIG.tickSeconds, 30 * 60);
});

test('rng: the same seed gives the same sequence', () => {
  const a = makeRng(42); const b = makeRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('rng: named substreams are stable and independent', () => {
  const s1 = substream(7, 'survivor:1').next();
  assert.equal(substream(7, 'survivor:1').next(), s1);
  assert.notEqual(substream(7, 'survivor:2').next(), s1);
  assert.notEqual(substream(8, 'survivor:1').next(), s1);
});
