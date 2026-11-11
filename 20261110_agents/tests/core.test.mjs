// Core geometry, world, rules, planning and perception. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, FT } from '../src/sim/config.js';
import { makeFrame, pointInPoly, bearingDeg } from '../src/sim/geo.js';
import { buildWorld, droneBandFor, F, TYPE_BIT } from '../src/sim/world.js';
import { aStar } from '../src/sim/planner.js';
import { parseData } from '../src/sim/data.js';
import { inCone, sense } from '../src/sim/perception.js';
import { makeKnowledge, K } from '../src/sim/knowledge.js';

const world = buildWorld(CONFIG); // the placeholder city

test('the local frame round-trips and keeps the site box positive', () => {
  const f = makeFrame(CONFIG.site);
  const [x, y] = f.toXY(40.7484, -73.9857);
  const [la, lo] = f.toLatLon(x, y);
  assert.ok(Math.abs(la - 40.7484) < 1e-9 && Math.abs(lo + 73.9857) < 1e-9);
  assert.ok(x > 0 && y > 0 && x < f.width && y < f.height);
  // 0.001 deg of latitude is about 111 m
  assert.ok(Math.abs(f.toXY(40.701, -74)[1] - f.toXY(40.700, -74)[1] - 111.2) < 0.5);
});

test('point in polygon and compass bearings', () => {
  const sq = [0, 0, 10, 0, 10, 10, 0, 10];
  assert.ok(pointInPoly(5, 5, sq)); assert.ok(!pointInPoly(15, 5, sq));
  assert.equal(Math.round(bearingDeg(0, 1)), 0); assert.equal(Math.round(bearingDeg(1, 0)), 90); assert.equal(Math.round(bearingDeg(-1, 0)), 270);
});

test('drone band follows the magnetic course (13 deg W declination)', () => {
  const east = CONFIG.bands.drone.eastbound * FT, west = CONFIG.bands.drone.westbound * FT;
  assert.equal(droneBandFor(CONFIG, 0), east);     // true 000 = magnetic 013
  assert.equal(droneBandFor(CONFIG, 160), east);   // magnetic 173
  assert.equal(droneBandFor(CONFIG, 170), west);   // magnetic 183: westbound
  assert.equal(droneBandFor(CONFIG, 350), east);   // magnetic 003
  assert.equal(droneBandFor(CONFIG, 340), west);   // magnetic 353
});

test('the placeholder world has land, water, buildings, lanes, no-fly zones and pads', () => {
  assert.ok(world.data.buildings.length > 5000);
  const landShare = world.land.reduce((s, v) => s + v, 0) / world.N;
  assert.ok(landShare > 0.3 && landShare < 0.85, `land share ${landShare}`);
  assert.ok(world.pads.filter((p) => p.hub).length === CONFIG.dronePads.hubs);
  for (const p of world.pads) assert.ok(world.land[p.cell] && !world.nfzMask[p.cell]);
  // the Hudson lane flows north, the East River lane south
  const hud = world.lanes.find((l) => l.id === 'hudson-nb'), east = world.lanes.find((l) => l.id === 'east-sb');
  const c1 = world.laneNodes[hud.nodes[10]].cells[0], c2 = world.laneNodes[east.nodes[20]].cells[0];
  assert.ok(world.laneDirY[c1] > 0.5 && world.laneDirY[c2] < -0.2);
  // the UN zone closes cells for everyone, the substation only for drones
  const un = world.noFly.find((z) => z.id === 0), sub = world.noFly.find((z) => z.name.includes('substation'));
  const cu = world.cellOf(un.x, un.y), cs = world.cellOf(sub.x, sub.y);
  assert.equal(world.nfzMask[cu], TYPE_BIT.drone | TYPE_BIT.tour | TYPE_BIT.medical);
  assert.equal(world.nfzMask[cs], TYPE_BIT.drone);
  assert.ok(world.inNoFly('tour', un.x, un.y, 100) && !world.inNoFly('tour', sub.x, sub.y, 100));
  // a no-fly zone can be seen at its boundary
  assert.ok([...world.features.values()].flat().some((f) => f.kind === F.NFZ && f.id === un.id));
});

test('A* goes round a wall and does not cut corners', () => {
  const W = world.W; const wall = new Set();
  const i0 = 20, j0 = 20;
  for (let j = j0 - 5; j <= j0 + 5; j++) wall.add(j * W + i0);
  const cost = (a, b) => (wall.has(b) ? Infinity : 1);
  const res = aStar(world, j0 * W + (i0 - 3), j0 * W + (i0 + 3), cost);
  assert.ok(res && res.cells.every((c) => !wall.has(c)));
  assert.ok(res.cost > 6 + 4); // had to detour
  for (let k = 1; k < res.cells.length; k++) { // no diagonal step squeezes past a wall cell
    const a = res.cells[k - 1], b = res.cells[k];
    const di = (b % W) - (a % W), dj = Math.floor(b / W) - Math.floor(a / W);
    if (di && dj) assert.ok(!wall.has(a + di) && !wall.has(a + dj * W));
  }
});

test('processed data files re-project when made for a different site box', () => {
  const f = makeFrame(CONFIG.site);
  const other = { ...CONFIG.site, west: CONFIG.site.west - 0.01, south: CONFIG.site.south - 0.01 };
  const fo = makeFrame(other);
  const [x, y] = fo.toXY(40.75, -73.99);
  const b = { format: 'nyc-agents-buildings/1', source: 't', site: other, buildings: [[1000, 50, 'x', [Math.round(x * 10), Math.round(y * 10), Math.round(x * 10) + 100, Math.round(y * 10), Math.round(x * 10), Math.round(y * 10) + 100]]] };
  const l = { format: 'nyc-agents-land/1', source: 't', site: CONFIG.site, land: [] };
  const d = parseData(b, l, f);
  const [ex, ey] = f.toXY(40.75, -73.99);
  assert.ok(Math.abs(d.buildings[0].p[0] - ex) < 0.2 && Math.abs(d.buildings[0].p[1] - ey) < 0.2);
  assert.equal(d.buildings[0].top, 100);
});

function fakeAgent(type, x, y, z, heading) {
  const spec = type === 'drone' ? CONFIG.drone : { ...CONFIG.heli, ...CONFIG.heli[type] };
  const a = { id: 999, type, spec, x, y, z, heading, vx: 0, vy: 0, vz: 0, home: { x, y, z }, start: { x, y, z }, tripNo: 1, isBlockingHeight: (t) => t > z - 10 };
  a.knowledge = makeKnowledge(world, a);
  return a;
}

test('the cone sees ahead, not behind, and a tall building hides what is behind it', () => {
  const a = fakeAgent('drone', 1000, 1000, 60, 0); // facing east
  assert.ok(inCone(a, 1100, 1000, 60));
  assert.ok(!inCone(a, 900, 1000, 60));            // behind
  assert.ok(!inCone(a, 1100, 1300, 60));           // outside the horizontal opening
  assert.ok(!inCone(a, 1000 + a.spec.cone.range + 5, 1000, 60)); // out of range
  // occlusion on a copy of the world with one wall of tall cells
  const w2 = { ...world, height: new Float32Array(world.N), features: new Map() };
  const c0 = world.cellOf(a.x, a.y); const W = world.W;
  for (let dj = -3; dj <= 3; dj++) w2.height[c0 + 2 + dj * W] = 200; // wall 2 cells east
  const sim = { world: w2, config: CONFIG, time: 0, neighbours: () => [] };
  sense(a, sim);
  assert.ok(a.knowledge.flags[c0 + 1] & K.SEEN);
  assert.ok(a.knowledge.flags[c0 + 2] & K.SEEN);
  assert.equal(a.knowledge.knownHeight(c0 + 2) >= 200, true);
  assert.ok(!(a.knowledge.flags[c0 + 3] & K.SEEN), 'cell behind the wall must stay unknown');
});

test('landmarks: drones keep them relative to home, helicopters against a visual reference', () => {
  const d = fakeAgent('drone', 3000, 3000, 60, 0);
  d.trip = { dist: 820 };
  const lm = d.knowledge.addLandmark('congestion', 3300, 3400, 60, 10);
  assert.deepEqual([lm.rep.frame, Math.round(lm.rep.dx), Math.round(lm.rep.dy), lm.rep.along], ['home', 300, 400, 820]);
  assert.equal(d.knowledge.addLandmark('congestion', 3330, 3410, 60, 11), null); // merged
  assert.equal(d.knowledge.landmarks[0].count, 2);
  const h = fakeAgent('tour', 3000, 3000, 240, 0);
  const ref = world.refs.find((r) => r.kind === 'tower');
  h.knowledge.refs.add(ref.id);
  const l2 = h.knowledge.addLandmark('lane-entry', ref.x + 300, ref.y, 240, 5);
  assert.equal(l2.rep.frame, 'ref'); assert.equal(l2.rep.ref, ref.id); assert.equal(l2.rep.bearing, 90);
});

test('express corridors: crossing corridors never share a level, and nothing stands in them', () => {
  const C = world.net.corridors;
  assert.ok(C.length >= 12, `${C.length} corridors`);
  for (const c of C) for (const j of c.crosses) assert.notEqual(c.levelFt, C[j].levelFt, `${c.name} / ${C[j].name}`);
  for (const c of C) {
    const n = Math.ceil(c.len / 10);
    for (let s = 1; s < n; s++) {
      const x = c.x1 + ((c.x2 - c.x1) * s) / n, y = c.y1 + ((c.y2 - c.y1) * s) / n;
      for (const b of world.data.buildings) {
        if (b.top < c.z) continue;
        assert.ok(!pointInPoly(x, y, b.p), `${b.name || 'a building'} (${Math.round(b.top / FT)} ft) stands in corridor ${c.name} at ${c.levelFt} ft`);
      }
    }
  }
});

test('the street network covers Manhattan and joins all six hubs', () => {
  const net = world.net;
  assert.ok(net.streetCount > 1000);
  // every hub can reach every other hub over the streets alone
  const seen = new Set([net.padNode.get(0)]); const todo = [net.padNode.get(0)];
  while (todo.length) { const u = todo.pop(); for (const eid of net.nodes[u].adj) { const e = net.edges[eid]; if (e.kind === 'express') continue; const v = e.a === u ? e.b : e.a; if (!seen.has(v)) { seen.add(v); todo.push(v); } } }
  for (let h = 0; h < 6; h++) assert.ok(seen.has(net.padNode.get(h)), `hub ${h} reachable by street`);
  assert.ok(seen.size > net.streetCount * 0.95, 'the street grid is connected');
});
