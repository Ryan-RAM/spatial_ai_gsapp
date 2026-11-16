// 3D line of sight over the real place (semantic model §6.1).
// Ported from 20261022_distance/src/sim/los.js (castRay: a 2D DDA over the grid columns, after
// Amanatides & Woo, testing the height range the ray passes through in each column). Changes:
//   - the ground is the DEM, interpolated bilinearly, not a plane at z = 0; the ray is tested
//     against it at the entry, middle and exit of every cell, then refined by bisection
//   - structures block up to their surveyed height (world.structTop)
//   - tree trunks and evergreen crowns are exact vertical cylinders (world.solids), not cells
//   - units are metres of frame W; the grid is the 3 m world grid
// No DOM, no imports.

export const EYE = 1.5; // m above the ground: the eye point of an agent and of the fingerprint rays

// Distance along the unit direction (dx, dy, dz) from (ox, oy, oz) to the first solid, or maxT.
// Leaving the grid counts as open (nothing modelled beyond it).
export function castRay(world, ox, oy, oz, dx, dy, dz, maxT) {
  const { W, H, s, minX, maxY, structTop, solids } = world;
  // grid coordinates: u east in cells from the west edge, v south in cells from the north edge
  const u0 = (ox - minX) / s; const v0 = (maxY - oy) / s;
  const du = dx / s; const dv = -dy / s;
  let ci = Math.floor(u0); let cj = Math.floor(v0);
  const stepI = du > 0 ? 1 : -1; const stepJ = dv > 0 ? 1 : -1;
  const adu = Math.abs(du); const adv = Math.abs(dv); const eps = 1e-12;
  let tMaxI = adu > eps ? (du > 0 ? ci + 1 - u0 : u0 - ci) / adu : Infinity;
  let tMaxJ = adv > eps ? (dv > 0 ? cj + 1 - v0 : v0 - cj) / adv : Infinity;
  const tDeltaI = adu > eps ? 1 / adu : Infinity; const tDeltaJ = adv > eps ? 1 / adv : Infinity;
  let t0 = 0;
  const below = (t) => oz + dz * t < world.groundAt(ox + dx * t, oy + dy * t);
  for (let guard = 0; guard < 4096; guard++) {
    if (ci < 0 || cj < 0 || ci >= W || cj >= H) return maxT;
    const t1 = Math.min(tMaxI, tMaxJ, maxT);
    const k = cj * W + ci;
    let hit = Infinity;
    // terrain: entry, middle, exit; bisect the first crossing
    const tm = (t0 + t1) / 2;
    let prev = t0;
    for (const t of [t0, tm, t1]) {
      if (below(t)) {
        let lo = prev; let hi = t;
        if (lo === hi) { hit = t; break; }
        while (hi - lo > 0.01) { const mid = (lo + hi) / 2; if (below(mid)) hi = mid; else lo = mid; } // to 1 cm
        hit = hi; break;
      }
      prev = t;
    }
    // structure column: solid from the ground up to structTop
    const top = structTop[k];
    if (top > -Infinity) {
      const za = oz + dz * t0; const zb = oz + dz * t1;
      if (za <= top) hit = Math.min(hit, t0);
      else if (zb <= top) hit = Math.min(hit, t0 + (top - za) / (zb - za) * (t1 - t0));
    }
    // trunks and evergreen crowns: ray vs vertical cylinder, in the plane, then the height range
    if (solids) {
      for (let q = solids.cellStart[k]; q < solids.cellStart[k + 1]; q++) {
        const id = solids.ids[q];
        const ex = ox - solids.x[id]; const ey = oy - solids.y[id]; const r = solids.r[id];
        const a = dx * dx + dy * dy; if (a < 1e-12) continue;
        const b = ex * dx + ey * dy; const c = ex * ex + ey * ey - r * r;
        if (c < 0) continue; // the origin is inside this solid (nobody stands inside a trunk): ignore it
        const disc = b * b - a * c; if (disc < 0) continue;
        const sq = Math.sqrt(disc);
        let tin = (-b - sq) / a; const tout = (-b + sq) / a;
        if (tout < 0) continue; if (tin < 0) tin = 0;
        if (tin > t1 + 1e-9 || tout < t0 - 1e-9) continue;
        const zin = oz + dz * tin;
        if (zin >= solids.z0[id] && zin <= solids.z1[id]) { hit = Math.min(hit, tin); continue; }
        // enters through the top or the bottom face
        const zt = dz > 0 ? solids.z0[id] : solids.z1[id];
        if (Math.abs(dz) > eps) { const tz = (zt - oz) / dz; if (tz >= tin && tz <= tout) hit = Math.min(hit, tz); }
      }
    }
    if (hit <= t1) return Math.max(0, Math.min(hit, maxT));
    if (t1 >= maxT) return maxT;
    if (tMaxI < tMaxJ) { t0 = tMaxI; tMaxI += tDeltaI; ci += stepI; } else { t0 = tMaxJ; tMaxJ += tDeltaJ; cj += stepJ; }
  }
  return maxT;
}

// The eye point of a position: EYE metres above the ground.
export const eyeAt = (world, x, y, eye = EYE) => [x, y, world.groundAt(x, y) + eye];

// Is the straight segment between two points free of solids?
export function segmentClear(world, a, b) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1]; const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz); if (len < 1e-9) return true;
  return castRay(world, a[0], a[1], a[2], dx / len, dy / len, dz / len, len) >= len - 1e-6;
}
