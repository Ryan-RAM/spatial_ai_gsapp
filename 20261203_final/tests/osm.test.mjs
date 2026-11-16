// M1.2: the baked OpenStreetMap layers (paths.json, places.json, cover.bin) and the raster tools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/sim/config.js';
import { COVER } from '../src/sim/cover.js';
import { studyArea } from '../src/data/area.js';
import { pointInRings, assembleRings, drawLine, fillRings } from '../src/data/raster.js';
import { makeGrid } from '../src/data/geo.js';

const baked = (f) => new URL(`../data/baked/${f}`, import.meta.url);
const paths = JSON.parse(readFileSync(baked('paths.json'), 'utf8'));
const places = JSON.parse(readFileSync(baked('places.json'), 'utf8')).places;
const coverMeta = JSON.parse(readFileSync(baked('cover.json'), 'utf8'));
const cover = new Uint8Array(readFileSync(baked('cover.bin')));
const { grid, enu } = studyArea(CONFIG);
const cellAt = (lat, lon) => grid.cellOf(...enu.toEnu(lat, lon, 0));

// ---------------------------------------------------------------- raster tools

test('pointInRings: even-odd, so a hole is outside', () => {
  const outer = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  assert.ok(pointInRings(2, 2, [outer, hole]));
  assert.ok(!pointInRings(5, 5, [outer, hole]));
  assert.ok(!pointInRings(11, 5, [outer, hole]));
});

test('assembleRings joins open member ways, either direction', () => {
  const rings = assembleRings([[1, 2, 3], [5, 4, 3], [5, 6, 1]]);
  assert.equal(rings.length, 1);
  assert.equal(rings[0][0], rings[0][rings[0].length - 1]);
  assert.equal(new Set(rings[0]).size, 6);
});

test('drawLine: a diagonal line is connected through edge-sharing cells', () => {
  const g = makeGrid({ minX: 0, minY: 0, maxX: 60, maxY: 60 }, 3);
  const on = new Uint8Array(g.W * g.H);
  drawLine(g, [[1, 1], [59, 59]], 0.5, (i) => { on[i] = 1; });
  // flood from the south-west end, 4-neighbours only, must reach the north-east end
  const start = g.cellOf(1.5, 1.5); const goal = g.cellOf(58.5, 58.5);
  const seen = new Uint8Array(on.length); const q = [start]; seen[start] = 1;
  while (q.length) {
    const c = q.pop(); const i = c % g.W; const j = (c - i) / g.W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di; const nj = j + dj; const n = nj * g.W + ni;
      if (ni >= 0 && nj >= 0 && ni < g.W && nj < g.H && on[n] && !seen[n]) { seen[n] = 1; q.push(n); }
    }
  }
  assert.ok(seen[goal]);
});

test('fillRings fills by cell centre', () => {
  const g = makeGrid({ minX: 0, minY: 0, maxX: 30, maxY: 30 }, 3);
  let n = 0; fillRings(g, [[[0, 0], [15, 0], [15, 15], [0, 15], [0, 0]]], () => n++);
  assert.equal(n, 25);
});

// ---------------------------------------------------------------- the path graph (frame P)

test('paths: one connected network, with sane edges', () => {
  const parent = paths.nodes.map((n) => n.id);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (const e of paths.edges) parent[find(e.a)] = find(e.b);
  assert.equal(new Set(paths.nodes.map((n) => find(n.id))).size, 1);
  assert.ok(paths.edges.length > 400 && paths.nodes.length > 300);
  for (const e of paths.edges) {
    const A = paths.nodes[e.a]; const B = paths.nodes[e.b];
    assert.ok(e.len + 0.05 >= Math.hypot(A.x - B.x, A.y - B.y), `edge ${e.id} shorter than its chord`);
    assert.deepEqual(e.pts[0], [A.x, A.y]);
    assert.deepEqual(e.pts[e.pts.length - 1], [B.x, B.y]);
  }
  for (const n of paths.nodes) assert.ok(grid.cellOf(n.x, n.y) !== -1, `node ${n.id} outside the bbox`);
});

test('paths: the dropped pieces are listed with a reason-worthy summary', () => {
  assert.ok(Array.isArray(paths.dropped));
  for (const d of paths.dropped) assert.ok(d.len < 300, 'a large piece was dropped: check it');
});

test('exits: the ones in config, on the graph, on Fifth Avenue, on passable cells', () => {
  assert.deepEqual(paths.exits.map((e) => e.id), CONFIG.exits);
  for (const e of paths.exits) {
    const n = paths.nodes[e.node];
    assert.equal(n.kind, 'exit');
    assert.ok(e.streetAt > 75 && e.streetAt < 80, `${e.id} at street ${e.streetAt}`);
    assert.equal(cover[grid.cellOf(e.x, e.y)], COVER.PATH_PAVED);
  }
});

// ---------------------------------------------------------------- cover raster

test('cover: dimensions and legend', () => {
  assert.equal(cover.length, grid.W * grid.H);
  assert.deepEqual([coverMeta.W, coverMeta.H], [grid.W, grid.H]);
  assert.equal(coverMeta.legend[COVER.WATER], 'water');
  assert.ok(coverMeta.attribution.includes('OpenStreetMap'));
});

test('cover: known places have the right cover', () => {
  assert.equal(cover[cellAt(40.777070, -73.969640)], COVER.WATER, 'Azalea Pond');
  assert.equal(cover[grid.cellOf(-250, -150)], COVER.WATER, 'the Lake, west of the Ramble');
  assert.equal(cover[grid.cellOf(-150, -480)], COVER.WATER, 'the Lake, south of the Ramble');
  assert.equal(cover[cellAt(40.779325, -73.968890)], COVER.STRUCTURE, 'Belvedere Castle');
  const bow = places.find((p) => p.id === 'bow-bridge');
  const c = grid.cellOf(bow.x, bow.y);
  assert.ok([COVER.PATH_PAVED, COVER.PATH_DIRT].includes(cover[c]), 'Bow Bridge is walkable over the water');
});

test('cover: a survivor can walk from every exit into the Ramble (rule I2 on the base map)', () => {
  const walkable = (c) => [COVER.PATH_PAVED, COVER.PATH_DIRT, COVER.LAWN, COVER.WOODLAND].includes(c);
  const goal = grid.cellOf(...enu.toEnu(40.7772, -73.9700, 0).slice(0, 2)); // west of Azalea Pond (§15)
  for (const e of paths.exits) {
    const seen = new Uint8Array(cover.length); const q = [grid.cellOf(e.x, e.y)]; seen[q[0]] = 1;
    while (q.length) {
      const c = q.pop(); const i = c % grid.W; const j = (c - i) / grid.W;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ni = i + di; const nj = j + dj; if (ni < 0 || nj < 0 || ni >= grid.W || nj >= grid.H) continue;
        const n = nj * grid.W + ni; if (!seen[n] && walkable(cover[n])) { seen[n] = 1; q.push(n); }
      }
    }
    assert.ok(seen[goal], `no way from ${e.id} to the spawn area`);
  }
});

// ---------------------------------------------------------------- named places (frame N)

test('places: the story places are there, the castle is tall, Vista Rock has its height', () => {
  const ids = new Set(places.map((p) => p.id));
  for (const id of ['belvedere-castle', 'azalea-pond', 'bow-bridge', 'the-gill', 'ramble-stone-arch', 'the-ramble', 'vista-rock'])
    assert.ok(ids.has(id), `${id} missing`);
  assert.ok(places.find((p) => p.id === 'belvedere-castle').tall);
  assert.equal(places.find((p) => p.id === 'vista-rock').ele, 39.6);
  for (const p of places) assert.ok(grid.cellOf(p.x, p.y) !== -1);
});
