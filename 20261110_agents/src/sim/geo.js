// Local metric frame for the site and small geometry helpers.
// x = metres east of the south-west corner, y = metres north of it, z = metres above sea level.
// An equirectangular projection around the site's middle latitude: over 12 km its scale error is
// well under 0.1 %, far below the 50 m planning cell. The Python data script uses the same formula.

const R = 6371008.8; // mean Earth radius (m)
const D2R = Math.PI / 180;

export function makeFrame(site) {
  const lat0 = (site.south + site.north) / 2;
  const kx = R * Math.cos(lat0 * D2R) * D2R;
  const ky = R * D2R;
  const toXY = (lat, lon) => [(lon - site.west) * kx, (lat - site.south) * ky];
  const toLatLon = (x, y) => [site.south + y / ky, site.west + x / kx];
  const width = (site.east - site.west) * kx;
  const height = (site.north - site.south) * ky;
  return { site: { ...site }, lat0, kx, ky, toXY, toLatLon, width, height };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const dist2 = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// Compass bearing (deg, 0 = north, clockwise) of the vector (dx east, dy north).
export const bearingDeg = (dx, dy) => ((Math.atan2(dx, dy) / D2R) + 360) % 360;
// Heading in the math convention (rad, 0 = east, counter-clockwise) to a compass bearing.
export const headingToBearing = (h) => ((90 - h / D2R) % 360 + 360) % 360;

export function pointInPoly(x, y, p) { // p = flat [x0, y0, x1, y1, ...]
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polyArea(p) {
  let a = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += (p[j] * p[i + 1]) - (p[i] * p[j + 1]);
  return Math.abs(a) / 2;
}

export function polyBounds(p) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
    if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1];
  }
  return [x0, y0, x1, y1];
}

export function polyCentroid(p) {
  let x = 0, y = 0; const n = p.length / 2;
  for (let i = 0; i < p.length; i += 2) { x += p[i]; y += p[i + 1]; }
  return [x / n, y / n];
}

// Closest point on segment ab to p, and the parameter t.
export function closestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  const t = L > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1) : 0;
  return [ax + dx * t, ay + dy * t, t];
}
