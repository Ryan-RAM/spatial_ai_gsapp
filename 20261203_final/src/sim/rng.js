// Seeded random numbers (mulberry32), so a seed always gives the same night.
// Ported from 20261103_position/src/sim/rng.js (same generator, same API), extended with
// named substreams for common random numbers (§11.4): every consumer (each agent, the weather
// gusts, the spawn picker) draws from its own stream, derived from (seed, name). Changing the
// intervention plan then cannot shift the random draws of an unrelated consumer.

export function makeRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), // inclusive
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    // a gaussian draw (Box-Muller), for heading drift
    normal: (mean = 0, sd = 1) => {
      const u = 1 - next();
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}

// FNV-1a hash of a string, mixed with a seed: a stable 32-bit seed for a named substream.
export function hashSeed(seed, name) {
  let h = (0x811c9dc5 ^ (seed >>> 0)) >>> 0;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// An independent stream for one consumer: substream(seed, 'survivor:1'), substream(seed, 'gusts').
export const substream = (seed, name) => makeRng(hashSeed(seed, name));
