// Bakes the terrain (ROADMAP M1.3) from the 2017 NYC topobathymetric LiDAR bare-earth DEM
// (NOAA Digital Coast, D-012), reading only the tiles of the study area by HTTP range requests:
//   data/baked/terrain.bin   z (Float32, m NAVD88), then slope (Uint8, degrees), terrain openness
//                            (Uint8, 0-255), and the snow drift factor for 8 wind directions
//                            (8 x Uint8, factor x 100); layout in terrain.json
// The raw window is cached in data/raw/dem/ so that a re-run needs no download.
// Run: npm run bake:terrain  (add --preview for data/raw/preview-terrain.png)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CONFIG } from '../../src/sim/config.js';
import { studyArea } from '../../src/data/area.js';
import { makeGrid } from '../../src/data/geo.js';
import { openGeoTiff, httpRangeReader, readWindow } from '../../src/data/geotiff.js';
import { toStatePlane, fromStatePlane, FT_US } from '../../src/data/stateplane.js';
import { slopeDeg, terrainOpenness, upwindSx, driftFromSx, WIND_DIRS } from '../../src/data/terrain.js';
import { parseOsmXml } from '../../src/data/osm.js';
import { DEM_URL } from '../../src/data/sources.js';
import { areas, project } from '../../src/data/osm-features.js';
import { pointInRings } from '../../src/data/raster.js';

const MARGIN = 60;   // m around the bbox, so that slope, openness and upwind fetch are right at the edge
const FETCH = 100;   // m of upwind fetch for Sx (Winstral et al. 2002)

const raw = new URL('../raw/dem/', import.meta.url);
const baked = new URL('../baked/', import.meta.url);
mkdirSync(raw, { recursive: true });

const { enu, grid } = studyArea(CONFIG);
const s = CONFIG.cellSize;
const b = grid.bbox;
const M = Math.round(MARGIN / s);
const ext = makeGrid({ minX: b.minX - M * s, minY: b.minY - M * s, maxX: b.maxX + M * s, maxY: b.maxY + M * s }, s);

// ------------------------------------------------------------------ the DEM window

const tif = await openGeoTiff(httpRangeReader(DEM_URL));
const corners = [[ext.bbox.minX, ext.bbox.minY], [ext.bbox.maxX, ext.bbox.minY], [ext.bbox.maxX, ext.bbox.maxY], [ext.bbox.minX, ext.bbox.maxY]]
  .map(([x, y]) => tif.toPixel(...toStatePlane(...enu.fromEnu(x, y, 0))));
const col0 = Math.floor(Math.min(...corners.map((c) => c[0]))) - 2; const col1 = Math.ceil(Math.max(...corners.map((c) => c[0]))) + 3;
const row0 = Math.floor(Math.min(...corners.map((c) => c[1]))) - 2; const row1 = Math.ceil(Math.max(...corners.map((c) => c[1]))) + 3;
const WW = col1 - col0; const WH = row1 - row0;
const cache = new URL(`window-${col0}-${row0}-${WW}x${WH}.f32`, raw);
let win;
if (existsSync(cache)) {
  win = new Float32Array(new Uint8Array(readFileSync(cache)).buffer);
  console.log(`DEM window from cache: ${WW} x ${WH} px`);
} else {
  let n = 0;
  win = await readWindow(tif, col0, row0, col1, row1, { onTile: () => { n++; } });
  writeFileSync(cache, new Uint8Array(win.buffer));
  console.log(`DEM window downloaded: ${WW} x ${WH} px from ${n} tiles`);
}

// pixel (col, row) -> frame W, as an affine map fitted on three pixels and checked on others
// (over 1 km the projection is affine to millimetres)
const exact = (c, r) => enu.toEnu(...fromStatePlane(...tif.toProjected(c, r)), 0);
const [p00, p10, p01] = [exact(col0, row0), exact(col1, row0), exact(col0, row1)];
const ax = [(p10[0] - p00[0]) / WW, (p01[0] - p00[0]) / WH]; const ay = [(p10[1] - p00[1]) / WW, (p01[1] - p00[1]) / WH];
const affine = (c, r) => [p00[0] + ax[0] * (c - col0) + ax[1] * (r - row0), p00[1] + ay[0] * (c - col0) + ay[1] * (r - row0)];
let affineErr = 0;
for (const [c, r] of [[col1, row1], [(col0 + col1) / 2, (row0 + row1) / 2], [col0 + 100, row1 - 50]]) {
  const e = exact(c, r); const a = affine(c, r); affineErr = Math.max(affineErr, Math.hypot(e[0] - a[0], e[1] - a[1]));
}
if (affineErr > 0.05) throw new Error(`affine pixel map off by ${affineErr} m`);

// ------------------------------------------------------------------ resample: mean of the pixels whose centres fall in the cell

const N = ext.W * ext.H;
const sum = new Float64Array(N); const cnt = new Uint32Array(N);
for (let r = 0; r < WH; r++) {
  for (let c = 0; c < WW; c++) {
    const v = win[r * WW + c]; if (!Number.isFinite(v)) continue;
    const [x, y] = affine(col0 + c, row0 + r);
    const k = ext.cellOf(x, y); if (k < 0) continue;
    sum[k] += v; cnt[k]++;
  }
}
const zExt = new Float32Array(N);
let gaps = 0;
for (let k = 0; k < N; k++) { if (cnt[k]) zExt[k] = (sum[k] / cnt[k]) * FT_US; else { zExt[k] = NaN; gaps++; } }
for (let pass = 0; pass < 20 && gaps; pass++) { // fill the rare empty cells from their neighbours
  gaps = 0;
  for (let k = 0; k < N; k++) {
    if (!Number.isNaN(zExt[k])) continue;
    const i = k % ext.W; const j = (k - i) / ext.W; let ss = 0; let nn = 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di; const nj = j + dj; if (ni < 0 || nj < 0 || ni >= ext.W || nj >= ext.H) continue;
      const v = zExt[nj * ext.W + ni]; if (!Number.isNaN(v)) { ss += v; nn++; }
    }
    if (nn) zExt[k] = ss / nn; else gaps++;
  }
}
if (gaps) throw new Error(`${gaps} cells without elevation`);

// ------------------------------------------------------------------ derived layers on the extended grid, then crop

const slopeExt = slopeDeg(zExt, ext.W, ext.H, s);
const openExt = terrainOpenness(zExt, ext.W, ext.H, s, 30);
const driftExt = WIND_DIRS.map((dir) => driftFromSx(upwindSx(zExt, ext.W, ext.H, s, dir, FETCH)));

const { W, H } = grid; const n = W * H;
const crop = (src, T) => { const out = new T(n); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) out[j * W + i] = src[(j + M) * ext.W + (i + M)]; return out; };
const z = crop(zExt, Float32Array);
const slope = crop(slopeExt, Uint8Array);
const openness = crop(openExt, Uint8Array);
const drift = driftExt.map((d) => crop(d, Uint8Array));

// ------------------------------------------------------------------ checks against measured heights (OSM ele tags)

const places = JSON.parse(readFileSync(new URL('places.json', baked), 'utf8')).places;
const vista = places.find((p) => p.id === 'vista-rock');
const vistaTop = z[grid.cellOf(vista.x, vista.y)]; // the cell of the OSM peak node (OSM ele = 39.6 m, 130 ft)
// the Reservoir (north of the bbox, OSM ele=37): the median of the DEM pixels inside its OSM
// polygon, over the part of it that lies in this DEM tile (its hydro-flattened water surface)
const osm = parseOsmXml(readFileSync(new URL('../raw/osm/ramble.osm', import.meta.url), 'utf8'));
const resRings = areas(osm, project(osm, enu), (t) => /Reservoir/.test(t.name ?? '') && t.natural === 'water')[0].rings;
const [rc0, rr0] = tif.toPixel(...toStatePlane(40.7843, -73.9640)).map(Math.round);
const [rc1, rr1] = tif.toPixel(...toStatePlane(40.7826, -73.9600)).map(Math.round);
const resWin = await readWindow(tif, rc0, Math.max(0, rr0), rc1, rr1);
const resVals = [];
for (let r = Math.max(0, rr0); r < rr1; r++) for (let c = rc0; c < rc1; c++) {
  const v = resWin[(r - Math.max(0, rr0)) * (rc1 - rc0) + (c - rc0)];
  const [x, y] = exact(c, r);
  if (Number.isFinite(v) && pointInRings(x, y, resRings)) resVals.push(v * FT_US);
}
resVals.sort((a, b2) => a - b2);
const reservoir = resVals[resVals.length >> 1];
if (!resVals.length) throw new Error('no DEM pixels inside the Reservoir polygon');
const cover = new Uint8Array(readFileSync(new URL('cover.bin', baked)));
const lake = []; for (let k = 0; k < n; k++) if (cover[k] === 7) lake.push(z[k]);
lake.sort((a, b2) => a - b2);
const lakeMedian = lake[lake.length >> 1];

// ------------------------------------------------------------------ write

const layout = [
  { name: 'z', type: 'float32', unit: 'm NAVD88', offset: 0 },
  { name: 'slope', type: 'uint8', unit: 'degrees' },
  { name: 'openness', type: 'uint8', unit: '0-255 = 0-1, terrain only (canopy added in M1.4)' },
  ...WIND_DIRS.map((d) => ({ name: `drift_${d.name}`, type: 'uint8', unit: `factor x 100, wind from ${d.name}` })),
];
const parts = [new Uint8Array(z.buffer), slope, openness, ...drift];
let off = 0; layout.forEach((l, k) => { l.offset = off; l.bytes = parts[k].byteLength; off += parts[k].byteLength; });
const out = new Uint8Array(off); parts.forEach((p, k) => out.set(p, layout[k].offset));
writeFileSync(new URL('terrain.bin', baked), out);

const zs = [...z].sort((a, b2) => a - b2);
const hist = [0, 5, 10, 15, 20, 30, 45, 90].map((lo, k, arr) => (k + 1 < arr.length ? [`${lo}-${arr[k + 1]}`, slope.filter((v) => v >= lo && v < arr[k + 1]).length] : null)).filter(Boolean);
const meta = {
  file: 'terrain.bin', W, H, layout: 'idx = j * W + i, row 0 north', sections: layout,
  source: 'NYC 2017 topobathymetric LiDAR, bare-earth DEM (NOAA Digital Coast, mission 9307), EPSG:6539 ftUS, NAVD88 ftUS',
  url: DEM_URL, resample: 'mean of the 1 ft pixels whose centres fall in each 3 m cell',
  drift: `clamp(1 + Sx / 15 deg, 0.5, 2), Sx = maximum upwind slope over ${FETCH} m (Winstral et al. 2002)`,
  stats: {
    zMin: +zs[0].toFixed(2), zMedian: +zs[n >> 1].toFixed(2), zMax: +zs[n - 1].toFixed(2),
    vistaRockTop: +vistaTop.toFixed(2), vistaRockOsm: vista.ele,
    reservoirSurface: +reservoir.toFixed(2), reservoirOsm: 37,
    lakeSurfaceMedian: +lakeMedian.toFixed(2),
    slopeHistogram: Object.fromEntries(hist),
    affineErrorM: +affineErr.toFixed(4),
  },
};
writeFileSync(new URL('terrain.json', baked), JSON.stringify(meta, null, 2) + '\n');
console.log(`terrain.bin: ${W} x ${H}, ${(off / 1e6).toFixed(2)} MB; z ${meta.stats.zMin}-${meta.stats.zMax} m (median ${meta.stats.zMedian})`);
console.log(`checks: Vista Rock top ${meta.stats.vistaRockTop} m (OSM ${vista.ele}); Reservoir ${meta.stats.reservoirSurface} m (OSM 37); the Lake ${meta.stats.lakeSurfaceMedian} m`);
console.log('slope histogram (deg: cells):', JSON.stringify(meta.stats.slopeHistogram));

if (process.argv.includes('--preview')) {
  const { encodePng } = await import('../../src/data/png.js');
  const S = 3; const rgb = new Uint8Array(W * S * H * S * 3);
  const zlo = zs[Math.floor(n * 0.01)]; const zhi = zs[Math.floor(n * 0.99)];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    // hillshade from the north-west, tinted by height
    const zl = z[j * W + Math.max(0, i - 1)]; const zu = z[Math.max(0, j - 1) * W + i];
    const shade = Math.max(0, Math.min(1, 0.6 + ((zl - z[k]) + (zu - z[k])) * 0.25));
    const t2 = Math.max(0, Math.min(1, (z[k] - zlo) / (zhi - zlo)));
    const c = cover[k] === 7 ? [70, 120, 200] : [Math.round((60 + 160 * t2) * shade), Math.round((90 + 120 * t2) * shade), Math.round((70 + 60 * t2) * shade)];
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) rgb.set(c, ((j * S + dy) * W * S + i * S + dx) * 3);
  }
  writeFileSync(new URL('../preview-terrain.png', raw), encodePng(W * S, H * S, rgb));
  console.log('preview: data/raw/preview-terrain.png');
}
