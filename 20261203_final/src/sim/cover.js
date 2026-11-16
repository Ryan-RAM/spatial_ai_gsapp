// Ground cover of a cell (semantic model §3.2). Codes are stored in data/baked/cover.bin (Uint8,
// idx = j * W + i). Speed and passability per agent kind live in config (§6.3, rule M2).
// No DOM, no imports.

export const COVER = Object.freeze({
  OUTSIDE: 0,        // in the bbox but outside the study area (beyond the park edge): never entered
  PATH_PAVED: 1,
  PATH_DIRT: 2,
  LAWN: 3,
  WOODLAND: 4,       // woodland floor
  THICKET: 5,        // set from tree density in M1.4 (OSM has no scrub here)
  ROCK: 6,
  WATER: 7,
  STRUCTURE: 8,      // buildings, walls, sunken roads
});

export const COVER_NAMES = Object.freeze([
  'outside', 'path_paved', 'path_dirt', 'lawn', 'woodland_floor', 'thicket', 'rock', 'water', 'structure',
]);

export const isPath = (c) => c === COVER.PATH_PAVED || c === COVER.PATH_DIRT;
