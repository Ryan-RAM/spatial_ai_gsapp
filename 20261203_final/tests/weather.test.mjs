// M1.5: the KNYC hourly record, unit conversions and the storm calibration (semantic model §4, §15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { windChillF, visibilityFactor, fToC, parseAsosCsv, calibrateSnow, snowMask } from '../src/data/weather.js';

const storm = JSON.parse(readFileSync(new URL('../data/baked/storm-2016-01.json', import.meta.url), 'utf8'));
const at = (t) => storm.records.find((r) => r.time === t);
const near = (a, b, tol) => Math.abs(a - b) <= tol;

test('unit conversions and the NWS wind chill', () => {
  assert.equal(fToC(32), 0);
  assert.ok(near(fToC(27), -2.78, 0.01));
  assert.ok(near(windChillF(0, 15), -19, 0.5), 'NWS table: 0 °F at 15 mph -> -19 °F');
  assert.equal(windChillF(55, 20), 55);
  assert.equal(windChillF(20, 2), 20);
});

test('visibility factor of §4.2: 0.35 at 0.25 mi, 1 at 10 mi, clamped', () => {
  assert.ok(near(visibilityFactor(402), 0.35, 0.002));
  assert.ok(near(visibilityFactor(16093), 1, 0.001));
  assert.equal(visibilityFactor(50), 0.35);
  assert.equal(visibilityFactor(30000), 1);
});

test('parse: missing and trace values', () => {
  const csv = 'station,valid,tmpf,dwpf,relh,drct,sknt,p01i,alti,mslp,vsby,gust,wxcodes,peak_wind_gust,metar\n'
    + 'NYC,2016-01-23 19:51,25.00,M,M,350.00,7.00,T,M,M,0.25,21.00,+SN FZFG,M,x\n';
  const [r] = parseAsosCsv(csv);
  assert.equal(r.time, '2016-01-23T19:51');
  assert.equal(r.utc, '2016-01-24T00:51Z');
  assert.ok(r.precipIn > 0 && r.precipIn < 0.001, 'trace');
  assert.equal(r.peakGustMs, null);
  assert.ok(near(r.windMs, 3.6, 0.01));
  assert.equal(r.visibilityM, 402);
});

test('snow period: an hour coded only FZFG still counts its precipitation', () => {
  const rec = [{ wx: 'SN', tempC: -3, precipIn: 0.1 }, { wx: 'FZFG', tempC: -3, precipIn: 0.07 }, { wx: 'SN', tempC: -3, precipIn: 0.1 }, { wx: '', tempC: -3, precipIn: 0.2 }];
  assert.deepEqual(snowMask(rec), [true, true, true, false]);
  const { slr } = calibrateSnow(rec, 2.7);
  assert.ok(near(slr, 10, 1e-9));
});

test('calibration: SLR about 11.9 from about 2.3 in of liquid (§4.2)', () => {
  assert.ok(near(storm.calibration.snowToLiquidRatio, 11.9, 0.1), `SLR ${storm.calibration.snowToLiquidRatio}`);
  assert.ok(near(storm.calibration.liquidDuringSnowIn, 2.3, 0.05));
  const last = storm.records[storm.records.length - 1];
  assert.ok(near(last.cumSnowCm, 27.5 * 2.54, 0.05), 'storm total 27.5 in = 69.85 cm');
});

test('the record as summarised in §4.1', () => {
  assert.equal(storm.summary.firstSnow, '2016-01-22T22:51');
  assert.ok(near(storm.summary.longestQuarterMileRunHours, 13, 1), '0.25 mi for about 13 hours');
  assert.ok(near(storm.summary.maxGustMs / 0.514444, 37, 0.5), 'gusts up to 37 kt');
  assert.ok(storm.summary.minTempC >= -6 && storm.summary.maxTempC <= -1.5, '-3 to -6 °C');
  const morning = at('2016-01-23T09:51');
  assert.ok(near(Math.max(morning.gustMs, morning.peakGustMs) / 0.514444, 37, 0.5), 'the 37 kt gust at 09:51');
  for (const r of storm.records.filter((x) => x.time >= '2016-01-23T04:51' && x.time <= '2016-01-23T17:51'))
    assert.ok(r.windFromDeg >= 20 && r.windFromDeg <= 70, `NE wind at ${r.time}: ${r.windFromDeg}`);
});

test('the example scenario of §15 at 19:00', () => {
  const a = at('2016-01-23T18:51'); const b = at('2016-01-23T19:51');
  for (const r of [a, b]) {
    assert.ok(r.tempC <= -3 && r.tempC >= -4, `temp ${r.tempC}`);
    assert.ok(r.windFromDeg >= 350 || r.windFromDeg <= 20, `wind from ${r.windFromDeg}`);
    assert.ok(near(r.windMs / 0.514444, 8.5, 1.6), 'wind 7-10 kt');
    assert.ok(near(r.gustMs / 0.514444, 21.5, 0.6), 'gusts 21-22 kt');
    assert.ok(r.visibilityMi >= 0.25 && r.visibilityMi <= 0.5);
    assert.ok(near(r.windChillC, -9.5, 1), `wind chill ${r.windChillC}`);
  }
  const cum19 = (a.cumSnowCm + b.cumSnowCm) / 2;
  assert.ok(near(cum19, 66, 2), `cumulative snow at 19:00 ${cum19} cm`);
  assert.ok(near(a.cumSnowCm / (storm.calibration.snowToLiquidRatio * 2.54), 2.19, 0.01), '2.19 in of liquid by 18:51');
});
