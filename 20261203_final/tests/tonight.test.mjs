// M7.2: tonight mode turns NWS observations into the same record shape, so the storm clock runs on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromNws, newYorkTime } from '../src/sim/tonight.js';
import { makeStorm } from '../src/sim/storm.js';

const json = JSON.parse(readFileSync(new URL('./fixtures/nws-knyc.json', import.meta.url), 'utf8'));

test('New York wall-clock time, standard and daylight', () => {
  assert.equal(newYorkTime('2016-01-24T00:51:00Z'), '2016-01-23T19:51');
  assert.equal(newYorkTime('2026-07-01T16:00:00Z'), '2026-07-01T12:00');
});

test('units: km/h -> m/s, mm -> in, snow from precipitation below 1 °C at 10:1', () => {
  const rec = fromNws(json);
  const snowy = rec.records.find((r) => r.wx === 'SN');
  assert.equal(snowy.time, '2016-01-23T18:51');
  assert.ok(Math.abs(snowy.windMs - 13 / 3.6) < 1e-9);
  assert.ok(Math.abs(snowy.snowCm - (1.8 / 25.4) * 10 * 2.54) < 1e-3, '1.8 mm of water = 1.8 cm of snow at 10:1');
  assert.ok(rec.records.every((r, q) => q === 0 || r.utc > rec.records[q - 1].utc), 'oldest first');
});

test('the storm clock runs on tonight\'s records', () => {
  const rec = fromNws(json); const storm = makeStorm(rec);
  const s = storm.at(storm.end);
  for (const k of ['tempC', 'windMs', 'visibilityM', 'vf', 'cumSnowCm', 'windChillC']) assert.ok(Number.isFinite(s[k]), k);
});
