// Bakes the OpenStreetMap layers (ROADMAP M1.2) from data/raw/osm/ramble.osm:
//   data/baked/paths.json   the footpath graph (frame P): nodes, edges, exits
//   data/baked/places.json  named places (frame N)
//   data/baked/cover.bin    ground cover per cell (Uint8, codes in src/sim/cover.js) + cover.json
// Run: npm run bake:osm (after npm run fetch:osm). Pass --preview to also write a PNG of the
// cover with the graph on top to data/raw/preview-osm.png (not committed).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { CONFIG } from '../../src/sim/config.js';
import { COVER, COVER_NAMES } from '../../src/sim/cover.js';
import { studyArea } from '../../src/data/area.js';
import { parseOsmXml } from '../../src/data/osm.js';
import { fillRings, drawLine } from '../../src/data/raster.js';
import {
  project, areas, lines, parkRings, pathGraph, components, namedPlaces, pointInRings,
  isWalkway, isBridge, isRoadBarrier, surfaceOf, widthOf,
} from '../../src/data/osm-features.js';

const raw = new URL('../raw/', import.meta.url);
const baked = new URL('../baked/', import.meta.url);
mkdirSync(baked, { recursive: true });

const osm = parseOsmXml(readFileSync(new URL('osm/ramble.osm', raw), 'utf8'));
const { enu, grid } = studyArea(CONFIG);
const xy = project(osm, enu);
const { bbox, W, H } = grid;
const N = W * H;

const park = parkRings(osm, xy);
const inBbox = (x, y) => x >= bbox.minX && x < bbox.maxX && y >= bbox.minY && y < bbox.maxY;
const inPark = (x, y) => pointInRings(x, y, park);
const keep = (x, y) => inBbox(x, y) && inPark(x, y);

// ------------------------------------------------------------------ cover raster
// Painted in order of priority; later layers win, except where noted.

// a height tag in metres, or in feet and inches (3'10")
function heightOf(t) {
  const v = t.height; if (!v) return null;
  const ft = v.match(/^(\d+(?:\.\d+)?)'(?:\s*(\d+(?:\.\d+)?)")?$/);
  if (ft) return (+ft[1] + (+ft[2] || 0) / 12) * 0.3048;
  const m = parseFloat(v); return Number.isFinite(m) && m > 0 ? m : null;
}

const cover = new Uint8Array(N).fill(COVER.OUTSIDE);
const parkMask = new Uint8Array(N);
fillRings(grid, park, (i) => { parkMask[i] = 1; cover[i] = COVER.LAWN; });
const building = new Uint8Array(N);
const paint = (code) => (i) => { cover[i] = code; };

for (const a of areas(osm, xy, (t) => t.natural === 'wood' || t.landuse === 'forest')) fillRings(grid, a.rings, paint(COVER.WOODLAND));
for (const a of areas(osm, xy, (t) => t.landuse === 'grass' || t.leisure === 'pitch')) fillRings(grid, a.rings, paint(COVER.LAWN));
for (const a of areas(osm, xy, (t) => t.leisure === 'playground' || t.amenity === 'parking' || (t.highway === 'pedestrian' && t.area === 'yes') || t.place === 'square'))
  fillRings(grid, a.rings, paint(COVER.PATH_PAVED));
for (const a of areas(osm, xy, (t) => t.natural === 'bare_rock')) fillRings(grid, a.rings, paint(COVER.ROCK));
for (const a of areas(osm, xy, (t) => t.natural === 'water' || t.natural === 'bay' || t.water)) fillRings(grid, a.rings, paint(COVER.WATER));
for (const l of lines(osm, xy, (t) => t.waterway === 'stream' && !t.tunnel)) drawLine(grid, l.pts, 0.75, paint(COVER.WATER));
// structure heights above the ground (m): surveyed building heights (NYC, in OSM's height tag),
// walls by tag or by kind; sight and sound are blocked up to this height (M1.7, D-021)
const structH = new Float32Array(N);
const raise = (h) => (i) => { if (h > structH[i]) structH[i] = h; };
for (const a of areas(osm, xy, (t) => !!t.building)) {
  const h = heightOf(a.tags) ?? (+a.tags['building:levels'] > 0 ? 3.5 * +a.tags['building:levels'] : 6);
  fillRings(grid, a.rings, (i) => { cover[i] = COVER.STRUCTURE; building[i] = 1; raise(h)(i); });
}
for (const l of lines(osm, xy, (t) => ['city_wall', 'retaining_wall', 'wall'].includes(t.barrier) && t.area !== 'yes')) {
  const h = heightOf(l.tags) ?? { city_wall: 3, wall: 1.5, retaining_wall: 1 }[l.tags.barrier];
  drawLine(grid, l.pts, 0.5, (i) => { cover[i] = COVER.STRUCTURE; building[i] = 1; raise(h)(i); });
}
for (const l of lines(osm, xy, isRoadBarrier)) drawLine(grid, l.pts, Math.max(4, (+l.tags.lanes || 2) * 1.75), (i) => { cover[i] = COVER.STRUCTURE; building[i] = 1; });

// walkways: on the ground they do not cross water or buildings (a path along the shore must not
// open the shore); bridges win everywhere.
const walk = lines(osm, xy, isWalkway);
for (const bridges of [false, true]) {
  for (const l of walk) {
    if (isBridge(l.tags) !== bridges) continue;
    const code = surfaceOf(l.tags) === 'paved' ? COVER.PATH_PAVED : COVER.PATH_DIRT;
    drawLine(grid, l.pts, widthOf(l.tags) / 2, (i) => {
      if (!bridges && (cover[i] === COVER.WATER || building[i])) return;
      cover[i] = code;
    });
  }
}
for (let i = 0; i < N; i++) if (!parkMask[i]) cover[i] = COVER.OUTSIDE;
for (let i = 0; i < N; i++) if (cover[i] !== COVER.STRUCTURE) structH[i] = 0; // bridges and paths over a wall line

// ------------------------------------------------------------------ path graph and exits

const fullGraph = pathGraph(osm, xy, keep);
const comps = components(fullGraph);
// Keep the connected network only. The small pieces are sidewalks down in the 79th Street
// Transverse cutting and stubs whose connection lies outside the bbox: unreachable from the park.
const mainSet = new Set(comps[0]);
const dropped = comps.slice(1).map((c) => {
  const es = fullGraph.edges.filter((e) => c.includes(e.a));
  return { nodes: c.length, edges: es.length, len: +es.reduce((s, e) => s + e.len, 0).toFixed(1), at: es[0]?.pts[0] ?? null, kinds: [...new Set(es.map((e) => e.kind))] };
});
const remap = new Map(); const graph = { nodes: [], edges: [] };
for (const n of fullGraph.nodes) if (mainSet.has(n.id)) { remap.set(n.id, graph.nodes.length); graph.nodes.push({ ...n, id: graph.nodes.length }); }
for (const e of fullGraph.edges) if (mainSet.has(e.a)) graph.edges.push({ ...e, id: graph.edges.length, a: remap.get(e.a), b: remap.get(e.b) });
const compOf = new Int32Array(graph.nodes.length); // everything left is component 0

// Exits: where a walkway leaves the park on the Fifth Avenue side. The inside end of each such
// step is a candidate; candidates within 25 m are one entrance. Named by the nearest East nn
// Street that ends at Fifth Avenue.
// Street numbers along Fifth Avenue: fit n = a + b * s, with s the position along the avenue,
// from the west ends of the East nn Streets (where they meet Fifth Avenue).
const streets = lines(osm, xy, (t) => /^East \d+(st|nd|rd|th) Street$/.test(t.name ?? '') && !!t.highway)
  .map((l) => ({ n: +l.tags.name.match(/\d+/)[0], west: l.pts.reduce((p, q) => (q[0] < p[0] ? q : p)) }));
const fifthDir = [Math.sin(29 * Math.PI / 180), Math.cos(29 * Math.PI / 180)]; // the Manhattan grid: 29 deg east of north
const along = ([x, y]) => x * fifthDir[0] + y * fifthDir[1];
const ends = [...new Map(streets.map((st) => [st.n, st])).values()];
const ms = ends.map((st) => along(st.west)); const ns = ends.map((st) => st.n);
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const mS = mean(ms); const mN = mean(ns);
const slope = ms.reduce((acc, m, k) => acc + (m - mS) * (ns[k] - mN), 0) / ms.reduce((acc, m) => acc + (m - mS) ** 2, 0);
const streetAt = (x, y) => mN + slope * (along([x, y]) - mS);
const candidates = [];
for (const w of osm.ways.values()) {
  if (!isWalkway(w.tags)) continue;
  for (let k = 0; k + 1 < w.nds.length; k++) {
    for (const [p, q] of [[w.nds[k], w.nds[k + 1]], [w.nds[k + 1], w.nds[k]]]) {
      const P = xy(p); const Q = xy(q);
      if (!P || !Q || !keep(...P) || inPark(...Q) || Q[0] < 150) continue; // east side only
      const node = graph.nodes.find((n) => n.osm === p);
      if (node) candidates.push(node);
    }
  }
}
const exits = [];
for (const c of candidates) {
  const near = exits.find((e) => Math.hypot(e.x - c.x, e.y - c.y) < 25);
  if (near) { if (c.degree > graph.nodes[near.node].degree) Object.assign(near, { node: c.id, x: c.x, y: c.y }); continue; }
  exits.push({ node: c.id, x: c.x, y: c.y });
}
for (const e of exits) {
  e.streetAt = +streetAt(e.x, e.y).toFixed(2);
  e.street = Math.round(e.streetAt);
  e.id = `E${e.street}`;
  e.name = `Fifth Avenue at East ${e.street}th Street`;
  e.component = compOf[e.node];
  const c = grid.cellOf(e.x, e.y); if (c >= 0) cover[c] = COVER.PATH_PAVED;
}
exits.sort((a, b) => a.y - b.y);
// two entrances that round to the same street (either side of the 79th Street Transverse at
// Fifth Avenue) get S / N suffixes, south first
for (const e of exits) {
  const same = exits.filter((f) => f.street === e.street);
  if (same.length > 1) { e.id = `E${e.street}${'SN'[same.indexOf(e)] ?? same.indexOf(e)}`; e.name += same.indexOf(e) ? ' (north)' : ' (south)'; }
}
for (const n of graph.nodes) n.kind = exits.some((e) => e.node === n.id) ? 'exit' : n.degree === 1 ? 'end' : 'junction';

// ------------------------------------------------------------------ write

const places = namedPlaces(osm, xy, keep);
const counts = Object.fromEntries(COVER_NAMES.map((name, code) => [name, cover.reduce((s, v) => s + (v === code), 0)]));
const ATTR = 'Data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)';

writeFileSync(new URL('cover.bin', baked), cover);
// structure height in 0.5 m steps (Uint8, up to 127.5 m)
writeFileSync(new URL('structure.bin', baked), Uint8Array.from(structH, (h) => Math.min(255, Math.round(h * 2))));
writeFileSync(new URL('cover.json', baked), JSON.stringify({
  file: 'cover.bin', type: 'uint8', W, H, layout: 'idx = j * W + i, row 0 north',
  structureFile: 'structure.bin (Uint8, structure height above ground in 0.5 m steps)',
  legend: COVER_NAMES, counts, source: 'OpenStreetMap', attribution: ATTR,
}, null, 2) + '\n');
writeFileSync(new URL('paths.json', baked), JSON.stringify({
  attribution: ATTR, frame: 'W (metres)',
  dropped, // disconnected pieces left out of the graph, see above
  exits,
  nodes: graph.nodes.map(({ id, osm: o, x, y, degree, kind }) => ({ id, osm: o, x, y, degree, kind })),
  edges: graph.edges.map(({ pts, ...e }) => ({ ...e, pts })),
}) + '\n');
writeFileSync(new URL('places.json', baked), JSON.stringify({ attribution: ATTR, frame: 'W (metres)', places }, null, 2) + '\n');

const total = graph.edges.reduce((s, e) => s + e.len, 0);
console.log(`cover.bin: ${W} x ${H}; ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`paths.json: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${(total / 1000).toFixed(2)} km, one connected network; dropped ${dropped.length} pieces (${dropped.reduce((s, d) => s + d.len, 0).toFixed(0)} m)`);
console.log(`street fit: ${ends.length} streets, ${(1 / slope).toFixed(1)} m per street`);
console.log(`exits: ${exits.map((e) => `${e.id} [${e.streetAt}] (${e.x.toFixed(0)}, ${e.y.toFixed(0)})`).join('; ')}`);
console.log(`places.json: ${places.length} places`);

// ------------------------------------------------------------------ optional preview

if (process.argv.includes('--preview')) {
  const { encodePng } = await import('../../src/data/png.js');
  const S = 3; // pixels per cell
  const PAL = [[40, 40, 48], [235, 225, 200], [190, 160, 110], [150, 190, 120], [60, 110, 70], [30, 70, 40], [140, 140, 150], [70, 120, 200], [200, 90, 80]];
  const rgb = new Uint8Array(W * S * H * S * 3);
  const put = (px, py, c) => { if (px < 0 || py < 0 || px >= W * S || py >= H * S) return; rgb.set(c, (py * W * S + px) * 3); };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) put(i * S + dx, j * S + dy, PAL[cover[j * W + i]]);
  const toPx = (x, y) => [Math.round(((x - bbox.minX) / CONFIG.cellSize) * S), Math.round(((bbox.maxY - y) / CONFIG.cellSize) * S)];
  for (const e of graph.edges) for (let k = 1; k < e.pts.length; k++) {
    const [x0, y0] = toPx(...e.pts[k - 1]); const [x1, y1] = toPx(...e.pts[k]);
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let t = 0; t <= n; t++) put(Math.round(x0 + ((x1 - x0) * t) / n), Math.round(y0 + ((y1 - y0) * t) / n), compOf[e.a] === 0 ? [20, 20, 20] : [255, 0, 255]);
  }
  for (const e of exits) { const [px, py] = toPx(e.x, e.y); for (let d = -4; d <= 4; d++) { put(px + d, py, [255, 140, 0]); put(px, py + d, [255, 140, 0]); } }
  for (const p of places) { const [px, py] = toPx(p.x, p.y); for (let d = -2; d <= 2; d++) for (let f = -2; f <= 2; f++) put(px + d, py + f, [255, 255, 255]); }
  writeFileSync(new URL('preview-osm.png', raw), encodePng(W * S, H * S, rgb));
  console.log('preview: data/raw/preview-osm.png');
}
