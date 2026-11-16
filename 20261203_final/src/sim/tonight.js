// Tonight mode (ROADMAP M7.2, D-006): the latest hours of Central Park's observations from the NWS
// API, in the same shape as the baked 2016 record, so the storm clock and everything after it run
// unchanged. Geometry stays the same; only the weather changes. Snow from precipitation needs a
// snow-to-liquid ratio: tonight there is no storm total to calibrate on, so 10:1 (D-035).
// Works in the browser (the NWS API allows cross-origin requests) and in Node.

export const NWS_URL = (station = 'KNYC', limit = 30) => `https://api.weather.gov/stations/${station}/observations?limit=${limit}`;
export const TONIGHT_SLR = 10;

const v = (q) => (q && q.value != null ? q.value : null);

// UTC instant -> local wall-clock 'YYYY-MM-DDTHH:MM' in New York (EST or EDT, whichever applies)
export function newYorkTime(iso) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

// NWS GeoJSON -> records like data/baked/storm-2016-01.json (oldest first, one per hour)
export function fromNws(json, { slr = TONIGHT_SLR } = {}) {
  const raw = json.features.map((f) => f.properties).filter((p) => v(p.temperature) != null)
    .map((p) => {
      const kmh = v(p.windSpeed); const gust = v(p.windGust); const mm = v(p.precipitationLastHour); const text = p.textDescription ?? '';
      return {
        time: newYorkTime(p.timestamp), utc: new Date(p.timestamp).toISOString().slice(0, 16) + 'Z',
        tempC: v(p.temperature), windFromDeg: v(p.windDirection), windMs: kmh != null ? kmh / 3.6 : 0,
        gustMs: gust != null ? gust / 3.6 : null, visibilityM: v(p.visibility) ?? 16093, precipIn: mm != null ? mm / 25.4 : 0,
        wx: /snow/i.test(text) ? 'SN' : /rain|drizzle/i.test(text) ? 'RA' : '', text,
      };
    })
    .sort((a, b) => (a.utc < b.utc ? -1 : 1));
  // one observation per hour (the routine :51 report when there are specials too)
  const byHour = new Map(); for (const r of raw) byHour.set(r.utc.slice(0, 13), r);
  let cum = 0;
  const records = [...byHour.values()].map((r) => {
    const snowCm = r.tempC <= 1 && r.precipIn > 0 ? r.precipIn * slr * 2.54 : 0; cum += snowCm;
    return { ...r, snowCm: +snowCm.toFixed(3), cumSnowCm: +cum.toFixed(2) };
  });
  return { name: 'Tonight at Central Park (KNYC)', source: 'NWS API, api.weather.gov', calibration: { snowToLiquidRatio: slr, note: 'no storm total to calibrate on: 10:1 (D-035)' }, records };
}

export async function fetchTonight(fetchFn = fetch, station = 'KNYC') {
  const res = await fetchFn(NWS_URL(station), { headers: { Accept: 'application/geo+json' } });
  if (!res.ok) throw new Error(`NWS ${res.status}`);
  const rec = fromNws(await res.json());
  if (rec.records.length < 2) throw new Error('too few observations');
  return rec;
}
