// M2.2: frames of reference W, P, N, E and the landmark chain (semantic model §5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorld } from '../src/data/load-node.js';
import { makeFrames, chainEncode, chainDecode, bearingOf, compass8, wrap180 } from '../src/sim/frames.js';
import { makeRng } from '../src/sim/rng.js';

const world = loadWorld();
const F = makeFrames(world);
const rng = makeRng(17);
const close = (a, b, tol = 1e-6) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;

test('bearings: 0 = north, clockwise; compass words', () => {
  assert.equal(bearingOf(0, 1), 0); assert.equal(bearingOf(1, 0), 90); assert.equal(bearingOf(0, -1), 180); assert.equal(bearingOf(-1, 0), 270);
  assert.equal(compass8(44), 'NE'); assert.equal(compass8(350), 'N'); assert.equal(compass8(200), 'S');
  assert.equal(wrap180(350), -10); assert.equal(wrap180(-190), 170);
});

test('W -> P -> W: points on the paths and beside them come back exactly', () => {
  for (let q = 0; q < 300; q++) {
    const e = world.paths.edges[rng.int(0, world.paths.edges.length - 1)];
    const k = rng.int(0, e.pts.length - 2);
    const [ax, ay] = e.pts[k]; const [bx, by] = e.pts[k + 1];
    const L = Math.hypot(bx - ax, by - ay); if (L < 2) continue;
    const t = 0.2 + 0.6 * rng.next(); const off = (rng.next() - 0.5) * 2; // up to 1 m to either side
    const p = [ax + t * (bx - ax) - off * (by - ay) / L, ay + t * (by - ay) + off * (bx - ax) / L];
    const P = F.toP(...p);
    if (Math.abs(Math.abs(P.offset) - Math.abs(off)) > 1e-6) continue; // another edge passes nearer
    assert.ok(close(F.fromP(P), p), `edge ${P.edge}`);
  }
});

test('W -> P snaps to the true nearest edge (checked by brute force)', () => {
  for (let q = 0; q < 200; q++) {
    const x = world.minX + rng.next() * (world.maxX - world.minX); const y = world.minY + rng.next() * (world.maxY - world.minY);
    let best = Infinity;
    for (const e of world.paths.edges) for (let k = 0; k + 1 < e.pts.length; k++) {
      const [ax, ay] = e.pts[k]; const [bx, by] = e.pts[k + 1]; const dx = bx - ax; const dy = by - ay; const L2 = dx * dx + dy * dy || 1e-12;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
    assert.ok(Math.abs(Math.abs(F.toP(x, y).offset) - best) < 1e-9);
  }
});

test('W -> N -> W is exact; N picks the nearest anchor, never a long feature', () => {
  for (let q = 0; q < 200; q++) {
    const p = [world.minX + rng.next() * (world.maxX - world.minX), world.minY + rng.next() * (world.maxY - world.minY)];
    const N = F.toN(...p);
    assert.ok(close(F.fromN(N), p, 1e-6));
    assert.ok(!['the-lake', 'the-ramble', 'east-drive'].includes(N.place));
  }
});

test('N in words, as a person would say it (§5)', () => {
  const az = world.places.find((p) => p.id === 'azalea-pond');
  const [ux, uy] = [Math.SQRT1_2, Math.SQRT1_2];
  assert.equal(F.describeN(az.x + 40 * ux, az.y + 40 * uy), '40 m NE of Azalea Pond');
  const castle = world.places.find((p) => p.id === 'belvedere-castle');
  assert.equal(F.describeN(castle.x, castle.y), 'at Belvedere Castle');
  // far from every anchor: the cover says where, the nearest place says toward what
  // the one stretch of the park more than 150 m from every anchor: in the woods east of the Ramble
  assert.equal(F.describeN(79.5, -112.5), 'in the woods, 155 m S of Belvedere Castle');
});

test('W -> E -> W is exact; behind is +-180', () => {
  const agent = { x: 10, y: -20, heading: 75 };
  for (let q = 0; q < 100; q++) {
    const p = [agent.x + (rng.next() - 0.5) * 80, agent.y + (rng.next() - 0.5) * 80];
    assert.ok(close(F.fromE(agent, F.toE(agent, ...p)), p, 1e-9));
  }
  const behind = F.toE({ x: 0, y: 0, heading: 0 }, 0, -10);
  assert.equal(Math.abs(behind.bearing), 180);
  assert.equal(F.toE({ x: 0, y: 0, heading: 90 }, 10, 0).bearing, 0);
});

test('the landmark chain: offsets from the previous landmark, decoded back exactly', () => {
  const pts = [[3, 4], [10, -2], [-7, 5.5]];
  const chain = chainEncode(pts, [1, 1]);
  assert.deepEqual(chain[0], { dE: 2, dN: 3 });
  assert.deepEqual(chain[1], { dE: 7, dN: -6 });
  assert.deepEqual(chainDecode(chain, [1, 1]), pts);
});
