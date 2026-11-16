// M2.6: survivor warmth (rules E1-E2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/sim/config.js';
import { makeStorm, localSeconds } from '../src/sim/storm.js';
import { updateWarmth, warmthLossPerSecond, secondsLeft } from '../src/sim/warmth.js';

const storm = makeStorm(JSON.parse(readFileSync(new URL('../data/baked/storm-2016-01.json', import.meta.url), 'utf8')));

test('E1: full exposure at the storm\'s worst wind chill empties warmth in about 25 minutes', () => {
  let worst = storm.at(storm.start);
  for (let t = storm.start; t <= storm.end; t += 60) { const s = storm.at(t); if (s.windChillC < worst.windChillC) worst = s; }
  let w = 100; let sec = 0;
  while (w > 0) { w = updateWarmth(CONFIG, w, CONFIG.tickSeconds, worst, 1); sec += CONFIG.tickSeconds; }
  assert.ok(Math.abs(sec / 60 - 25) < 0.5, `${(sec / 60).toFixed(1)} min at ${worst.windChillC.toFixed(1)} °C (${worst.label})`);
  assert.ok(Math.abs(secondsLeft(CONFIG, 100, worst, 1) / 60 - 25) < 0.5);
});

test('E1: shelter from canopy and rock slows the loss; no loss at a wind chill of 10 °C or more', () => {
  const s = storm.at(localSeconds('2016-01-23T19:00'));
  const open = warmthLossPerSecond(CONFIG, s.windChillC, 1); const woods = warmthLossPerSecond(CONFIG, s.windChillC, 0.2);
  assert.ok(Math.abs(woods / open - (0.3 + 0.14)) < 1e-9, 'openness 0.2: 44 % of the open loss');
  assert.equal(warmthLossPerSecond(CONFIG, 10, 1), 0);
  assert.equal(warmthLossPerSecond(CONFIG, 15, 1), 0);
});

test('E2: a warming shelter adds 1 per second, up to 100; warmth never goes below 0', () => {
  const s = storm.at(localSeconds('2016-01-23T19:00'));
  assert.equal(updateWarmth(CONFIG, 40, 10, s, 1, true), 50);
  assert.equal(updateWarmth(CONFIG, 95, 10, s, 1, true), 100);
  assert.equal(updateWarmth(CONFIG, 0.1, 60, s, 1), 0);
});

test('a 30-minute round at 19:00 in the open costs most, but not all, of a survivor\'s warmth', () => {
  let w = 100; let t = localSeconds('2016-01-23T19:00');
  for (let k = 0; k < CONFIG.roundTicks; k++, t += CONFIG.tickSeconds) w = updateWarmth(CONFIG, w, CONFIG.tickSeconds, storm.at(t), 1);
  assert.ok(w <= 30, `fully exposed for the whole round: ${w.toFixed(0)} left`);
  let ww = 100; t = localSeconds('2016-01-23T19:00');
  for (let k = 0; k < CONFIG.roundTicks; k++, t += CONFIG.tickSeconds) ww = updateWarmth(CONFIG, ww, CONFIG.tickSeconds, storm.at(t), 0.25);
  assert.ok(ww > 20, `in the woods: ${ww.toFixed(0)} left`);
});
