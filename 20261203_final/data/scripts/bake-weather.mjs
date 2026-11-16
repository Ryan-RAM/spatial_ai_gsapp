// Bakes data/baked/storm-2016-01.json (ROADMAP M1.5): the hourly KNYC record in SI units, with the
// snow calibration of §4.2 (snow-to-liquid ratio fitted to the 27.5 in storm total), wind chill and
// the visibility factor. Run: npm run bake:weather (after npm run fetch:weather)

import { readFileSync, writeFileSync } from 'node:fs';
import { CONFIG } from '../../src/sim/config.js';
import { parseAsosCsv, calibrateSnow, visibilityFactor, asosUrl, isSnow } from '../../src/data/weather.js';

const STORM = { station: 'NYC', start: '2016-01-22T12:00Z', end: '2016-01-24T12:00Z', file: 'knyc-2016-01.csv' };
const csv = readFileSync(new URL(`../raw/weather/${STORM.file}`, import.meta.url), 'utf8');
const parsed = parseAsosCsv(csv);
const { records, slr, liquidIn } = calibrateSnow(parsed, CONFIG.stormTotalSnowIn);
for (const r of records) r.vf = r.visibilityM != null ? +visibilityFactor(r.visibilityM).toFixed(3) : null;

const snowHours = records.filter((r) => isSnow(r.wx));
// the longest run of consecutive hours at 0.25 mi or less
let run = 0; let best = 0; let bestEnd = null;
for (const r of records) { if (r.visibilityMi != null && r.visibilityMi <= 0.25) { run++; if (run > best) { best = run; bestEnd = r.time; } } else run = 0; }

const out = {
  name: 'January 2016 blizzard at Central Park (KNYC)',
  station: 'KNYC, Central Park (Belvedere Castle, Vista Rock)',
  source: 'Iowa Environmental Mesonet ASOS archive (routine hourly METARs)', url: asosUrl(STORM.station, STORM.start, STORM.end),
  timezone: 'America/New_York (EST, UTC-5); `time` is local wall-clock time',
  units: { tempC: '°C', windFromDeg: 'degrees, direction the wind blows from', windMs: 'm/s', gustMs: 'm/s', visibilityM: 'm', precipMm: 'mm liquid in the hour', snowCm: 'cm of snow in the hour (calibrated)', cumSnowCm: 'cm since the start of the record', windChillC: '°C (NWS)', vf: 'visibility factor, §4.2' },
  calibration: {
    stormTotalIn: CONFIG.stormTotalSnowIn, liquidDuringSnowIn: +liquidIn.toFixed(3), snowToLiquidRatio: +slr.toFixed(3),
    note: 'SLR chosen so that the liquid precipitation of the snow period (first to last hour reporting SN, air <= 1 °C) adds up to the official 27.5 in (§4.2). Gauges under-catch in heavy snow; the ratio absorbs it.',
  },
  summary: {
    observations: records.length, snowHours: snowHours.length,
    firstSnow: snowHours[0]?.time, lastSnow: snowHours[snowHours.length - 1]?.time,
    longestQuarterMileRunHours: best, longestQuarterMileRunEnd: bestEnd,
    minTempC: Math.min(...records.map((r) => r.tempC ?? Infinity)), maxTempC: Math.max(...records.map((r) => r.tempC ?? -Infinity)),
    maxGustMs: Math.max(...records.map((r) => Math.max(r.gustMs ?? 0, r.peakGustMs ?? 0))),
  },
  records,
};
writeFileSync(new URL('../baked/storm-2016-01.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`storm-2016-01.json: ${records.length} hours, snow ${out.summary.firstSnow} -> ${out.summary.lastSnow}; liquid ${liquidIn.toFixed(2)} in, SLR ${slr.toFixed(2)}; 1/4 mi for ${best} h (to ${bestEnd}); ${out.summary.minTempC}..${out.summary.maxTempC} °C; max gust ${out.summary.maxGustMs} m/s`);
const at19 = records.filter((r) => r.time.startsWith('2016-01-23T18') || r.time.startsWith('2016-01-23T19'));
for (const r of at19) console.log(`  ${r.time}: ${r.tempC} °C, wind ${r.windFromDeg}° ${r.windMs} m/s gust ${r.gustMs}, vis ${r.visibilityMi} mi, ${r.precipIn} in, cum ${r.cumSnowCm} cm, wind chill ${r.windChillC} °C, ${r.wx}`);
