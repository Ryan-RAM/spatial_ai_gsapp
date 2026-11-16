// Composes the final grid layers the simulation reads (ROADMAP M1.6, semantic model §3.2) from the
// baked source layers (cover.bin from OSM, terrain.bin from the DEM, canopy.bin from the point
// cloud):
//   data/baked/world.bin + world.json
//     cover      Uint8   OSM cover + thickets (dense low vegetation in woodland) + rock outcrops (steep bumps)
//     z          Float32 m NAVD88
//     slope      Uint8   degrees
//     openness   Uint8   0-255: exposure to sky and wind = terrain openness x canopy shelter
//     canopy     Uint8   0-255 share of the cell under crowns
//     canopyEv   Uint8   0-255 share under evergreen crowns
//     structH    Uint8   structure height above ground, 0.5 m steps
//     drift_*    Uint8 x 8  snow drift factor x 100 for winds from N, NE, ... NW (terrain lee, damped under canopy)
// Run: npm run bake:world

import { readFileSync, writeFileSync } from 'node:fs';
import { CONFIG } from '../../src/sim/config.js';
import { COVER, COVER_NAMES } from '../../src/sim/cover.js';
import { WIND_DIRS } from '../../src/data/terrain.js';

export const RULES = {
  thicketLowVeg: 0.15,      // share of returns 0.5-3 m above ground (D-020)
  thicketMajority: 5,       // of the 3 x 3 cells around, including itself
  rockSlope: 30,            // degrees
  rockRelief: 0.3,          // m above the mean of the 5 x 5 cells around
  shelterCanopy: 0.5,       // openness x (1 - 0.5 canopy - 0.4 evergreen canopy)
  shelterEvergreen: 0.4,
  driftCanopyDamping: 0.6,  // drift = 1 + (terrain drift - 1) x (1 - 0.6 canopy)
};

const baked = new URL('../baked/', import.meta.url);
const read = (f) => new Uint8Array(readFileSync(new URL(f, baked)));
const W = JSON.parse(readFileSync(new URL('meta.json', baked), 'utf8')).W;
const H = JSON.parse(readFileSync(new URL('meta.json', baked), 'utf8')).H;
const n = W * H;

const coverOsm = read('cover.bin');
const tMeta = JSON.parse(readFileSync(new URL('terrain.json', baked), 'utf8'));
const tBuf = read('terrain.bin');
const sec = (name) => tMeta.sections.find((s) => s.name === name);
const z = new Float32Array(tBuf.buffer.slice(sec('z').offset, sec('z').offset + n * 4));
const slope = tBuf.slice(sec('slope').offset, sec('slope').offset + n);
const terrainOpen = tBuf.slice(sec('openness').offset, sec('openness').offset + n);
const structH = read('structure.bin');
const can = read('canopy.bin');
const canopy = can.slice(0, n); const canopyEv = can.slice(n, 2 * n); const lowVeg = can.slice(2 * n, 3 * n);

// ------------------------------------------------------------------ cover: thickets and outcrops

const cover = coverOsm.slice();
const dense = new Uint8Array(n);
for (let k = 0; k < n; k++) dense[k] = coverOsm[k] === COVER.WOODLAND && lowVeg[k] / 255 / 4 >= RULES.thicketLowVeg ? 1 : 0;
let thickets = 0; let rocks = 0;
for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
  const k = j * W + i; if (!dense[k]) continue;
  let s = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) s += dense[k + dj * W + di];
  if (s >= RULES.thicketMajority) { cover[k] = COVER.THICKET; thickets++; }
}
for (let j = 2; j < H - 2; j++) for (let i = 2; i < W - 2; i++) {
  const k = j * W + i;
  if (![COVER.LAWN, COVER.WOODLAND, COVER.THICKET].includes(cover[k]) || slope[k] < RULES.rockSlope) continue;
  let s = 0; for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) s += z[k + dj * W + di];
  if (z[k] - s / 25 > RULES.rockRelief) { cover[k] = COVER.ROCK; rocks++; }
}

// ------------------------------------------------------------------ openness and drift

const openness = new Uint8Array(n);
for (let k = 0; k < n; k++) {
  const shelter = 1 - RULES.shelterCanopy * (canopy[k] / 255) - RULES.shelterEvergreen * (canopyEv[k] / 255);
  openness[k] = Math.round(terrainOpen[k] * Math.max(0.05, shelter));
}
const drift = WIND_DIRS.map((d) => {
  const t = tBuf.slice(sec(`drift_${d.name}`).offset, sec(`drift_${d.name}`).offset + n);
  const out = new Uint8Array(n);
  for (let k = 0; k < n; k++) out[k] = Math.round(100 + (t[k] - 100) * (1 - RULES.driftCanopyDamping * (canopy[k] / 255)));
  return out;
});

// ------------------------------------------------------------------ write

const parts = [
  ['cover', 'uint8', cover], ['z', 'float32', new Uint8Array(z.buffer)], ['slope', 'uint8', slope],
  ['openness', 'uint8', openness], ['canopy', 'uint8', canopy], ['canopyEv', 'uint8', canopyEv],
  ['structH', 'uint8', structH],
  ...WIND_DIRS.map((d, k) => [`drift_${d.name}`, 'uint8', drift[k]]),
];
// z first is not required, but keep Float32 sections 4-byte aligned for typed-array views
const ordered = [parts[1], ...parts.filter((p) => p[0] !== 'z')];
let off = 0; const sections = ordered.map(([name, type, bytes]) => { const s = { name, type, offset: off, bytes: bytes.byteLength }; off += bytes.byteLength; return s; });
const out = new Uint8Array(off); ordered.forEach(([, , bytes], k) => out.set(bytes, sections[k].offset));
writeFileSync(new URL('world.bin', baked), out);
const counts = Object.fromEntries(COVER_NAMES.map((name, code) => [name, cover.reduce((s, v) => s + (v === code), 0)]));
writeFileSync(new URL('world.json', baked), JSON.stringify({
  file: 'world.bin', W, H, cellSize: CONFIG.cellSize, layout: 'idx = j * W + i, row 0 north', sections,
  legend: COVER_NAMES, counts, rules: RULES, windDirs: WIND_DIRS.map((d) => d.name),
  sources: ['cover.bin (OpenStreetMap)', 'terrain.bin (2017 NYC LiDAR DEM)', 'canopy.bin (2017 NYC LiDAR point cloud)'],
}, null, 2) + '\n');
console.log(`world.bin: ${(off / 1e6).toFixed(2)} MB; +${thickets} thicket cells, +${rocks} rock cells; cover ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
