// The palette of Frostroot: The Ramble (CLAUDE.md §4, docs/style-frame.md). One set of tokens for
// the 3D scene, the 2D map and the page (style.css mirrors them).
// Rule: warm = safety. Warm orange appears only where there is light: lamps, flashlights,
// warming shelters. Everything else is the cold night; the creature's eyes are a cold,
// sickly green-white so they never read as "safe".

export const PALETTE = {
  // the night
  sky: 0x0b1020, skyHigh: 0x161d33, fog: 0x2a3150,
  snowLit: 0xdfe6f3, snow: 0xa9b6d1, snowShadow: 0x56607e, snowDeep: 0x3b4363,
  rock: 0x4a4d63, water: 0x101a30, ice: 0x5b6b8f,
  bark: 0x2b2533, barkLight: 0x4a3f55, evergreen: 0x1f3a3c, crownHaze: 0x3a3e5c,
  path: 0x8f98b4, pathPlowed: 0x6f7694,
  outline: 0x05070d,
  // safety: light
  warm: 0xf2a65a, warmHot: 0xffd29a, warmDeep: 0xb8621f,
  // people (cold-weather clothing, muted; only their light is warm)
  coat1: 0x5a6f8c, coat2: 0x7c6a8c, skin: 0xc9a796, scarf: 0x8c4f5a,
  // the creature
  root: 0x2a1d1f, rootLight: 0x4b3330, eye: 0xc8ffd8,
};

export const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
