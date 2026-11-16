// NAD83(2011) / New York Long Island (ftUS), EPSG:6539: the projected system of the 2017 NYC DEM
// (D-012). Lambert conformal conic with two standard parallels on the GRS80 ellipsoid (EPSG
// guidance note 7-2, method 9802). Heights in the DEM are NAVD88 in US survey feet.
// NAD83(2011) and WGS84 differ by about 1-1.5 m in New York, under half a 3 m cell; the bake
// ignores the difference (D-016).

export const FT_US = 1200 / 3937; // metres per US survey foot

const A = 6378137.0;
const F = 1 / 298.257222101;
const E = Math.sqrt(F * (2 - F));
const RAD = Math.PI / 180;

const LAT1 = (41 + 2 / 60) * RAD;     // 41°02'
const LAT2 = (40 + 40 / 60) * RAD;    // 40°40'
const LAT0 = (40 + 10 / 60) * RAD;    // 40°10'
const LON0 = -74 * RAD;
const FE = 300000 / FT_US;            // 984250.0 ftUS
const FN = 0;

const m = (p) => Math.cos(p) / Math.sqrt(1 - (E * Math.sin(p)) ** 2);
const t = (p) => Math.tan(Math.PI / 4 - p / 2) / ((1 - E * Math.sin(p)) / (1 + E * Math.sin(p))) ** (E / 2);
const m1 = m(LAT1); const m2 = m(LAT2);
const t0 = t(LAT0); const t1 = t(LAT1); const t2 = t(LAT2);
const N = (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2));
const FF = m1 / (N * t1 ** N);
const R0 = (A * FF * t0 ** N) / FT_US; // in ftUS

// (lat, lon) in degrees -> (X easting, Y northing) in US survey feet
export function toStatePlane(lat, lon) {
  const r = (A * FF * t(lat * RAD) ** N) / FT_US;
  const th = N * (lon * RAD - LON0);
  return [FE + r * Math.sin(th), FN + R0 - r * Math.cos(th)];
}

// (X, Y) in US survey feet -> (lat, lon) in degrees
export function fromStatePlane(X, Y) {
  const dx = X - FE; const dy = R0 - (Y - FN);
  const r = Math.sign(N) * Math.hypot(dx, dy);
  const tt = ((r * FT_US) / (A * FF)) ** (1 / N);
  const th = Math.atan2(dx, dy);
  let p = Math.PI / 2 - 2 * Math.atan(tt);
  for (let k = 0; k < 8; k++) {
    const es = E * Math.sin(p);
    p = Math.PI / 2 - 2 * Math.atan(tt * ((1 - es) / (1 + es)) ** (E / 2));
  }
  return [p / RAD, (th / N + LON0) / RAD];
}
