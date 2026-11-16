// M2.3: the storm clock (semantic model §4.2, §15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeStorm, localSeconds, localLabel, visibilityFactor } from '../src/sim/storm.js';
import { CONFIG } from '../src/sim/config.js';

const record = JSON.parse(readFileSync(new URL('../data/baked/storm-2016-01.json', import.meta.url), 'utf8'));
const storm = makeStorm(record);
const at = (s) => storm.at(localSeconds(s));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

test('storm time: local wall clock, round trip, 2 s ticks', () => {
  assert.equal(localLabel(localSeconds('2016-01-23T19:00')), '2016-01-23T19:00');
  assert.equal(localSeconds('2016-01-23T19:00') - localSeconds('2016-01-23T18:00'), 3600);
  assert.equal(CONFIG.tickSeconds, 2);
});

test('vf(t): 0.35 at 0.25 mi, 1 at 10 mi (§4.2)', () => {
  assert.ok(near(visibilityFactor(0.25 * 1609.344), 0.35, 0.002));
  assert.ok(near(visibilityFactor(10 * 1609.344), 1, 1e-9));
  assert.ok(near(at('2016-01-23T12:51').vf, 0.35, 0.002), 'in the heavy snow at midday');
  assert.equal(at('2016-01-22T12:51').vf, 1, 'before the storm, 10 mi');
});

test('§15 at 19:00: the scenario values', () => {
  const s = at('2016-01-23T19:00');
  assert.ok(s.tempC <= -3 && s.tempC >= -4, `temp ${s.tempC}`);
  assert.ok(s.windFromDeg >= 350 || s.windFromDeg <= 20, `wind from ${s.windFromDeg}`);
  assert.ok(s.windMs / 0.514444 >= 7 && s.windMs / 0.514444 <= 10, 'wind 7-10 kt');
  assert.ok(s.gustKt >= 21 && s.gustKt <= 22.1, `gusts ${s.gustKt} kt`);
  assert.ok(s.visibilityM >= 400 && s.visibilityM <= 805, 'vis 0.25-0.5 mi');
  assert.ok(near(s.snowRateCmH, 2, 0.3), `about 2 cm/h, got ${s.snowRateCmH}`);
  assert.ok(near(s.cumSnowCm, 66, 1.5), `66 cm on the ground, got ${s.cumSnowCm}`);
  assert.ok(s.windChillC <= -8.5 && s.windChillC >= -10.5, `wind chill ${s.windChillC}`);
  assert.ok(s.vf >= 0.35 && s.vf <= 0.55, `vf ${s.vf}`);
});

test('interpolation: continuous cumulative snow, rate constant within the hour, direction through north', () => {
  let prev = at('2016-01-23T00:00').cumSnowCm;
  for (let m = 1; m < 24 * 60; m += 7) {
    const s = storm.at(localSeconds('2016-01-23T00:00') + m * 60);
    // the heaviest hour is 0.19 in x SLR = 5.7 cm/h, i.e. 0.67 cm in 7 minutes
    assert.ok(s.cumSnowCm >= prev - 1e-9 && s.cumSnowCm - prev <= 0.7, 'no jumps, never decreasing');
    prev = s.cumSnowCm;
  }
  assert.equal(at('2016-01-23T19:10').snowRateCmH, at('2016-01-23T19:40').snowRateCmH);
  // 18:51 is 20 degrees, 19:51 is 350 degrees: halfway is 5 degrees (through north, not south)
  const mid = at('2016-01-23T19:21');
  assert.ok(near(mid.windFromDeg, 5, 0.5), `halfway ${mid.windFromDeg}`);
});

test('the evaluation night lies inside the record; outside it the clock holds the end values', () => {
  assert.ok(localSeconds(CONFIG.window.start) >= storm.start && localSeconds(CONFIG.window.end) <= storm.end);
  assert.deepEqual(storm.at(storm.end + 3600).cumSnowCm, storm.at(storm.end).cumSnowCm);
  assert.equal(storm.at(storm.end + 3600).snowRateCmH, 0);
  assert.ok(near(storm.at(storm.end).cumSnowCm, 69.85, 0.05), 'the storm total');
});
