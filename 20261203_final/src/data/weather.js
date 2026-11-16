// Hourly weather at Central Park (KNYC) from the Iowa Environmental Mesonet ASOS archive
// (semantic model §4, §16): fetch, parse, convert units, and the storm calibration of §4.2.
// Shared by data/scripts/bake-weather.mjs, the MCP server (weather.series) and tonight mode (M7.2).

import { get } from './http.js';
import { IEM_ASOS } from './sources.js';

export const KT = 0.514444;      // m/s per knot
export const MILE = 1609.344;    // m per statute mile
export const INCH = 25.4;        // mm per inch
export const fToC = (f) => ((f - 32) * 5) / 9;

// IEM query of §16. start/end: ISO strings in UTC, e.g. '2016-01-22T12:00Z'.
export function asosUrl(station, start, end) {
  const q = new URLSearchParams({ station, data: 'all', sts: start, ets: end, tz: 'America/New_York', format: 'onlycomma', report_type: '3' });
  return `${IEM_ASOS}?${q}`;
}
export const fetchAsosCsv = (station, start, end) => get(asosUrl(station, start, end));

// 'M' = missing, 'T' = trace (counted as 0.0001 in, so a trace is not "no precipitation")
const num = (v) => (v === 'M' || v === '' || v == null ? null : v === 'T' ? 0.0001 : +v);

// NWS wind chill (2001), °F and mph; defined for T <= 50 °F and V >= 3 mph, else the air temperature.
export function windChillF(tF, mph) {
  if (tF > 50 || mph < 3) return tF;
  const v = mph ** 0.16;
  return 35.74 + 0.6215 * tF - 35.75 * v + 0.4275 * tF * v;
}

// One record per observation, SI units. `time` is local wall-clock time 'YYYY-MM-DDTHH:MM'
// (America/New_York, EST in January = UTC-5); `utc` is the same instant in UTC.
export function parseAsosCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const head = lines[0].split(',');
  const col = (name) => head.indexOf(name);
  const c = Object.fromEntries(['valid', 'tmpf', 'drct', 'sknt', 'p01i', 'vsby', 'gust', 'wxcodes', 'peak_wind_gust', 'relh', 'metar'].map((n) => [n, col(n)]));
  return lines.slice(1).map((line) => {
    const f = line.split(',');
    const time = f[c.valid].replace(' ', 'T');
    const tF = num(f[c.tmpf]); const kt = num(f[c.sknt]); const gustKt = num(f[c.gust]); const peakKt = num(f[c.peak_wind_gust]);
    const wcF = tF != null && kt != null ? windChillF(tF, kt * 1.15078) : null;
    return {
      time, utc: new Date(`${time}:00-05:00`).toISOString().slice(0, 16) + 'Z',
      tempC: tF != null ? +fToC(tF).toFixed(2) : null,
      windFromDeg: num(f[c.drct]), windMs: kt != null ? +(kt * KT).toFixed(2) : null,
      gustMs: gustKt != null ? +(gustKt * KT).toFixed(2) : null, peakGustMs: peakKt != null ? +(peakKt * KT).toFixed(2) : null,
      gustKt, visibilityM: num(f[c.vsby]) != null ? Math.round(num(f[c.vsby]) * MILE) : null,
      visibilityMi: num(f[c.vsby]),
      precipIn: num(f[c.p01i]), precipMm: num(f[c.p01i]) != null ? +(num(f[c.p01i]) * INCH).toFixed(3) : null,
      windChillC: wcF != null ? +fToC(wcF).toFixed(2) : null,
      relHumidity: num(f[c.relh]),
      wx: (f[c.wxcodes] === 'M' ? '' : f[c.wxcodes]).trim(),
    };
  });
}

export const isSnow = (wx) => /SN/.test(wx);

// §4.2: snow-to-liquid ratio so that the hourly liquid precipitation during the snow adds up to
// the official storm total; then hourly and cumulative snowfall in cm.
// Precipitation counts as snow between the first and the last hour reporting snow, when the air
// is at or below 1 °C: an hour coded only FZFG (freezing fog) can still carry snowfall in its
// gauge reading (18:51 on 23 January: 0.07 in).
export function snowMask(records) {
  const first = records.findIndex((r) => isSnow(r.wx));
  const last = records.length - 1 - [...records].reverse().findIndex((r) => isSnow(r.wx));
  return records.map((r, k) => first >= 0 && k >= first && k <= last && (r.tempC ?? 0) <= 1 && !!r.precipIn);
}

export function calibrateSnow(records, stormTotalIn) {
  const mask = snowMask(records);
  const liquidIn = records.reduce((s, r, k) => s + (mask[k] ? r.precipIn : 0), 0);
  const slr = stormTotalIn / liquidIn;
  let cum = 0;
  const out = records.map((r, k) => {
    const snowCm = mask[k] ? r.precipIn * slr * 2.54 : 0;
    cum += snowCm;
    return { ...r, snowCm: +snowCm.toFixed(3), cumSnowCm: +cum.toFixed(2) };
  });
  return { records: out, slr, liquidIn };
}

// The visibility factor of §4.2: 0.35 at 0.25 mi (402 m), 1 at 10 mi.
export const visibilityFactor = (visM) => Math.min(1, Math.max(0.35, 0.35 + (0.65 * Math.log(visM / 400)) / Math.log(40)));
