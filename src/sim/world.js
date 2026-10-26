// Two-level misty forest on a grid.
// Ground level: trees, rows of bushes, rocks and a boundary wall.
// Canopy level (3 cells up): platforms joined by narrow bridges, with leaf clumps; open air elsewhere.
// Ladders connect the two levels. After generation every walkable cell is reachable from every other.

import { makeRng } from './rng.js';

export const G = { FREE: 0, TREE: 1, BUSH: 2, ROCK: 3, WALL: 4, LADDER: 5 };
export const C = { AIR: 0, PLATFORM: 1, BRIDGE: 2, FOLIAGE: 3, LADDER: 5 };

const DIRS8 = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export function generateWorld(config, seed = config.seed) {
  const rng = makeRng(seed);
  const W = config.width;
  const H = config.height;
  const ground = new Uint8Array(W * H);
  const canopy = new Uint8Array(W * H);
  const idx = (x, y) => y * W + x;
  const inner = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) if (!inner(x, y)) ground[idx(x, y)] = G.WALL;
  }

  // --- Canopy: platforms -------------------------------------------------
  // Best-candidate placement: of many random rectangles, keep the one farthest from the
  // platforms already placed, so the canopy spreads over the whole forest.
  const platforms = [];
  for (let k = 0; k < config.platformCount; k++) {
    let best = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const w = rng.int(4, 7);
      const h = rng.int(3, 5);
      const x0 = rng.int(2, W - 3 - w);
      const y0 = rng.int(2, H - 3 - h);
      const clash = platforms.some(
        (p) => x0 < p.x0 + p.w + 3 && x0 + w + 3 > p.x0 && y0 < p.y0 + p.h + 3 && y0 + h + 3 > p.y0,
      );
      if (clash) continue;
      const cx = Math.floor(x0 + w / 2);
      const cy = Math.floor(y0 + h / 2);
      const gap = platforms.length
        ? Math.min(...platforms.map((p) => Math.hypot(p.cx - cx, p.cy - cy)))
        : rng.next();
      if (!best || gap > best.gap) best = { x0, y0, w, h, cx, cy, gap };
    }
    if (best) platforms.push(best);
  }
  for (const p of platforms) {
    for (let y = p.y0; y < p.y0 + p.h; y++) {
      for (let x = p.x0; x < p.x0 + p.w; x++) canopy[idx(x, y)] = C.PLATFORM;
    }
  }

  // --- Canopy: bridges along a minimum spanning tree of platform centres ---
  const inTree = [0];
  const edges = [];
  while (inTree.length < platforms.length) {
    let best = null;
    for (const a of inTree) {
      for (let b = 0; b < platforms.length; b++) {
        if (inTree.includes(b)) continue;
        const d = Math.abs(platforms[a].cx - platforms[b].cx) + Math.abs(platforms[a].cy - platforms[b].cy);
        if (!best || d < best.d) best = { a, b, d };
      }
    }
    inTree.push(best.b);
    edges.push(best);
  }
  for (const { a, b } of edges) {
    const pa = platforms[a];
    const pb = platforms[b];
    const horizontalFirst = rng.chance(0.5);
    const lay = (x, y) => {
      if (canopy[idx(x, y)] === C.AIR) canopy[idx(x, y)] = C.BRIDGE;
    };
    let x = pa.cx;
    let y = pa.cy;
    const walkX = () => { while (x !== pb.cx) { x += Math.sign(pb.cx - x); lay(x, y); } };
    const walkY = () => { while (y !== pb.cy) { y += Math.sign(pb.cy - y); lay(x, y); } };
    if (horizontalFirst) { walkX(); walkY(); } else { walkY(); walkX(); }
  }

  // --- Canopy: leaf clumps on platforms -----------------------------------
  for (const p of platforms) {
    for (let k = 0; k < config.foliageClumpsPerPlatform; k++) {
      const fx = rng.int(p.x0, p.x0 + p.w - 2);
      const fy = rng.int(p.y0, p.y0 + p.h - 2);
      if (fx === p.cx || fy === p.cy) continue; // keep the bridge cross free
      const shape = rng.pick([[[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [0, 1]]]);
      for (const [dx, dy] of shape) {
        const cx = fx + dx;
        const cy = fy + dy;
        if (cx === p.cx || cy === p.cy) continue;
        if (canopy[idx(cx, cy)] === C.PLATFORM) canopy[idx(cx, cy)] = C.FOLIAGE;
      }
    }
  }

  // --- Ground obstacles ---------------------------------------------------
  const placeGround = (x, y, type) => {
    if (inner(x, y) && ground[idx(x, y)] === G.FREE) ground[idx(x, y)] = type;
  };
  for (let k = 0; k < config.treeCount; k++) placeGround(rng.int(1, W - 2), rng.int(1, H - 2), G.TREE);
  for (let k = 0; k < config.bushRows; k++) {
    const len = rng.int(3, 7);
    const horizontal = rng.chance(0.5);
    const x0 = rng.int(1, W - 2);
    const y0 = rng.int(1, H - 2);
    for (let i = 0; i < len; i++) placeGround(horizontal ? x0 + i : x0, horizontal ? y0 : y0 + i, G.BUSH);
  }
  for (let k = 0; k < config.rockCount; k++) {
    const [w, h] = rng.pick([[2, 2], [3, 2], [2, 3]]);
    const x0 = rng.int(1, W - 1 - w);
    const y0 = rng.int(1, H - 1 - h);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) placeGround(x, y, G.ROCK);
  }

  // --- Ladders: one per platform, on a platform edge cell -----------------
  const ladderCells = [];
  for (const p of platforms) {
    if (ladderCells.length >= config.ladderCount) break;
    const candidates = [];
    for (let y = p.y0; y < p.y0 + p.h; y++) {
      for (let x = p.x0; x < p.x0 + p.w; x++) {
        const edge = x === p.x0 || y === p.y0 || x === p.x0 + p.w - 1 || y === p.y0 + p.h - 1;
        if (edge && canopy[idx(x, y)] === C.PLATFORM) candidates.push([x, y]);
      }
    }
    if (!candidates.length) continue;
    const [lx, ly] = rng.pick(candidates);
    canopy[idx(lx, ly)] = C.LADDER;
    ground[idx(lx, ly)] = G.LADDER;
    // keep the foot of the ladder open
    for (const [dx, dy] of DIRS8.slice(0, 4)) {
      const nx = lx + dx;
      const ny = ly + dy;
      if (inner(nx, ny) && ground[idx(nx, ny)] !== G.LADDER) ground[idx(nx, ny)] = G.FREE;
    }
    ladderCells.push([lx, ly]);
  }

  const world = buildWorld(config, W, H, ground, canopy, platforms);
  removeUnreachable(world);
  return buildWorld(config, W, H, world.ground, world.canopy, platforms, seed);
}

// Builds the derived data (walkable nodes, solid volumes) from the two cell grids.
export function buildWorld(config, W, H, ground, canopy, platforms = [], seed = 0) {
  const N = W * H;
  const walk = new Uint8Array(2 * N);
  for (let i = 0; i < N; i++) {
    walk[i] = ground[i] === G.FREE || ground[i] === G.LADDER ? 1 : 0;
    walk[N + i] = canopy[i] === C.PLATFORM || canopy[i] === C.BRIDGE || canopy[i] === C.LADDER ? 1 : 0;
  }
  const nodes = [];
  for (let n = 0; n < 2 * N; n++) if (walk[n]) nodes.push(n);
  const nodeIndex = new Int32Array(2 * N).fill(-1);
  nodes.forEach((n, i) => { nodeIndex[n] = i; });

  // Solid vertical intervals [lo, hi] in each column of the grid.
  const solids = [];
  for (let i = 0; i < N; i++) {
    const list = [];
    switch (ground[i]) {
      case G.WALL: list.push([-1, 1e6]); break;
      case G.TREE: list.push([0, config.treeTop]); break;
      case G.BUSH: list.push([0, config.bushTop]); break;
      case G.ROCK: list.push([0, config.rockTop]); break;
      default: break;
    }
    switch (canopy[i]) {
      case C.PLATFORM: case C.BRIDGE: case C.LADDER: list.push([config.slabBottom, config.slabTop]); break;
      case C.FOLIAGE: list.push([config.slabBottom, config.foliageTop]); break;
      default: break;
    }
    solids.push(list);
  }

  const ladders = [];
  for (let i = 0; i < N; i++) if (ground[i] === G.LADDER && canopy[i] === C.LADDER) ladders.push(i);

  return { config, W, H, N, ground, canopy, walk, nodes, nodeIndex, solids, platforms, ladders, seed };
}

// Node id helpers: id = level * W * H + y * W + x
export const nodeId = (world, level, x, y) => level * world.N + y * world.W + x;
export function nodeXYL(world, n) {
  const level = n >= world.N ? 1 : 0;
  const i = n - level * world.N;
  return { x: i % world.W, y: Math.floor(i / world.W), level };
}
export const isWalkable = (world, level, x, y) =>
  x >= 0 && y >= 0 && x < world.W && y < world.H && world.walk[level * world.N + y * world.W + x] === 1;

// Calls fn(neighbour, cost) for each move from node n.
// 8 directions on the same level (diagonal sqrt 2, no cutting a blocked corner) and ladders (cost 3).
export function forEachNeighbour(world, n, fn) {
  const { x, y, level } = nodeXYL(world, n);
  for (const [dx, dy] of DIRS8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!isWalkable(world, level, nx, ny)) continue;
    if (dx !== 0 && dy !== 0) {
      if (!isWalkable(world, level, x + dx, y) || !isWalkable(world, level, x, y + dy)) continue;
      fn(nodeId(world, level, nx, ny), Math.SQRT2);
    } else {
      fn(nodeId(world, level, nx, ny), 1);
    }
  }
  const i = y * world.W + x;
  if (world.ground[i] === G.LADDER && world.canopy[i] === C.LADDER) {
    fn(level === 0 ? world.N + i : i, world.config.ladderCost);
  }
}

// Keeps only the largest connected group of walkable cells; cut-off cells become bush or air.
function removeUnreachable(world) {
  const seen = new Int32Array(2 * world.N).fill(-1);
  let best = -1;
  let bestSize = 0;
  let comp = 0;
  for (const start of world.nodes) {
    if (seen[start] !== -1) continue;
    const stack = [start];
    seen[start] = comp;
    let size = 0;
    while (stack.length) {
      const n = stack.pop();
      size++;
      forEachNeighbour(world, n, (m) => {
        if (seen[m] === -1) { seen[m] = comp; stack.push(m); }
      });
    }
    if (size > bestSize) { bestSize = size; best = comp; }
    comp++;
  }
  for (const n of world.nodes) {
    if (seen[n] === best) continue;
    const { x, y, level } = nodeXYL(world, n);
    const i = y * world.W + x;
    if (level === 0) world.ground[i] = G.BUSH;
    else world.canopy[i] = C.AIR;
  }
  // A ladder only counts if both ends survived.
  for (let i = 0; i < world.N; i++) {
    if (world.ground[i] === G.LADDER && world.canopy[i] !== C.LADDER) world.ground[i] = G.FREE;
    if (world.canopy[i] === C.LADDER && world.ground[i] !== G.LADDER) world.canopy[i] = C.PLATFORM;
  }
}
