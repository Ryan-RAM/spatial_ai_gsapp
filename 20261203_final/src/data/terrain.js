// Terrain-derived layers (semantic model §3.2, §4.2), computed once at bake time on a grid of
// elevations z (Float32Array, m), W x H cells of size s metres, idx = j * W + i, row 0 north.
// Pure functions on typed arrays; no DOM, no imports.

// Wind directions the drift factor is baked for: where the wind comes FROM, clockwise from north.
// (di, dj) is one step toward the wind's source on the grid (j grows southward).
export const WIND_DIRS = [
  { name: 'N', deg: 0, di: 0, dj: -1 }, { name: 'NE', deg: 45, di: 1, dj: -1 },
  { name: 'E', deg: 90, di: 1, dj: 0 }, { name: 'SE', deg: 135, di: 1, dj: 1 },
  { name: 'S', deg: 180, di: 0, dj: 1 }, { name: 'SW', deg: 225, di: -1, dj: 1 },
  { name: 'W', deg: 270, di: -1, dj: 0 }, { name: 'NW', deg: 315, di: -1, dj: -1 },
];

const clampIdx = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Slope in whole degrees (Uint8) from central differences (one-sided at the edges).
export function slopeDeg(z, W, H, s) {
  const out = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const il = clampIdx(i - 1, 0, W - 1); const ir = clampIdx(i + 1, 0, W - 1);
    const ju = clampIdx(j - 1, 0, H - 1); const jd = clampIdx(j + 1, 0, H - 1);
    const gx = (z[j * W + ir] - z[j * W + il]) / ((ir - il) * s);
    const gy = (z[ju * W + i] - z[jd * W + i]) / ((jd - ju) * s);
    out[j * W + i] = Math.round((Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI);
  }
  return out;
}

// Terrain openness to the sky, 0-255 (= 0-1): along 8 directions out to `radius` metres, the
// highest elevation angle of the surrounding ground; openness = 1 - mean(max(0, sin(angle))).
// 1 on flat ground and on tops, lower in hollows and at the foot of a rock face.
export function terrainOpenness(z, W, H, s, radius) {
  const out = new Uint8Array(W * H);
  const steps = Math.max(1, Math.round(radius / s));
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const z0 = z[j * W + i]; let acc = 0;
    for (const { di, dj } of WIND_DIRS) {
      let best = 0; const step = Math.hypot(di, dj) * s;
      for (let k = 1; k <= steps; k++) {
        const ni = i + di * k; const nj = j + dj * k; if (ni < 0 || nj < 0 || ni >= W || nj >= H) break;
        const a = Math.atan2(z[nj * W + ni] - z0, k * step); if (a > best) best = a;
      }
      acc += Math.sin(best);
    }
    out[j * W + i] = Math.round(255 * (1 - acc / 8));
  }
  return out;
}

// Winstral's Sx: the maximum upwind slope, in degrees, looking toward the wind's source up to
// `fetch` metres. Positive in the lee of higher ground (snow is deposited), negative on exposed
// ground that stands above its upwind surroundings (snow is scoured). Float32Array.
export function upwindSx(z, W, H, s, dir, fetch) {
  const out = new Float32Array(W * H);
  const step = Math.hypot(dir.di, dir.dj) * s;
  const steps = Math.max(1, Math.round(fetch / step));
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const z0 = z[j * W + i]; let best = -Infinity;
    for (let k = 1; k <= steps; k++) {
      const ni = i + dir.di * k; const nj = j + dir.dj * k; if (ni < 0 || nj < 0 || ni >= W || nj >= H) break;
      const a = Math.atan2(z[nj * W + ni] - z0, k * step); if (a > best) best = a;
    }
    out[j * W + i] = best === -Infinity ? 0 : (best * 180) / Math.PI;
  }
  return out;
}

// The terrain part of the drift factor of §4.2, 0.5-2.0, stored x100 in a Uint8Array:
// 1 on level ground, up to 2 in the lee (Sx >= 15 deg), down to 0.5 where exposed (Sx <= -7.5 deg).
export function driftFromSx(sx) {
  const out = new Uint8Array(sx.length);
  for (let k = 0; k < sx.length; k++) out[k] = Math.round(100 * Math.min(2, Math.max(0.5, 1 + sx[k] / 15)));
  return out;
}
