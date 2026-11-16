// Frame W (semantic model §5): a local east-north-up frame in metres with its origin at the
// KNYC weather station on Vista Rock, and the grid cells (i, j) laid over it.
// Exact transforms through earth-centred coordinates (WGS84), so the round trip is exact to
// floating point; over the ~1 km study area a flat-earth shortcut would also do, but this is no
// slower for the few thousand points the bake converts.
// Shared by the bake scripts, the MCP server and (for display) the page. No DOM, no imports.

const A = 6378137.0;                 // WGS84 semi-major axis, m
const F = 1 / 298.257223563;
const E2 = F * (2 - F);              // first eccentricity squared
const RAD = Math.PI / 180;

export function geodeticToEcef(lat, lon, h = 0) {
  const p = lat * RAD; const l = lon * RAD;
  const sp = Math.sin(p); const cp = Math.cos(p);
  const N = A / Math.sqrt(1 - E2 * sp * sp);
  return [(N + h) * cp * Math.cos(l), (N + h) * cp * Math.sin(l), (N * (1 - E2) + h) * sp];
}

// Bowring's method with a few fixed-point refinements: sub-millimetre everywhere on earth.
export function ecefToGeodetic(x, y, z) {
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - E2));
  let h = 0;
  for (let k = 0; k < 6; k++) {
    const sp = Math.sin(lat);
    const N = A / Math.sqrt(1 - E2 * sp * sp);
    h = p / Math.cos(lat) - N;
    lat = Math.atan2(z, p * (1 - E2 * N / (N + h)));
  }
  return [lat / RAD, lon / RAD, h];
}

// A local frame anchored at (lat0, lon0, h0). Returns converters between WGS84 and (x east, y north, z up).
export function makeEnu(lat0, lon0, h0 = 0) {
  const p = lat0 * RAD; const l = lon0 * RAD;
  const sp = Math.sin(p); const cp = Math.cos(p);
  const sl = Math.sin(l); const cl = Math.cos(l);
  const [x0, y0, z0] = geodeticToEcef(lat0, lon0, h0);
  function toEnu(lat, lon, h = h0) {
    const [x, y, z] = geodeticToEcef(lat, lon, h);
    const dx = x - x0; const dy = y - y0; const dz = z - z0;
    return [
      -sl * dx + cl * dy,
      -sp * cl * dx - sp * sl * dy + cp * dz,
      cp * cl * dx + cp * sl * dy + sp * dz,
    ];
  }
  function fromEnu(e, n, u = 0) {
    const dx = -sl * e - sp * cl * n + cp * cl * u;
    const dy = cl * e - sp * sl * n + cp * sl * u;
    const dz = cp * n + sp * u;
    return ecefToGeodetic(x0 + dx, y0 + dy, z0 + dz);
  }
  return { lat0, lon0, h0, toEnu, fromEnu };
}

// The grid over frame W. bbox is in metres of frame W: { minX, minY, maxX, maxY }.
// Cell (i, j) covers x in [minX + i*s, minX + (i+1)*s), y in [maxY - (j+1)*s, maxY - j*s):
// j grows southward so that row 0 is the north edge, like an image (idx = j * W + i).
export function makeGrid(bbox, cellSize) {
  const W = Math.ceil((bbox.maxX - bbox.minX) / cellSize);
  const H = Math.ceil((bbox.maxY - bbox.minY) / cellSize);
  const s = cellSize;
  return {
    W, H, cellSize: s, bbox,
    cellOf(x, y) {
      const i = Math.floor((x - bbox.minX) / s);
      const j = Math.floor((bbox.maxY - y) / s);
      return i >= 0 && j >= 0 && i < W && j < H ? j * W + i : -1;
    },
    center(idx) {
      const i = idx % W; const j = (idx - i) / W;
      return [bbox.minX + (i + 0.5) * s, bbox.maxY - (j + 0.5) * s];
    },
  };
}
