// M3.1: an agent's own map (ported from 20261110_agents: "an agent starts knowing only what is
// around it, and its vision is blocked"; "plan on its own map").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/sim/config.js';
import { COVER } from '../src/sim/cover.js';
import { loadWorld } from '../src/data/load-node.js';
import { makeKnowledge, look, plan, frontiers, beliefSpeed } from '../src/sim/knowledge.js';
import { walkerFor } from '../src/sim/paths.js';
import { castRay, EYE } from '../src/sim/los.js';

const world = loadWorld();
const az = world.places.find((p) => p.id === 'azalea-pond');
const start = world.cellOf(az.x - 20, az.y); // §15: just west of Azalea Pond

test('an agent starts knowing nothing; one look shows only a cone and its surroundings', () => {
  const k = makeKnowledge(world, 'survivor', CONFIG);
  assert.equal(k.knownCount, 0);
  const fresh = look(world, k, start, 90, CONFIG.survivor.sightRange, CONFIG.survivor.coneDeg, 0);
  assert.equal(fresh.length, k.knownCount);
  assert.ok(k.knownCount > 9 && k.knownCount < 150, `${k.knownCount} cells seen at first`);
  for (let c = 0; c < world.n; c++) if (k.seen[c]) assert.equal(k.seen[c] - 1, world.cover[c], 'what it saw is what is there');
});

test('vision is blocked: no seen cell lies beyond the first solid along the view', () => {
  const k = makeKnowledge(world, 'survivor', CONFIG);
  look(world, k, start, 0, 60, 360, 0); // a full turn, far range: only occlusion limits it
  const [x0, y0] = world.center(start); const z0 = world.groundAt(x0, y0) + EYE;
  let checked = 0;
  for (let c = 0; c < world.n; c++) {
    if (!k.seen[c]) continue;
    const [x, y] = world.center(c); const d = Math.hypot(x - x0, y - y0); if (d < 6) continue;
    // the view is sampled every 2.5 degrees: a thin trunk can hide a cell's centre from one ray
    // and not from its neighbour, but some ray within 3 degrees must reach the cell
    const a0 = Math.atan2(x - x0, y - y0);
    let best = 0;
    for (let da = -3; da <= 3; da += 0.5) { const a = a0 + (da * Math.PI) / 180; best = Math.max(best, castRay(world, x0, y0, z0, Math.sin(a), Math.cos(a), 0, 64)); }
    assert.ok(d <= best + 2.5 * world.s, `cell ${c} at ${d.toFixed(1)} m is seen though every nearby view stops by ${best.toFixed(1)} m`);
    checked++;
  }
  assert.ok(checked > 20);
});

test('fog shortens the view: at vf 0.35 the cone covers far fewer cells', () => {
  const clear = makeKnowledge(world, 'creature', CONFIG); const fog = makeKnowledge(world, 'creature', CONFIG);
  const lawn = (() => { for (let c = 0; c < world.n; c++) if (world.cover[c] === COVER.LAWN && world.canopy[c] < 10) return c; })();
  look(world, clear, lawn, 45, CONFIG.creature.sightRange, CONFIG.creature.coneDeg, 0);
  look(world, fog, lawn, 45, CONFIG.creature.sightRange * 0.35, CONFIG.creature.coneDeg, 0);
  assert.ok(fog.knownCount < clear.knownCount * 0.5, `${fog.knownCount} vs ${clear.knownCount}`);
});

test('frontiers are kept incrementally and agree with a full recount', () => {
  const k = makeKnowledge(world, 'creature', CONFIG);
  for (let h = 0; h < 360; h += 30) look(world, k, start, h, 30, 100, h);
  const { W, H } = world; let count = 0;
  for (let c = 0; c < world.n; c++) {
    if (!(k.seen[c] && CONFIG.coverSpeed.creature[k.seen[c] - 1] > 0)) continue;
    const i = c % W; const j = (c - i) / W;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => { const ni = i + di; const nj = j + dj; return ni >= 0 && nj >= 0 && ni < W && nj < H && !k.seen[nj * W + ni]; })) count++;
  }
  assert.equal(k.frontierCount, count);
  assert.equal(frontiers(k).length, count);
});

test('plans use only the agent\'s map: unknown is blocked, or assumed passable when asked', () => {
  const k = makeKnowledge(world, 'survivor', CONFIG);
  look(world, k, start, 90, 20, 110, 0);
  const walker = walkerFor(world, 'survivor', CONFIG);
  const far = world.cellOf(330, -410); // exit E76, far outside what it has seen
  assert.equal(plan(walker, k, start, { to: far }), null, 'it cannot plan through what it has not seen');
  const r = plan(walker, k, start, { to: far, unknown: () => 0.6 });
  assert.ok(r && r.cells[r.cells.length - 1] === far, 'optimistic about the unknown: a route exists');
  // the nearest frontier, on its own map
  const fr = plan(walker, k, start, { goal: (c) => k.frontier[c] === 1 });
  assert.ok(fr && k.frontier[fr.goal] === 1 && fr.cells.every((c) => k.seen[c]));
  // beliefs never read the true cover of an unseen cell
  const unseenWater = (() => { for (let c = 0; c < world.n; c++) if (!k.seen[c] && world.cover[c] === COVER.WATER) return c; })();
  assert.equal(beliefSpeed(k, () => 0.6)(unseenWater), 0.6);
});
