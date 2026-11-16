// Landmarks: the places an agent decides to remember (semantic model §7.8). Ported from
// 20261110_agents/src/sim/knowledge.js (addLandmark, nearLandmark, recognise). Changes:
//   - offsets in metres (dE, dN) as well as cells, from the previous lasting landmark (the chain)
//   - the types of §7.8: dead_end, junction, clearing, bridge, named_place, lamp, shelter, sign,
//     exit (recognised from what the agent sees) and heard, sighting, catch (added by its brain)
//   - recognition from the real data instead of local cell patterns: junctions and dead ends from
//     the path graph (a dead end is a path that stops, not three blocked cells), bridges, named
//     places, exits; lamps, shelters and signs from the intervention plan; clearings from cover
//   - confidence: 1 for the lasting kinds; heard and sighting fade with age (half-life below)
// No DOM.

import { chainDecode } from './frames.js';

export const TRANSIENT = { heard: { keep: 5, halfLifeS: 180 }, sighting: { keep: 3, halfLifeS: 300 }, catch: { keep: 6, halfLifeS: Infinity } };
const PREFIX = { dead_end: 'D', junction: 'J', clearing: 'C', bridge: 'B', named_place: 'P', lamp: 'L', shelter: 'S', sign: 'G', exit: 'E', heard: 'h', sighting: 'x', catch: '†', start: 'O' };
const DEDUPE_M = { dead_end: 4, junction: 4, clearing: 25, bridge: 10, named_place: 5, lamp: 4, shelter: 4, sign: 4, exit: 10 };

// what can be recognised in each cell of this world (built once, cached)
const cache = new WeakMap();
export function landmarkIndex(world) {
  if (cache.has(world)) return cache.get(world);
  const at = new Map(); const add = (cell, f) => { if (cell < 0) return; if (!at.has(cell)) at.set(cell, []); at.get(cell).push(f); };
  const P = world.paths;
  const exitNodes = new Set(P.exits.map((e) => e.node));
  for (const nd of P.nodes) {
    const c = world.cellOf(nd.x, nd.y);
    if (exitNodes.has(nd.id)) add(c, { type: 'exit', ref: `exit:${nd.id}`, note: P.exits.find((e) => e.node === nd.id).name });
    else if (nd.degree >= 3) add(c, { type: 'junction', ref: `node:${nd.id}`, note: `a junction of ${nd.degree} paths` });
    else if (nd.degree === 1) add(c, { type: 'dead_end', ref: `node:${nd.id}`, note: 'the path ends' });
  }
  for (const e of P.edges) if (e.bridge) {
    const m = e.pts[Math.floor(e.pts.length / 2)]; add(world.cellOf(m[0], m[1]), { type: 'bridge', ref: `edge:${e.id}`, note: e.name ?? 'a bridge' });
  }
  for (const p of world.places ?? []) add(world.cellOf(p.x, p.y), { type: 'named_place', ref: `place:${p.id}`, note: p.name });
  const out = { at };
  cache.set(world, out); return out;
}

export function addLandmark(k, world, { type, cell, tick, note = '', ref = null, confidence = 1, tSec = null }) {
  const [x, y] = world.center(cell);
  const lasting = k.landmarks.filter((l) => !TRANSIENT[l.type]);
  const prev = lasting.length ? lasting[lasting.length - 1] : null;
  k.counters = k.counters ?? {};
  const count = (k.counters[type] = (k.counters[type] ?? 0) + 1);
  const W = world.W; const i = cell % W; const j = (cell - i) / W;
  const lm = {
    id: `${PREFIX[type] ?? '?'}${count}`, type, cell, tick, tSec, note, ref, confidence,
    rel: prev ? prev.id : null,
    dE: prev ? x - prev.x : x, dN: prev ? y - prev.y : y,           // metres, frame W offsets
    di: prev ? i - (prev.cell % W) : i, dj: prev ? j - ((prev.cell - (prev.cell % W)) / W) : j,
    x, y,                                                             // kept only to draw it
  };
  lm.text = prev ? `${describe(lm.dE, lm.dN)} of ${prev.id}` : 'where it began';
  k.landmarks.push(lm);
  const tr = TRANSIENT[type];
  if (tr) { const same = k.landmarks.filter((l) => l.type === type); if (same.length > tr.keep) k.landmarks.splice(k.landmarks.indexOf(same[0]), 1); }
  return lm;
}

const describe = (dE, dN) => {
  const parts = [];
  if (Math.abs(dE) >= 1) parts.push(`${Math.round(Math.abs(dE))} m ${dE > 0 ? 'E' : 'W'}`);
  if (Math.abs(dN) >= 1) parts.push(`${Math.round(Math.abs(dN))} m ${dN > 0 ? 'N' : 'S'}`);
  return parts.length ? parts.join(', ') : 'right at';
};

// confidence now: transient landmarks fade with a half-life (in storm seconds)
export function confidenceAt(l, tSec) {
  const tr = TRANSIENT[l.type]; if (!tr || !Number.isFinite(tr.halfLifeS) || l.tSec == null) return l.confidence;
  return l.confidence * 0.5 ** ((tSec - l.tSec) / tr.halfLifeS);
}

// the chain of lasting landmarks, back to absolute positions (frame W), from their offsets only
export function resolveChain(k) {
  const lasting = k.landmarks.filter((l) => !TRANSIENT[l.type]);
  return chainDecode(lasting.map((l) => ({ dE: l.dE, dN: l.dN })), [0, 0]).map((p, q) => ({ id: lasting[q].id, x: p[0], y: p[1] }));
}

export function nearLandmark(k, type, x, y, r) {
  return k.landmarks.some((l) => l.type === type && Math.hypot(l.x - x, l.y - y) <= r);
}
export const landmarksOf = (k, type) => k.landmarks.filter((l) => l.type === type);
export const knownByRef = (k, ref) => k.landmarks.find((l) => l.ref === ref) ?? null;

// After a look: landmarks for what the agent can now recognise among the newly seen cells.
// ctx: { layers (intervention cells), tSec }. Returns the landmarks made.
export function recognise(world, k, fresh, tick, ctx = {}) {
  const idx = landmarkIndex(world); const made = [];
  const L = ctx.layers;
  const tryAdd = (type, cell, note, ref) => {
    const [x, y] = world.center(cell);
    if (ref && knownByRef(k, ref)) return;
    if (!ref && nearLandmark(k, type, x, y, DEDUPE_M[type] ?? 4)) return;
    made.push(addLandmark(k, world, { type, cell, tick, note, ref, tSec: ctx.tSec ?? null }));
  };
  for (const c of fresh) {
    for (const f of idx.at.get(c) ?? []) tryAdd(f.type, c, f.note, f.ref);
    if (L) {
      if (L.lamp[c] >= 0) tryAdd('lamp', c, 'a lamp', `lamp:${L.lamp[c]}`);
      if (L.shelter[c] >= 0) tryAdd('shelter', c, 'a warming shelter', `shelter:${L.shelter[c]}`);
      if (L.sign[c] >= 0) tryAdd('sign', c, 'a sign to the exit', `sign:${L.sign[c]}`);
    }
    // a clearing: open lawn, and the 7 x 7 cells around it it knows are mostly lawn too
    if (world.cover[c] === 3 && world.canopy[c] < 40) {
      const W = world.W; const i = c % W; const j = (c - i) / W; let lawn = 0; let seen = 0;
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
        const ni = i + di; const nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= world.H) continue;
        const m = nj * W + ni; if (!k.seen[m]) continue; seen++; if (k.seen[m] - 1 === 3 && world.canopy[m] < 60) lawn++;
      }
      if (seen >= 35 && lawn >= 0.85 * 49) tryAdd('clearing', c, 'a clearing');
    }
  }
  return made;
}
