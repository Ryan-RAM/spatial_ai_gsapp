// The data behind the night (ROADMAP M7.1): temperature, wind and gusts, visibility and snow on the
// ground, hour by hour as recorded, with the moment the simulation is at. Hovering shows the
// observation itself, so every number can be traced to its source.
import { localSeconds as toSec } from '../sim/storm.js';

export const ROWS = [
  { key: 'tempC', label: 'Temperature °C', fmt: (v) => v.toFixed(1) },
  { key: 'windMs', label: 'Wind m/s (gusts dotted)', fmt: (v) => v.toFixed(1), extra: 'gustMs' },
  { key: 'visibilityM', label: 'Visibility m', fmt: (v) => Math.round(v), log: true },
  { key: 'cumSnowCm', label: 'Snow fallen cm', fmt: (v) => v.toFixed(0) },
];
// the points each row draws (no DOM): what the chart shows, straight from the record
export function seriesOf(record, t0, t1) {
  const recs = record.records.map((r) => ({ ...r, t: toSec(r.time) })).filter((r) => r.t >= t0 - 3600 && r.t <= t1 + 3600);
  return Object.fromEntries(ROWS.map((row) => [row.key, recs.filter((r) => r[row.key] != null).map((r) => ({ t: r.t, v: r[row.key], time: r.time }))]));
}
export function drawWeather(canvas, record, { t0, t1, now = null, hoverT = null } = {}) {
  const k = devicePixelRatio || 1; canvas.width = canvas.clientWidth * k; canvas.height = canvas.clientHeight * k;
  const g = canvas.getContext('2d'); const W = canvas.width; const H = canvas.height; const css = getComputedStyle(document.documentElement);
  const fg = css.getPropertyValue('--fg').trim(); const muted = css.getPropertyValue('--muted').trim(); const accent = css.getPropertyValue('--accent').trim();
  const recs = record.records.map((r) => ({ ...r, t: toSec(r.time) })).filter((r) => r.t >= t0 - 3600 && r.t <= t1 + 3600);
  const left = 120 * k; const rowH = H / ROWS.length; g.clearRect(0, 0, W, H); g.font = `${11 * k}px system-ui`;
  const x = (t) => left + ((t - t0) / (t1 - t0)) * (W - left - 8 * k);
  ROWS.forEach((row, q) => {
    const top = q * rowH + 6 * k; const h = rowH - 14 * k;
    const vals = recs.map((r) => r[row.key]).concat(row.extra ? recs.map((r) => r[row.extra] ?? r[row.key]) : []).filter((v) => v != null);
    let lo = Math.min(...vals); let hi = Math.max(...vals); if (row.log) { lo = Math.log(Math.max(100, lo)); hi = Math.log(Math.max(lo + 1, hi)); } if (hi - lo < 1e-6) hi = lo + 1;
    const y = (v) => top + h * (1 - ((row.log ? Math.log(Math.max(100, v)) : v) - lo) / (hi - lo));
    g.fillStyle = muted; g.fillText(row.label, 4 * k, top + 12 * k);
    const unlog = (v) => (row.log ? Math.exp(v) : v); g.fillText(`${row.fmt(unlog(lo))} – ${row.fmt(unlog(hi))}`, 4 * k, top + 26 * k);
    const series = (key, dash) => { g.strokeStyle = fg; g.lineWidth = 1.5 * k; g.setLineDash(dash); g.beginPath(); let started = false; for (const r of recs) { const v = r[key]; if (v == null) continue; started ? g.lineTo(x(r.t), y(v)) : g.moveTo(x(r.t), y(v)); started = true; } g.stroke(); g.setLineDash([]); };
    series(row.key, []); if (row.extra) series(row.extra, [2 * k, 3 * k]);
    for (const r of recs) if (r[row.key] != null) { g.fillStyle = fg; g.fillRect(x(r.t) - 1.5 * k, y(r[row.key]) - 1.5 * k, 3 * k, 3 * k); }
  });
  if (now != null) { g.fillStyle = accent; g.fillRect(x(now) - k, 0, 2 * k, H); }
  if (hoverT != null && recs.length) {
    const r = recs.reduce((a, b) => (Math.abs(b.t - hoverT) < Math.abs(a.t - hoverT) ? b : a));
    g.strokeStyle = muted; g.setLineDash([3 * k, 3 * k]); g.beginPath(); g.moveTo(x(r.t), 0); g.lineTo(x(r.t), H); g.stroke(); g.setLineDash([]);
    return r;
  }
  return null;
}
export function describeObservation(r) {
  return `${r.time.replace('T', ' ')} (${r.utc}): ${r.tempC.toFixed(1)} °C, wind from ${r.windFromDeg ?? '—'}° at ${r.windMs.toFixed(1)} m/s${r.gustMs ? `, gusts ${r.gustMs.toFixed(1)}` : ''}, visibility ${Math.round(r.visibilityM)} m, ${r.precipIn != null ? `${(r.precipIn * 25.4).toFixed(1)} mm` : '—'} in the hour → ${r.snowCm.toFixed(1)} cm of snow (total ${r.cumSnowCm.toFixed(0)} cm)${r.wx ? `, ${r.wx}` : ''}`;
}
