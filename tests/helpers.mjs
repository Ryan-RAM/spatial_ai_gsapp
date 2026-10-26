// Builds small hand-drawn worlds for the tests.
// Ground legend: . free  T tree  b bush  R rock  # wall  H ladder
// Canopy legend: (space) air  = platform  - bridge  @ leaves  H ladder

import { CONFIG } from '../src/sim/config.js';
import { buildWorld, G, C, nodeId } from '../src/sim/world.js';

const GMAP = { '.': G.FREE, T: G.TREE, b: G.BUSH, R: G.ROCK, '#': G.WALL, H: G.LADDER };
const CMAP = { ' ': C.AIR, '=': C.PLATFORM, '-': C.BRIDGE, '@': C.FOLIAGE, H: C.LADDER };

export function makeTestWorld(groundRows, canopyRows = null, overrides = {}) {
  const config = { ...CONFIG, ...overrides };
  const H = groundRows.length;
  const W = groundRows[0].length;
  const ground = new Uint8Array(W * H);
  const canopy = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      ground[y * W + x] = GMAP[groundRows[y][x]];
      canopy[y * W + x] = canopyRows ? CMAP[canopyRows[y][x] ?? ' '] : C.AIR;
    }
  }
  const world = buildWorld(config, W, H, ground, canopy);
  return { world, at: (level, x, y) => nodeId(world, level, x, y) };
}

export const EAST = 0;
export const WEST = Math.PI;
export const SOUTH = Math.PI / 2;
export const NORTH = -Math.PI / 2;
