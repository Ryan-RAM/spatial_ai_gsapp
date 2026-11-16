// Turning vector geometry (in metres of frame W) into grid layers: polygons filled by cell
// centre, lines drawn with a width, and multipolygon rings assembled from OSM member ways.
// Used by the bake scripts; no DOM.

// Even-odd test of a point against a set of rings (outer and inner rings alike): a point inside
// an inner ring of a multipolygon is inside two rings and so counts as outside.
export function pointInRings(x, y, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const [xa, ya] = ring[a]; const [xb, yb] = ring[b];
      if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
    }
  }
  return inside;
}

// Calls fn(idx) for every cell whose centre lies inside the rings.
export function fillRings(grid, rings, fn) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const r of rings) for (const [x, y] of r) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const { W, H, cellSize: s, bbox } = grid;
  const i0 = Math.max(0, Math.floor((minX - bbox.minX) / s)); const i1 = Math.min(W - 1, Math.floor((maxX - bbox.minX) / s));
  const j0 = Math.max(0, Math.floor((bbox.maxY - maxY) / s)); const j1 = Math.min(H - 1, Math.floor((bbox.maxY - minY) / s));
  for (let j = j0; j <= j1; j++) {
    const y = bbox.maxY - (j + 0.5) * s;
    for (let i = i0; i <= i1; i++) {
      const x = bbox.minX + (i + 0.5) * s;
      if (pointInRings(x, y, rings)) fn(j * W + i);
    }
  }
}

// Calls fn(idx) for every cell whose centre is within `halfWidth` of the polyline. A floor of
// 0.75 cell keeps any line, including a diagonal one, connected through edge-sharing cells.
export function drawLine(grid, pts, halfWidth, fn) {
  const { W, H, cellSize: s, bbox } = grid;
  const r = Math.max(halfWidth, 0.75 * s);
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, ay] = pts[k]; const [bx, by] = pts[k + 1];
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - bbox.minX) / s));
    const i1 = Math.min(W - 1, Math.floor((Math.max(ax, bx) + r - bbox.minX) / s));
    const j0 = Math.max(0, Math.floor((bbox.maxY - Math.max(ay, by) - r) / s));
    const j1 = Math.min(H - 1, Math.floor((bbox.maxY - Math.min(ay, by) + r) / s));
    const dx = bx - ax; const dy = by - ay; const len2 = dx * dx + dy * dy || 1e-12;
    for (let j = j0; j <= j1; j++) {
      const y = bbox.maxY - (j + 0.5) * s;
      for (let i = i0; i <= i1; i++) {
        const x = bbox.minX + (i + 0.5) * s;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
        if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= r) fn(j * W + i);
      }
    }
  }
}

// Joins open way segments end to end into closed rings (the members of an OSM multipolygon).
// `segments` are arrays of node ids; returns arrays of node ids, each closed (first === last).
export function assembleRings(segments) {
  const open = segments.filter((s) => s.length > 1).map((s) => s.slice());
  const rings = [];
  while (open.length) {
    let ring = open.shift();
    let grew = true;
    while (ring[0] !== ring[ring.length - 1] && grew) {
      grew = false;
      for (let k = 0; k < open.length; k++) {
        const s = open[k]; const end = ring[ring.length - 1];
        if (s[0] === end) ring = ring.concat(s.slice(1));
        else if (s[s.length - 1] === end) ring = ring.concat(s.slice(0, -1).reverse());
        else continue;
        open.splice(k, 1); grew = true; break;
      }
    }
    if (ring[0] === ring[ring.length - 1] && ring.length >= 4) rings.push(ring);
  }
  return rings;
}
