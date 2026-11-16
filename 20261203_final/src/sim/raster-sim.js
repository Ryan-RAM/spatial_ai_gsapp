// Drawing a polyline (metres of frame W) onto the world grid: every cell whose centre lies within
// halfWidth of it. The simulation-side twin of src/data/raster.js drawLine, for the world object.
export function drawLineCells(world, pts, halfWidth, fn) {
  const { W, H, s, minX, maxY } = world;
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, ay] = pts[k]; const [bx, by] = pts[k + 1];
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - halfWidth - minX) / s)); const i1 = Math.min(W - 1, Math.floor((Math.max(ax, bx) + halfWidth - minX) / s));
    const j0 = Math.max(0, Math.floor((maxY - Math.max(ay, by) - halfWidth) / s)); const j1 = Math.min(H - 1, Math.floor((maxY - Math.min(ay, by) + halfWidth) / s));
    const dx = bx - ax; const dy = by - ay; const L2 = dx * dx + dy * dy || 1e-12;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = minX + (i + 0.5) * s; const y = maxY - (j + 0.5) * s;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= halfWidth) fn(j * W + i);
    }
  }
}
