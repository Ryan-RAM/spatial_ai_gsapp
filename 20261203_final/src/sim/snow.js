// Snow on the ground and the tracks in it (semantic model §4.2, rules S1-S3, T1-T2). No DOM.
//
// S1  depth(c, t) = S(t) x drift(c, wind) x (1 - 0.6 x canopyEvergreen(c)); S(t) from the storm
//     clock; drift from the 8 baked wind directions, interpolated to the wind's direction
// S2  deeper than 40 cm: a hindrance for survivors (slower through f_snow, and louder steps)
// S3  plowed cells hold at most 5 cm
// T1  every step leaves a track of readability 1
// T2  readability = 1 - fill / F, fill = new snow since the step, sheltered like S1, times
//     (1 + c x openness x windFactor). The model's F = 10 cm and c = 2 contradict its own example
//     (§15: open tracks fill in 20-30 minutes at 19:00); config uses F = 3 cm and c = 6 (D-024).
//     The wind changes during the night, so the layer keeps two running integrals of the
//     snowfall, A = ∫ rate dt and B = ∫ rate x windFactor dt; a track's fill is then
//     shelter x [(A - A0) + c openness (B - B0)], exact for any wind history.

import { CONFIG } from './config.js';

export const HINDRANCE_CM = CONFIG.hindranceCm;
export const PLOWED_CM = CONFIG.plowedCm;

const windFactor = (ms) => Math.min(ms / 10, 1);

export function makeSnow(world, { capacity = 50000, config = CONFIG } = {}) {
  const FILL = config.trackFillCm; const C = config.trackWindCoef;
  const { n } = world;
  const depth = new Float32Array(n);
  const plowed = new Uint8Array(n);
  const shelter = new Float32Array(n); const open = new Float32Array(n);
  for (let k = 0; k < n; k++) { shelter[k] = 1 - 0.6 * (world.canopyEv[k] / 255); open[k] = world.openness[k] / 255; }
  const dirs = world.windDirs; // N, NE, E, ... clockwise, 45 degrees apart
  let A = 0; let B = 0; let lastT = null; let lastCum = 0;

  // tracks: a ring buffer of typed arrays; latest[k] = the newest track in cell k, or -1
  const tCell = new Int32Array(capacity); const tTime = new Float64Array(capacity); const tKind = new Uint8Array(capacity);
  const tHeading = new Float32Array(capacity); const tA = new Float64Array(capacity); const tB = new Float64Array(capacity);
  const tAgent = new Int16Array(capacity);
  const latest = new Int32Array(n).fill(-1);
  let count = 0; let head = 0;

  // S1-S3 for the storm state `s` at storm time s.t (call once per update interval, in time order)
  function update(s) {
    if (lastT !== null && s.t > lastT) {
      const dS = s.cumSnowCm - lastCum; // snow that fell since the last update (cm)
      A += dS; B += dS * windFactor(s.windMs);
    } else if (lastT === null) { A = s.cumSnowCm; B = s.cumSnowCm * windFactor(s.windMs); }
    lastT = s.t; lastCum = s.cumSnowCm;
    const f = (((s.windFromDeg % 360) + 360) % 360) / 45; const d0 = Math.floor(f) % 8; const d1 = (d0 + 1) % 8; const u = f - Math.floor(f);
    const D0 = world.drift[dirs[d0]]; const D1 = world.drift[dirs[d1]];
    const S = s.cumSnowCm;
    for (let k = 0; k < n; k++) {
      const drift = ((1 - u) * D0[k] + u * D1[k]) / 100;
      const v = S * drift * shelter[k];
      depth[k] = plowed[k] && v > config.plowedCm ? config.plowedCm : v;
    }
  }

  // T1: a step into cell k at storm time t by an agent of `kind` (0 survivor, 1 creature), facing `heading`
  function step(k, t, kind, heading, agent = -1) {
    const q = head; head = (head + 1) % capacity; if (count < capacity) count++;
    if (latest[tCell[q]] === q && count === capacity) latest[tCell[q]] = -1; // overwritten
    tCell[q] = k; tTime[q] = t; tKind[q] = kind; tHeading[q] = heading; tA[q] = A; tB[q] = B; tAgent[q] = agent;
    latest[k] = q;
    return q;
  }
  // T2
  function readability(q) {
    const k = tCell[q];
    const fill = shelter[k] * ((A - tA[q]) + C * open[k] * (B - tB[q]));
    return Math.max(0, 1 - fill / FILL);
  }
  const trackAt = (k) => (latest[k] >= 0 ? latest[k] : -1);
  const track = (q) => ({ cell: tCell[q], t: tTime[q], kind: tKind[q], heading: tHeading[q], agent: tAgent[q], readability: readability(q) });

  return {
    depth, plowed, update, step, readability, trackAt, track,
    isHindrance: (k) => depth[k] > config.hindranceCm,
    get trackCount() { return count; },
    get integrals() { return { A, B }; },
  };
}
