// Bakes the individual trees (ROADMAP M1.4) from the 2017 NYC LiDAR point cloud (NOAA Digital
// Coast mission 9306, COPC, D-017), reading only the octree nodes of the study area:
//   data/baked/trees.bin    per tree: x, y, ground z, height, crown radius, trunk radius (Float32 x 6)
//                           then evergreen (Uint8 per tree); layout in trees.json
//   data/baked/canopy.bin   per 3 m cell: canopy, canopyEvergreen, low vegetation (Uint8 x 3, 0-255)
// Stage 1 (download and accumulate the points into 1 m grids) is cached in data/raw/trees/.
// Run: npm run bake:trees  (needs bake:terrain first; add --preview for a PNG)

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { Copc } from 'copc';
import { CONFIG } from '../../src/sim/config.js';
import { studyArea } from '../../src/data/area.js';
import { makeGrid } from '../../src/data/geo.js';
import { get } from '../../src/data/http.js';
import { georefFromJson } from '../../src/data/geotiff.js';
import { toStatePlane, fromStatePlane, FT_US } from '../../src/data/stateplane.js';
import { toUtm18, fromUtm18 } from '../../src/data/utm.js';
import { parseOsmXml } from '../../src/data/osm.js';
import { areas, project } from '../../src/data/osm-features.js';
import { fillRings, drawLine } from '../../src/data/raster.js';
import { smoothChm, findTreetops, growCrowns, otsu, trunkRadius } from '../../src/data/trees.js';
import { POINT_TILES } from '../../src/data/sources.js';

const TILES = POINT_TILES;
const MARGIN = 20; // m
const CLASS = { UNCLASSIFIED: 1, GROUND: 2, WATER: 9, BRIDGE: 17 };

const rawDir = new URL('../raw/trees/', import.meta.url); mkdirSync(rawDir, { recursive: true });
const baked = new URL('../baked/', import.meta.url);
const { enu, grid } = studyArea(CONFIG);
const b = grid.bbox;
const fine = makeGrid({ minX: b.minX - MARGIN, minY: b.minY - MARGIN, maxX: b.maxX + MARGIN, maxY: b.maxY + MARGIN }, 1);
const FW = fine.W; const FH = fine.H; const FN = FW * FH;

// ------------------------------------------------------------------ affine maps (exact at three points, checked elsewhere)

function fitAffine(f, [x0, y0], [x1, y1]) {
  const p00 = f(x0, y0); const p10 = f(x1, y0); const p01 = f(x0, y1);
  const a = [(p10[0] - p00[0]) / (x1 - x0), (p01[0] - p00[0]) / (y1 - y0)];
  const c = [(p10[1] - p00[1]) / (x1 - x0), (p01[1] - p00[1]) / (y1 - y0)];
  const g = (x, y) => [p00[0] + a[0] * (x - x0) + a[1] * (y - y0), p00[1] + c[0] * (x - x0) + c[1] * (y - y0)];
  for (const [x, y] of [[x1, y1], [(x0 + x1) / 2, (y0 + y1) / 2]]) {
    const e = f(x, y); const q = g(x, y); if (Math.hypot(e[0] - q[0], e[1] - q[1]) > 0.05) throw new Error('affine fit off');
  }
  return g;
}
const utmCorners = [[b.minX - MARGIN, b.minY - MARGIN], [b.maxX + MARGIN, b.maxY + MARGIN]].map(([x, y]) => toUtm18(...enu.fromEnu(x, y, 0)));
const pad = 30;
const ue0 = Math.min(utmCorners[0][0], utmCorners[1][0]) - pad; const ue1 = Math.max(utmCorners[0][0], utmCorners[1][0]) + pad;
const un0 = Math.min(utmCorners[0][1], utmCorners[1][1]) - pad; const un1 = Math.max(utmCorners[0][1], utmCorners[1][1]) + pad;
const utmToEnu = fitAffine((e, n) => enu.toEnu(...fromUtm18(e, n), 0), [ue0, un0], [ue1, un1]);

// the DEM window cached by bake-terrain, sampled bilinearly (height above ground of a point)
const georefFile = new URL('../raw/dem/georef.json', import.meta.url);
if (!existsSync(georefFile)) throw new Error('run npm run bake:terrain first (DEM georeferencing cache missing)');
const tif = georefFromJson(JSON.parse(readFileSync(georefFile, 'utf8')));
const winFile = readdirSync(new URL('../raw/dem/', import.meta.url)).find((f) => /^window-\d+-\d+-\d+x\d+\.f32$/.test(f));
if (!winFile) throw new Error('run npm run bake:terrain first (DEM window cache missing)');
const [, col0, row0, WW, WH] = winFile.match(/window-(\d+)-(\d+)-(\d+)x(\d+)/).map(Number);
const win = new Float32Array(new Uint8Array(readFileSync(new URL(`../raw/dem/${winFile}`, import.meta.url))).buffer);
const enuToPix = fitAffine((x, y) => tif.toPixel(...toStatePlane(...enu.fromEnu(x, y, 0))), [b.minX - 50, b.minY - 50], [b.maxX + 50, b.maxY + 50]);
function groundAt(x, y) {
  const [c, r] = enuToPix(x, y); const cc = c - col0; const rr = r - row0;
  const i = Math.floor(cc); const j = Math.floor(rr); if (i < 0 || j < 0 || i + 1 >= WW || j + 1 >= WH) return NaN;
  const fx = cc - i; const fy = rr - j; const k = j * WW + i;
  const v = (1 - fy) * ((1 - fx) * win[k] + fx * win[k + 1]) + fy * ((1 - fx) * win[k + WW] + fx * win[k + WW + 1]);
  return v * FT_US;
}

// building footprints at 1 m with a 1 m rim: points over them are not vegetation
const osm = parseOsmXml(readFileSync(new URL('../raw/osm/ramble.osm', import.meta.url), 'utf8'));
const xy = project(osm, enu);
const bldg = new Uint8Array(FN);
for (const a of areas(osm, xy, (t) => !!t.building)) {
  fillRings(fine, a.rings, (k) => { bldg[k] = 1; });
  for (const r of a.rings) drawLine(fine, r, 1, (k) => { bldg[k] = 1; });
}

// ------------------------------------------------------------------ stage 1: points -> 1 m grids (cached)

const cacheFile = new URL(`acc-${FW}x${FH}-v1.bin`, rawDir);
const chm = new Float32Array(FN); const nAll = new Uint16Array(FN); const nGround = new Uint16Array(FN); const nLow = new Uint16Array(FN);
let stats1;
if (existsSync(cacheFile)) {
  const buf = new Uint8Array(readFileSync(cacheFile));
  chm.set(new Float32Array(buf.buffer, 0, FN));
  nAll.set(new Uint16Array(buf.buffer, FN * 4, FN)); nGround.set(new Uint16Array(buf.buffer, FN * 6, FN)); nLow.set(new Uint16Array(buf.buffer, FN * 8, FN));
  stats1 = JSON.parse(readFileSync(new URL(`acc-${FW}x${FH}-v1.json`, rawDir), 'utf8'));
  console.log(`points from cache: ${stats1.points.toLocaleString()} points in the area`);
} else {
  stats1 = { points: 0, vegetation: 0, nodes: 0, bytes: 0, tiles: TILES.length };
  for (const url of TILES) {
    const getter = async (s0, e0) => { const r = await get(url, { as: 'bytes', range: [s0, e0 - 1] }); stats1.bytes += r.length; return r; };
    const copc = await Copc.create(getter);
    const all = {};
    const pages = [copc.info.rootHierarchyPage];
    while (pages.length) { const page = await Copc.loadHierarchyPage(getter, pages.pop()); Object.assign(all, page.nodes); pages.push(...Object.values(page.pages)); }
    const [cx0, cy0, cz0, cx1] = copc.info.cube; const side = cx1 - cx0;
    const wanted = Object.entries(all).filter(([key, node]) => {
      if (!node || !node.pointCount) return false;
      const [d, x, y] = key.split('-').map(Number); const s = side / 2 ** d;
      const e0 = cx0 + x * s; const n0 = cy0 + y * s;
      return e0 < ue1 && e0 + s > ue0 && n0 < un1 && n0 + s > un0;
    });
    // fetch with a few requests in flight
    let next = 0;
    const work = async () => {
      while (next < wanted.length) {
        const [, node] = wanted[next++];
        const view = await Copc.loadPointDataView(getter, copc, node, { include: ['X', 'Y', 'Z', 'Classification'] });
        const gx = view.getter('X'); const gy = view.getter('Y'); const gz = view.getter('Z'); const gc = view.getter('Classification');
        for (let i = 0; i < view.pointCount; i++) {
          const [x, y] = utmToEnu(gx(i), gy(i)); const k = fine.cellOf(x, y); if (k < 0) continue;
          const c = gc(i); stats1.points++;
          if (nAll[k] < 65535) nAll[k]++;
          if (c === CLASS.GROUND) { if (nGround[k] < 65535) nGround[k]++; continue; }
          if (c !== CLASS.UNCLASSIFIED || bldg[k]) continue;
          const hag = gz(i) - groundAt(x, y);
          if (!(hag > 0.5 && hag < 45)) continue;
          stats1.vegetation++;
          if (hag < 3) { if (nLow[k] < 65535) nLow[k]++; } else if (hag > chm[k]) chm[k] = hag;
        }
        stats1.nodes++;
      }
    };
    await Promise.all(Array.from({ length: 8 }, work));
    console.log(`  ${url.split('/').pop()}: ${wanted.length} of ${Object.keys(all).length} nodes`);
  }
  const out = new Uint8Array(FN * 10);
  out.set(new Uint8Array(chm.buffer), 0); out.set(new Uint8Array(nAll.buffer), FN * 4); out.set(new Uint8Array(nGround.buffer), FN * 6); out.set(new Uint8Array(nLow.buffer), FN * 8);
  writeFileSync(cacheFile, out);
  writeFileSync(new URL(`acc-${FW}x${FH}-v1.json`, rawDir), JSON.stringify(stats1, null, 2));
  console.log(`points downloaded: ${stats1.points.toLocaleString()} in the area from ${stats1.nodes} nodes, ${(stats1.bytes / 1e6).toFixed(1)} MB`);
}

// ------------------------------------------------------------------ stage 2: trees

const smooth = smoothChm(chm, FW, FH);
const tops = findTreetops(smooth, FW, FH, 4);
const { label, area } = growCrowns(smooth, FW, FH, tops);
// per crown: share of returns that reached the ground (leaf-off deciduous crowns let the pulses through)
const crownAll = new Float64Array(tops.length); const crownGround = new Float64Array(tops.length);
for (let k = 0; k < FN; k++) { const t = label[k] - 1; if (t >= 0) { crownAll[t] += nAll[k]; crownGround[t] += nGround[k]; } }
const gf = Array.from(tops, (_, t) => (crownAll[t] ? crownGround[t] / crownAll[t] : 1));
const sample = gf.filter((_, t) => area[t] >= 10);
const thresholdRaw = otsu(sample);
const threshold = Math.min(0.3, Math.max(0.02, thresholdRaw));

// Evergreen (D-018): the point cloud cannot tell evergreen from deciduous here (on 4 May 2017 many
// deciduous crowns were already in leaf), so OSM's leaf tags decide: needleleaved / evergreen woods
// are evergreen; in a mixed wood, the crowns that let the fewest returns through to the ground are;
// everywhere else (the broadleaved woods of the Ramble) trees are deciduous.
const leafWood = (pred) => { const m = new Uint8Array(FN); for (const a of areas(osm, xy, (t) => (t.natural === 'wood' || t.landuse === 'forest') && pred(t))) fillRings(fine, a.rings, (k) => { m[k] = 1; }); return m; };
const needle = leafWood((t) => t.leaf_type === 'needleleaved' || t.leaf_cycle === 'evergreen');
const mixed = leafWood((t) => t.leaf_type === 'mixed' || t.leaf_cycle === 'mixed');
const mixedGf = []; tops.forEach((k, t) => { if (mixed[k]) mixedGf.push(gf[t]); }); mixedGf.sort((a, c) => a - c);
const mixedSplit = mixedGf.length ? mixedGf[mixedGf.length >> 1] : 0; // half of a mixed wood's crowns: the denser half
const isEvergreen = (t) => needle[tops[t]] === 1 || (mixed[tops[t]] === 1 && gf[t] < mixedSplit);

// keep the trees whose top lies inside the study bbox
const trees = [];
const coverOsm = new Uint8Array(readFileSync(new URL('cover.bin', baked)));
tops.forEach((k, t) => {
  const [x, y] = fine.center(k); const cell = grid.cellOf(x, y);
  if (cell < 0 || coverOsm[cell] === 0) return; // only trees in the park (outside: poles, building edges)
  const h = smooth[k];
  trees.push({ t, x, y, z: groundAt(x, y), h, r: Math.sqrt(area[t] / Math.PI), tr: trunkRadius(h), ev: isEvergreen(t) ? 1 : 0 });
});
const T = trees.length;
const f32 = new Float32Array(T * 6); const ev = new Uint8Array(T);
trees.forEach((tr, n) => { f32.set([tr.x, tr.y, tr.z, tr.h, tr.r, tr.tr], n * 6); ev[n] = tr.ev; });
const treesBuf = new Uint8Array(f32.byteLength + ev.byteLength); treesBuf.set(new Uint8Array(f32.buffer), 0); treesBuf.set(ev, f32.byteLength);
writeFileSync(new URL('trees.bin', baked), treesBuf);

// ------------------------------------------------------------------ 3 m rasters: canopy, evergreen canopy, low vegetation

const { W, H } = grid; const n = W * H;
const canopy = new Uint8Array(n); const canopyEv = new Uint8Array(n); const lowVeg = new Uint8Array(n);
const cnt = new Uint16Array(n); const inCrown = new Uint16Array(n); const inEv = new Uint16Array(n); const low = new Uint32Array(n); const allr = new Uint32Array(n);
const evByT = Uint8Array.from(tops, (_, t) => (isEvergreen(t) ? 1 : 0));
for (let k = 0; k < FN; k++) {
  const [x, y] = fine.center(k); const c = grid.cellOf(x, y); if (c < 0) continue;
  cnt[c]++; allr[c] += nAll[k]; low[c] += nLow[k];
  const t = label[k] - 1; if (t >= 0) { inCrown[c]++; if (isEvergreen(t)) inEv[c]++; }
}
for (let c = 0; c < n; c++) {
  canopy[c] = Math.round((255 * inCrown[c]) / Math.max(1, cnt[c]));
  canopyEv[c] = Math.round((255 * inEv[c]) / Math.max(1, cnt[c]));
  lowVeg[c] = Math.round(255 * Math.min(1, (4 * low[c]) / Math.max(1, allr[c]))); // share of returns 0.5-3 m above ground, x4, capped
}
const canopyBuf = new Uint8Array(3 * n); canopyBuf.set(canopy, 0); canopyBuf.set(canopyEv, n); canopyBuf.set(lowVeg, 2 * n);
writeFileSync(new URL('canopy.bin', baked), canopyBuf);

const hs = trees.map((t) => t.h).sort((a, c) => a - c); const rs = trees.map((t) => t.r).sort((a, c) => a - c);
const q = (v, p) => +v[Math.floor(p * (v.length - 1))].toFixed(2);
const meta = {
  file: 'trees.bin', count: T,
  layout: { float32: ['x', 'y', 'groundZ', 'height', 'crownRadius', 'trunkRadius'], stride: 6, then: 'uint8 evergreen per tree' },
  units: 'm, frame W; heights above ground', canopyFile: 'canopy.bin',
  canopyLayout: 'three Uint8 layers of W x H (idx = j * W + i): canopy share, evergreen canopy share, low vegetation (0.5-3 m) return share x4; 0-255 = 0-1',
  W, H,
  source: 'NYC 2017 topobathymetric LiDAR point cloud (NOAA Digital Coast mission 9306, COPC, UTM 18N / NAVD88 m), tiles 990220 990222 992220 992222',
  method: 'CHM at 1 m (max height above the 2017 DEM of unclassified returns, buildings masked) -> 3x3 Gaussian -> local maxima, window 1.5-4.5 m by height, min 4 m -> crowns by seeded region growing (>= 45 % of the top, <= 0.6 h + 1 m, <= 12 m) -> evergreen from OSM leaf tags: needleleaved/evergreen woods, and in mixed woods the denser half of the crowns by ground-return share (D-018). Evergreen is an estimate.',
  mixedWoodSplit: +mixedSplit.toFixed(3), groundShareOtsu: +thresholdRaw.toFixed(3),
  stats: {
    points: stats1.points, vegetationPoints: stats1.vegetation,
    evergreen: ev.reduce((s, v) => s + v, 0),
    height: { p10: q(hs, 0.1), median: q(hs, 0.5), p90: q(hs, 0.9), max: q(hs, 1) },
    crownRadius: { p10: q(rs, 0.1), median: q(rs, 0.5), p90: q(rs, 0.9) },
    canopyShareOfParkCells: null,
  },
};
const cover = new Uint8Array(readFileSync(new URL('cover.bin', baked)));
let parkCells = 0; let canopySum = 0; for (let c = 0; c < n; c++) if (cover[c] !== 0) { parkCells++; canopySum += canopy[c] / 255; }
meta.stats.canopyShareOfParkCells = +(canopySum / parkCells).toFixed(3);
meta.stats.mixedWoodTrees = trees.filter((tr) => mixed[tops[tr.t]]).length;
meta.stats.needleWoodTrees = trees.filter((tr) => needle[tops[tr.t]]).length;
writeFileSync(new URL('trees.json', baked), JSON.stringify(meta, null, 2) + '\n');
console.log(`trees.bin: ${T} trees (${meta.stats.evergreen} evergreen); height median ${meta.stats.height.median} m, p90 ${meta.stats.height.p90} m, max ${meta.stats.height.max} m; crown radius median ${meta.stats.crownRadius.median} m`);
console.log(`canopy.bin: canopy covers ${(100 * meta.stats.canopyShareOfParkCells).toFixed(1)} % of the park cells`);

if (process.argv.includes('--preview')) {
  const { encodePng } = await import('../../src/data/png.js');
  const rgb = new Uint8Array(FW * FH * 3);
  for (let k = 0; k < FN; k++) {
    const h = smooth[k]; const t = label[k] - 1;
    let c = [Math.min(255, 30 + h * 6), Math.min(255, 30 + h * 6), Math.min(255, 30 + h * 6)];
    if (t >= 0) { const hue = (t * 47) % 255; c = evByT[t] ? [20, 120 + (hue % 80), 60] : [120 + (hue % 100), 80 + (h * 4), 40]; }
    if (bldg[k]) c = [200, 80, 80];
    rgb.set(c.map((v) => Math.max(0, Math.min(255, Math.round(v)))), k * 3);
  }
  for (const k of tops) { const i = k % FW; const j = (k - i) / FW; for (let d = -1; d <= 1; d++) { rgb.set([255, 255, 255], (j * FW + Math.min(FW - 1, Math.max(0, i + d))) * 3); rgb.set([255, 255, 255], (Math.min(FH - 1, Math.max(0, j + d)) * FW + i) * 3); } }
  writeFileSync(new URL('../preview-trees.png', rawDir), encodePng(FW, FH, rgb));
  console.log('preview: data/raw/preview-trees.png');
}
