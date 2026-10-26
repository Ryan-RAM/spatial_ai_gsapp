// Distance-over-time chart for the current round (canvas, no library).
// Left axis: Euclidean and path distance in cells, with the 9-cell vision and 12-cell hearing limits.
// Right axis: perceptual distance (difference between visibility fingerprints).

export function makeChart(canvas, tooltip) {
  let palette = null;
  let data = null;
  let config = null;
  let hoverStep = null;

  function niceMax(v, step) { return Math.max(step, Math.ceil(v / step) * step); }

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const narrow = w < 480;
    return { dpr, w, h, left: 40, right: narrow ? 40 : 52, top: 14, bottom: 30 };
  }

  function draw() {
    if (!data || !palette) return;
    const L = layout();
    const g = canvas.getContext('2d');
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    g.clearRect(0, 0, L.w, L.h);
    const pw = L.w - L.left - L.right;
    const ph = L.h - L.top - L.bottom;
    const maxStep = config.maxSteps;
    const cellsMax = niceMax(Math.max(16, ...data.map((d) => Math.max(d.euclidean, Number.isFinite(d.path) ? d.path : 0))), 10);
    const percMax = niceMax(Math.max(40, ...data.map((d) => d.perceptual)), 20);
    const X = (s) => L.left + (s / maxStep) * pw;
    const Y = (v) => L.top + ph - (v / cellsMax) * ph;
    const YP = (v) => L.top + ph - (v / percMax) * ph;

    g.font = '11px system-ui, sans-serif';
    g.lineWidth = 1;
    // grid + left ticks
    g.strokeStyle = palette.grid;
    g.fillStyle = palette.muted;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let v = 0; v <= cellsMax; v += 10) {
      g.beginPath(); g.moveTo(L.left, Y(v)); g.lineTo(L.left + pw, Y(v)); g.stroke();
      g.fillText(String(v), L.left - 6, Y(v));
    }
    g.textAlign = 'left';
    for (let v = 0; v <= percMax; v += percMax / 4) g.fillText(String(Math.round(v)), L.left + pw + 6, YP(v));
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let s = 0; s <= maxStep; s += 100) g.fillText(String(s), X(s), L.top + ph + 6);
    g.fillText('Step', L.left + pw / 2, L.top + ph + 17);

    // thresholds
    const limit = (v, label, color, right) => {
      g.strokeStyle = color;
      g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(L.left, Y(v)); g.lineTo(L.left + pw, Y(v)); g.stroke();
      g.setLineDash([]);
      g.fillStyle = color;
      g.textAlign = right ? 'right' : 'left';
      g.textBaseline = 'bottom';
      g.fillText(label, right ? L.left + pw - 4 : L.left + 4, Y(v) - 2);
    };
    limit(config.visionRange, `Vision limit ${config.visionRange}`, palette.euclidean, true);
    limit(config.hearingRange, `Hearing limit ${config.hearingRange}`, palette.path);

    const series = (key, color, yfn, width) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.lineJoin = 'round';
      g.beginPath();
      data.forEach((d, i) => { const x = X(d.step); const y = yfn(d[key]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
    };
    series('perceptual', palette.perceptual, YP, 1.5);
    series('path', palette.path, Y, 2);
    series('euclidean', palette.euclidean, Y, 2);

    // hover crosshair
    if (hoverStep !== null) {
      const d = data.find((p) => p.step === hoverStep);
      if (d) {
        g.strokeStyle = palette.muted;
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(X(d.step), L.top); g.lineTo(X(d.step), L.top + ph); g.stroke();
        for (const [key, color, yfn] of [['euclidean', palette.euclidean, Y], ['path', palette.path, Y], ['perceptual', palette.perceptual, YP]]) {
          g.fillStyle = color;
          g.beginPath(); g.arc(X(d.step), yfn(d[key]), 3.5, 0, Math.PI * 2); g.fill();
        }
      }
    }
  }

  canvas.addEventListener('pointermove', (ev) => {
    if (!data) return;
    const L = layout();
    const rect = canvas.getBoundingClientRect();
    const s = Math.round(((ev.clientX - rect.left - L.left) / (L.w - L.left - L.right)) * config.maxSteps);
    const last = data[data.length - 1].step;
    if (s < 0 || s > last) { hoverStep = null; tooltip.hidden = true; draw(); return; }
    hoverStep = s;
    const d = data.find((p) => p.step === s);
    if (d) {
      tooltip.hidden = false;
      tooltip.innerHTML = `<b>Step ${d.step}</b><br>Euclidean ${d.euclidean.toFixed(1)}<br>Path ${d.path.toFixed(1)}<br>Perceptual ${d.perceptual.toFixed(1)}`;
      const x = ev.clientX - rect.left;
      tooltip.style.left = `${Math.min(x + 12, rect.width - 130)}px`;
      tooltip.style.top = '8px';
    }
    draw();
  });
  canvas.addEventListener('pointerleave', () => { hoverStep = null; tooltip.hidden = true; draw(); });
  new ResizeObserver(() => draw()).observe(canvas);

  return {
    update(history, cfg) { data = history; config = cfg; draw(); },
    setPalette(p) { palette = p; draw(); },
  };
}
