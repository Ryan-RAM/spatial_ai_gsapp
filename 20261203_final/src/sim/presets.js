// Preset plans and sharing (ROADMAP M6.7). Routes are found on the path graph (frame P) from a
// spawn zone toward the nearest exit, so the presets follow real paths. No DOM.

import { CONFIG } from './config.js';
import { emptyPlan } from './interventions.js';

const adjCache = new WeakMap();
export function pathAdjacency(world) {
  if (adjCache.has(world)) return adjCache.get(world);
  const adj = new Map(); for (const e of world.paths.edges) for (const [a, b] of [[e.a, e.b], [e.b, e.a]]) { if (!adj.has(a)) adj.set(a, []); adj.get(a).push([b, e.id, e.len]); }
  adjCache.set(world, adj); return adj;
}
export function nearestNode(world, x, y) {
  let best = null; let bd = Infinity; for (const n of world.paths.nodes) { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = n; } } return best.id;
}
// shortest edge route (Dijkstra on lengths) from a node to the nearest exit: [edgeIds] in order
export function routeToExit(world, from) {
  const adj = pathAdjacency(world); const exits = new Set(world.paths.exits.map((e) => e.node));
  const dist = new Map([[from, 0]]); const via = new Map(); const done = new Set(); const q = [from];
  let goal = null;
  while (q.length) {
    q.sort((a, b) => dist.get(a) - dist.get(b)); const u = q.shift(); if (done.has(u)) continue; done.add(u);
    if (exits.has(u)) { goal = u; break; }
    for (const [v, e, l] of adj.get(u) ?? []) { const d = dist.get(u) + l; if (d < (dist.get(v) ?? Infinity)) { dist.set(v, d); via.set(v, [u, e]); q.push(v); } }
  }
  const edges = []; for (let v = goal; v != null && v !== from; v = via.get(v)[0]) edges.unshift(via.get(v)[1]);
  return { edges, length: dist.get(goal) ?? Infinity, goal };
}
const trimToBudget = (world, edges, budgetM) => { const out = []; let m = 0; for (const e of edges) { if (m + world.paths.edges[e].len > budgetM) break; out.push(e); m += world.paths.edges[e].len; } return out; };
const along = (world, edges, frac) => { // a point a fraction of the way along a route: { edge, s }
  const total = edges.reduce((a, e) => a + world.paths.edges[e].len, 0); let goal = total * frac;
  for (const e of edges) { const L = world.paths.edges[e].len; if (goal <= L) return { edge: e, s: +goal.toFixed(2) }; goal -= L; }
  return { edge: edges[edges.length - 1], s: 0 };
};

export function presets(world, config = CONFIG) {
  const zone = (id) => config.spawnZones.find((z) => z.id === id);
  const fromAzalea = routeToExit(world, nearestNode(world, zone('azalea-west').x, zone('azalea-west').y));
  const fromArch = routeToExit(world, nearestNode(world, zone('stone-arch').x, zone('stone-arch').y));
  const planB = emptyPlan();
  planB.plowed = trimToBudget(world, fromAzalea.edges, config.budget.plowedM);
  planB.lamps = [0.25, 0.5, 0.75].map((f) => along(world, planB.plowed, f));
  const firstJunction = planB.plowed.map((e) => world.paths.edges[e]).find((e) => world.paths.nodes[e.b].degree >= 3) ?? world.paths.edges[planB.plowed[0]];
  planB.signs = [{ edge: firstJunction.id, s: +firstJunction.len.toFixed(2) }];
  const corridor = emptyPlan();
  corridor.lamps = Array.from({ length: config.budget.lamps }, (_, q) => along(world, fromAzalea.edges, (q + 0.5) / config.budget.lamps));
  corridor.signs = [0.1, 0.4, 0.7].map((f) => along(world, fromAzalea.edges, f));
  const arch = emptyPlan(); arch.plowed = trimToBudget(world, fromArch.edges, config.budget.plowedM);
  return [
    { id: 'empty', name: 'Empty plan', plan: emptyPlan() },
    { id: 'plan-b', name: 'Plan B (§15): plowed route from Azalea Pond, 3 lamps, a sign', plan: planB },
    { id: 'lamp-corridor', name: 'Lamp corridor: 12 lamps and 3 signs, no plowing', plan: corridor },
    { id: 'arch-route', name: 'Plowed route from the Stone Arch', plan: arch },
  ];
}

// sharing: a plan in the URL hash, compact (base64url of short JSON)
const keys = ['plowed', 'closed', 'lamps', 'shelters', 'signs'];
export function encodePlan(plan) {
  const short = { p: plan.plowed, c: plan.closed, l: plan.lamps.map((x) => [x.edge, x.s]), h: plan.shelters, g: plan.signs.map((x) => [x.edge, x.s]) };
  const b64 = typeof btoa === 'function' ? btoa(JSON.stringify(short)) : Buffer.from(JSON.stringify(short)).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodePlan(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString();
  const o = JSON.parse(json);
  const plan = { plowed: o.p ?? [], closed: o.c ?? [], lamps: (o.l ?? []).map(([edge, s]) => ({ edge, s })), shelters: o.h ?? [], signs: (o.g ?? []).map(([edge, s]) => ({ edge, s })) };
  for (const k of keys) if (!Array.isArray(plan[k])) throw new Error('bad plan');
  return plan;
}
