// NAD83(2011) / UTM zone 18N (EPSG:6347), the system NOAA serves the 2017 NYC point cloud in
// (D-017). Transverse Mercator on GRS80 (Snyder, Map Projections: A Working Manual, 1987,
// eqs. 8-9 to 8-25). Accurate to millimetres within the zone. NAD83(2011) vs WGS84 as in D-016.

const A = 6378137.0;
const F = 1 / 298.257222101;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;
const FE = 500000;
const LON0 = -75 * Math.PI / 180; // zone 18
const RAD = Math.PI / 180;

const M = (p) => A * ((1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256) * p
  - (3 * E2 / 8 + 3 * E2 ** 2 / 32 + 45 * E2 ** 3 / 1024) * Math.sin(2 * p)
  + (15 * E2 ** 2 / 256 + 45 * E2 ** 3 / 1024) * Math.sin(4 * p)
  - (35 * E2 ** 3 / 3072) * Math.sin(6 * p));

// (lat, lon) degrees -> (E, N) metres
export function toUtm18(lat, lon) {
  const p = lat * RAD; const l = lon * RAD;
  const N = A / Math.sqrt(1 - E2 * Math.sin(p) ** 2);
  const T = Math.tan(p) ** 2; const C = EP2 * Math.cos(p) ** 2; const Aa = (l - LON0) * Math.cos(p);
  const x = K0 * N * (Aa + (1 - T + C) * Aa ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5 / 120);
  const y = K0 * (M(p) + N * Math.tan(p) * (Aa * Aa / 2 + (5 - T + 9 * C + 4 * C * C) * Aa ** 4 / 24
    + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6 / 720));
  return [FE + x, y];
}

// (E, N) metres -> (lat, lon) degrees
export function fromUtm18(E, Nn) {
  const m = Nn / K0;
  const mu = m / (A * (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const N1 = A / Math.sqrt(1 - E2 * Math.sin(p1) ** 2);
  const T1 = Math.tan(p1) ** 2; const C1 = EP2 * Math.cos(p1) ** 2;
  const R1 = A * (1 - E2) / (1 - E2 * Math.sin(p1) ** 2) ** 1.5;
  const D = (E - FE) / (N1 * K0);
  const lat = p1 - (N1 * Math.tan(p1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = LON0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(p1);
  return [lat / RAD, lon / RAD];
}
