// The fitness curve (ROADMAP M6.6): one point per epoch, the kept ones marked, with the escape,
// catch and collapse rates underneath. Canvas 2D, colours from the page's CSS tokens.
export function drawCurve(canvas, history, { key = 'fitness' } = {}) {
  const k = devicePixelRatio || 1; canvas.width = canvas.clientWidth * k; canvas.height = canvas.clientHeight * k;
  const g = canvas.getContext('2d'); const W = canvas.width; const H = canvas.height; const css = getComputedStyle(document.documentElement);
  const fg = css.getPropertyValue('--fg').trim(); const muted = css.getPropertyValue('--muted').trim(); const accent = css.getPropertyValue('--accent').trim();
  g.clearRect(0, 0, W, H); g.font = `${11 * k}px system-ui`;
  const pad = 30 * k; const top = 10 * k; const fitH = (H - top - pad) * 0.62; const rateTop = top + fitH + 14 * k; const rateH = H - pad - rateTop;
  if (!history.length) { g.fillStyle = muted; g.fillText('No epochs yet', pad, top + 20 * k); return; }
  const n = Math.max(2, history.length); const x = (q) => pad + (q / (n - 1)) * (W - pad - 10 * k);
  const vals = history.map((h) => h.metrics[key]); let lo = Math.min(...vals, 0); let hi = Math.max(...vals, 0.1); if (hi - lo < 0.1) hi = lo + 0.1;
  const y = (v) => top + fitH * (1 - (v - lo) / (hi - lo));
  g.strokeStyle = muted; g.lineWidth = k; g.beginPath(); g.moveTo(pad, y(0)); g.lineTo(W, y(0)); g.stroke();
  g.fillStyle = muted; g.fillText(hi.toFixed(2), 2 * k, top + 10 * k); g.fillText(lo.toFixed(2), 2 * k, top + fitH); g.fillText(key === 'Fprime' ? 'F′ (creature)' : 'F (survivors)', pad + 4 * k, top + 10 * k);
  // the best so far: a step line
  g.strokeStyle = accent; g.lineWidth = 2 * k; g.beginPath(); let best = -Infinity;
  history.forEach((h, q) => { if (h.kept) best = h.metrics[key]; if (!Number.isFinite(best)) best = h.metrics[key]; q ? g.lineTo(x(q), y(best)) : g.moveTo(x(q), y(best)); }); g.stroke();
  history.forEach((h, q) => { g.fillStyle = h.kept ? accent : muted; g.beginPath(); g.arc(x(q), y(h.metrics[key]), (h.kept ? 3.5 : 2) * k, 0, Math.PI * 2); g.fill(); });
  // the rates underneath
  const lines = [['escapeRate', fg, 'escaped'], ['catchRate', '#e0705a', 'caught'], ['collapseRate', '#7fa7e6', 'cold']];
  lines.forEach(([m, col, label], li) => {
    g.strokeStyle = col; g.lineWidth = 1.5 * k; g.beginPath();
    history.forEach((h, q) => { const v = rateTop + rateH * (1 - h.metrics[m]); q ? g.lineTo(x(q), v) : g.moveTo(x(q), v); }); g.stroke();
    g.fillStyle = col; g.fillText(label, pad + li * 70 * k, H - 6 * k);
  });
  g.fillStyle = muted; g.textAlign = 'right'; g.fillText(`epoch ${history.length - 1}`, W - 4 * k, H - 6 * k); g.textAlign = 'left';
}
