// The intervention plan (semantic model §7.4, §11.3, rules I1-I3): what a park can change on a storm
// night, laid over the fixed real place. It is the genome of the environment generator (M6).
//
//   plan = { plowed: [edgeId], closed: [edgeId], lamps: [{ edge, s }], shelters: [nodeId], signs: [{ edge, s }] }
//
// I1  budget: plowed length <= 1,200 m, lamps <= 12, shelters <= 2, signs <= 6; every item has a cost
// I2  every spawn zone keeps a survivor-passable route to an exit, on the true map with the closures
// I3  lamps, signs and plowing on paths; shelters at junctions (3 or more edges); closures on path edges
// Applying a plan gives cell layers (plowed, closed, light count, shelter, sign). Lamps light the
// cells within their radius that they can see from 4 m up; moving one lamp recomputes only its
// neighbourhood (light is a count of lamps per cell). No DOM.

import { drawLineCells } from './raster-sim.js';
import { segmentClear } from './los.js';

export const emptyPlan = () => ({ plowed: [], closed: [], lamps: [], shelters: [], signs: [] });
export const clonePlan = (p) => JSON.parse(JSON.stringify(p));
export const serializePlan = (p) => JSON.stringify({ v: 1, ...p });
export function deserializePlan(s) {
  const o = typeof s === 'string' ? JSON.parse(s) : s;
  const p = emptyPlan();
  for (const k of Object.keys(p)) if (Array.isArray(o[k])) p[k] = o[k].map((v) => (typeof v === 'object' ? { ...v } : v));
  return p;
}

// cells under each path edge, cached per world
const edgeCellsCache = new WeakMap();
export function edgeCells(world) {
  if (edgeCellsCache.has(world)) return edgeCellsCache.get(world);
  const out = world.paths.edges.map((e) => { const set = new Set(); drawLineCells(world, e.pts, 0.75 * world.s, (k) => set.add(k)); return [...set]; });
  edgeCellsCache.set(world, out); return out;
}

export function pointOnEdge(world, edge, s) {
  const pts = world.paths.edges[edge].pts; let acc = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const L = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
    if (s <= acc + L || k + 2 === pts.length) { const t = L ? Math.min(1, Math.max(0, (s - acc) / L)) : 0; return [pts[k][0] + t * (pts[k + 1][0] - pts[k][0]), pts[k][1] + t * (pts[k + 1][1] - pts[k][1])]; }
    acc += L;
  }
  return pts[0];
}

export function planCost(world, config, plan) {
  const plowedM = plan.plowed.reduce((s, e) => s + (world.paths.edges[e]?.len ?? 0), 0); // unknown edges: reported by checkPlan
  const c = config.cost;
  return { plowedM, total: plowedM * c.plowPerM + plan.lamps.length * c.lamp + plan.shelters.length * c.shelter + plan.signs.length * c.sign };
}
export const fullBudgetCost = (config) => config.budget.plowedM * config.cost.plowPerM + config.budget.lamps * config.cost.lamp + config.budget.shelters * config.cost.shelter + config.budget.signs * config.cost.sign;

// I1 and I3; returns a list of problems (empty = valid)
export function checkPlan(world, config, plan) {
  const errs = []; const E = world.paths.edges.length; const nodes = world.paths.nodes; const b = config.budget;
  const { plowedM } = planCost(world, config, plan);
  if (plowedM > b.plowedM + 1e-6) errs.push(`I1: ${plowedM.toFixed(0)} m plowed > ${b.plowedM} m`);
  if (plan.lamps.length > b.lamps) errs.push(`I1: ${plan.lamps.length} lamps > ${b.lamps}`);
  if (plan.shelters.length > b.shelters) errs.push(`I1: ${plan.shelters.length} shelters > ${b.shelters}`);
  if (plan.signs.length > b.signs) errs.push(`I1: ${plan.signs.length} signs > ${b.signs}`);
  const edgeOk = (e) => Number.isInteger(e) && e >= 0 && e < E;
  for (const e of [...plan.plowed, ...plan.closed]) if (!edgeOk(e)) errs.push(`I3: no path edge ${e}`);
  if (new Set(plan.plowed).size !== plan.plowed.length || new Set(plan.closed).size !== plan.closed.length) errs.push('I3: an edge is listed twice');
  for (const e of plan.plowed) if (plan.closed.includes(e)) errs.push(`I3: edge ${e} both plowed and closed`);
  for (const it of [...plan.lamps, ...plan.signs]) if (!edgeOk(it.edge) || !(it.s >= 0 && it.s <= world.paths.edges[it.edge].len)) errs.push(`I3: ${JSON.stringify(it)} is not on a path`);
  for (const nd of plan.shelters) if (!nodes[nd] || nodes[nd].degree < 3) errs.push(`I3: shelter at ${nd} is not at a junction`);
  if (new Set(plan.shelters).size !== plan.shelters.length) errs.push('I3: two shelters at one junction');
  return errs;
}

// the cells of each spawn zone and of each exit
export function spawnCells(world, config, zone) {
  const z = config.spawnZones.find((q) => q.id === zone) ?? zone; const out = [];
  for (let k = 0; k < world.n; k++) { const [x, y] = world.center(k); if (Math.hypot(x - z.x, y - z.y) <= z.r && config.coverSpeed.survivor[world.cover[k]] > 0) out.push(k); }
  return out;
}
export const exitCells = (world) => new Set(world.paths.exits.map((e) => world.cellOf(e.x, e.y)));

// apply a plan: cell layers
export function applyPlan(world, config, plan) {
  const n = world.n; const ec = edgeCells(world);
  const layers = { plan: clonePlan(plan), plowed: new Uint8Array(n), closed: new Uint8Array(n), light: new Uint8Array(n), lamp: new Int16Array(n).fill(-1), shelter: new Int16Array(n).fill(-1), sign: new Int16Array(n).fill(-1) };
  for (const e of plan.plowed) for (const k of ec[e]) layers.plowed[k] = 1;
  for (const e of plan.closed) for (const k of ec[e]) layers.closed[k] = 1;
  plan.lamps.forEach((l, q) => { addLamp(world, config, layers, l, +1); const k = world.cellOf(...pointOnEdge(world, l.edge, l.s)); if (k >= 0) layers.lamp[k] = q; });
  plan.shelters.forEach((nd, q) => { const k = world.cellOf(world.paths.nodes[nd].x, world.paths.nodes[nd].y); if (k >= 0) layers.shelter[k] = q; });
  plan.signs.forEach((sg, q) => { const k = world.cellOf(...pointOnEdge(world, sg.edge, sg.s)); if (k >= 0) layers.sign[k] = q; });
  return layers;
}

// a lamp lights the cells within its radius that it can see; sign = +1 to add, -1 to remove
export function addLamp(world, config, layers, lamp, sign = 1) {
  const [lx, ly] = pointOnEdge(world, lamp.edge, lamp.s);
  const from = [lx, ly, world.groundAt(lx, ly) + config.lampHeight];
  const R = config.lampRadius; const { s, minX, maxY, W, H } = world;
  const i0 = Math.max(0, Math.floor((lx - R - minX) / s)); const i1 = Math.min(W - 1, Math.floor((lx + R - minX) / s));
  const j0 = Math.max(0, Math.floor((maxY - ly - R) / s)); const j1 = Math.min(H - 1, Math.floor((maxY - ly + R) / s));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * W + i; const [x, y] = world.center(k);
    if (Math.hypot(x - lx, y - ly) > R) continue;
    if (!segmentClear(world, from, [x, y, world.groundAt(x, y) + 0.5])) continue;
    layers.light[k] = Math.max(0, layers.light[k] + sign);
  }
}
// move lamp q of the plan to a new place, recomputing only the two neighbourhoods
export function moveLamp(world, config, layers, q, to) {
  const old = layers.plan.lamps[q];
  addLamp(world, config, layers, old, -1);
  const oc = world.cellOf(...pointOnEdge(world, old.edge, old.s)); if (oc >= 0 && layers.lamp[oc] === q) layers.lamp[oc] = -1;
  layers.plan.lamps[q] = { ...to };
  addLamp(world, config, layers, layers.plan.lamps[q], +1);
  const nc = world.cellOf(...pointOnEdge(world, to.edge, to.s)); if (nc >= 0) layers.lamp[nc] = q;
}

// I2: on the true map, with the plan's closures, does every spawn zone reach an exit?
export function routesExist(world, config, plan, layers = applyPlan(world, config, plan)) {
  const pass = (k) => config.coverSpeed.survivor[world.cover[k]] > 0 && !layers.closed[k];
  const exits = exitCells(world); const { W, H } = world;
  for (const z of config.spawnZones) {
    const start = spawnCells(world, config, z).filter(pass); if (!start.length) return false;
    const seen = new Uint8Array(world.n); const q = [...start]; start.forEach((k) => { seen[k] = 1; });
    let found = false;
    while (q.length && !found) {
      const c = q.pop(); if (exits.has(c)) { found = true; break; }
      const i = c % W; const j = (c - i) / W;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ni = i + di; const nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const m = nj * W + ni; if (seen[m] || !pass(m)) continue;
        if (di && dj && (!pass(j * W + ni) || !pass(nj * W + i))) continue;
        seen[m] = 1; q.push(m);
      }
    }
    if (!found) return false;
  }
  return true;
}

export const isValidPlan = (world, config, plan) => checkPlan(world, config, plan).length === 0 && routesExist(world, config, plan);
