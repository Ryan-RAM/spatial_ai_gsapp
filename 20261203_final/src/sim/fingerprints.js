// Visibility fingerprints (semantic model §6.4), baked by data/scripts/bake-rays.mjs: d_V is the
// root-mean-square difference of two cells' 362 ray lengths, in metres. A pseudometric: two
// different cells that look the same from inside have d_V = 0. No DOM.

export function attachFingerprints(world, json, bin) {
  const bytes = bin instanceof Uint8Array ? bin : new Uint8Array(bin);
  const idx = new Int32Array(bytes.slice(0, json.count * 4).buffer);
  const rows = bytes.subarray(json.count * 4);
  const rowOf = new Int32Array(world.n).fill(-1);
  idx.forEach((k, r) => { rowOf[k] = r; });
  world.fp = { rays: json.rays, step: json.step, rows, rowOf, horizonRing: json.horizonRing, azimuths: 72 };
  return world.fp;
}

export function perceptualDistance(world, a, b) {
  const { rows, rowOf, rays, step } = world.fp;
  const ra = rowOf[a]; const rb = rowOf[b];
  if (ra < 0 || rb < 0) return Infinity;
  let s = 0; const oa = ra * rays; const ob = rb * rays;
  for (let q = 0; q < rays; q++) { const d = rows[oa + q] - rows[ob + q]; s += d * d; }
  return Math.sqrt(s / rays) * step;
}

// the occlusion horizon: how far the eye-level ray of cell k reaches toward a bearing (degrees)
export function horizonAt(world, k, bearingDeg) {
  const { rows, rowOf, rays, step, horizonRing, azimuths } = world.fp;
  const r = rowOf[k]; if (r < 0) return 0;
  const f = (((bearingDeg % 360) + 360) % 360) / (360 / azimuths);
  const a0 = Math.floor(f) % azimuths; const a1 = (a0 + 1) % azimuths; const u = f - Math.floor(f);
  const base = r * rays + horizonRing * azimuths;
  // the shorter of the two neighbouring rays: conservative between them
  return Math.min(rows[base + a0], u > 0 ? rows[base + a1] : rows[base + a0]) * step;
}
