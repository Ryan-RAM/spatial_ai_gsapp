// Perception (semantic model §9 rules P1-P3, §6.1-6.2). No DOM.
//   P1  sight: inside the forward cone, d_E <= range x vf(t), and a clear 3D segment between the eye
//       points. Survivors see 2x farther into lit cells; anyone standing in a lit cell is seen from
//       1.5x farther.
//   P2  hearing: d_A(source -> listener) + the sound's extra metres (walking is quieter, deep snow
//       louder) <= the threshold, lowered by gusts. The listener learns the direction and a rough
//       distance (+-30 %).
//   P3  tracks: an agent notices tracks in the cells it sees; the creature reads their heading and
//       age, survivors only that something passed (see the brains).

import { eyeAt, segmentClear } from './los.js';
import { acoustic, hearingThreshold } from './metrics.js';
import { bearingOf, wrap180 } from './frames.js';

export function sightRange(config, kind, weather, targetLit) {
  const base = config[kind].sightRange * weather.vf;
  return base * (targetLit ? (kind === 'survivor' ? 2 : 1.5) : 1);
}

// Can `observer` (cell, heading, kind) see the target cell?
export function sees(world, config, observer, targetCell, weather, layers = null) {
  const [x0, y0] = world.center(observer.cell); const [x1, y1] = world.center(targetCell);
  const lit = layers ? layers.light[targetCell] > 0 : false;
  const range = sightRange(config, observer.kind, weather, lit);
  const d = Math.hypot(x1 - x0, y1 - y0);
  if (d > range) return false;
  if (d > 1e-6 && Math.abs(wrap180(bearingOf(x1 - x0, y1 - y0) - observer.heading)) > config[observer.kind].coneDeg / 2) return false;
  return segmentClear(world, eyeAt(world, x0, y0), eyeAt(world, x1, y1));
}

// Does the listener hear the sound? Returns { bearing, distance } (distance off by up to 30 %) or null.
export function hears(world, config, listener, sound, weather, rng) {
  const H = hearingThreshold(config, config[listener.kind].hearing, weather);
  const [x0, y0] = world.center(listener.cell); const [x1, y1] = world.center(sound.origin);
  if (Math.hypot(x1 - x0, y1 - y0) > (H + 10) * 1.5) return null; // too far to bother computing d_A
  const dA = acoustic(world, config, sound.origin, listener.cell, weather) + (sound.extraM ?? 0);
  if (dA > H) return null;
  const d = Math.hypot(x1 - x0, y1 - y0);
  return { bearing: bearingOf(x1 - x0, y1 - y0), distance: d * (1 + (rng.next() * 2 - 1) * 0.3), dA };
}

// the cell a heard sound seems to come from (direction exact, distance rough), on the grid
export function guessCell(world, listenerCell, heard) {
  const [x0, y0] = world.center(listenerCell);
  const a = heard.bearing * Math.PI / 180;
  for (let d = heard.distance; d > 0; d -= world.s) {
    const c = world.cellOf(x0 + Math.sin(a) * d, y0 + Math.cos(a) * d); if (c >= 0) return c;
  }
  return listenerCell;
}
