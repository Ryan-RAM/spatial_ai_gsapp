// Mutation of an intervention plan (semantic model §11.3, ROADMAP M6.1). One operator per mutation,
// picked at random; a result that breaks rules I1-I3 is redrawn. Deterministic given the rng.
//   plow / unplow an edge (a new plowed edge prefers to touch one already plowed, so routes grow)
//   close / reopen an edge
//   lamp: move one edge along the path, add, remove
//   shelter: move to a neighbouring junction, add, remove
//   sign: add, move, remove
// No DOM.

import { checkPlan, clonePlan, routesExist, planCost } from './interventions.js';

export const OPERATORS = ['plow', 'unplow', 'close', 'reopen', 'lampMove', 'lampAdd', 'lampRemove', 'shelterMove', 'shelterAdd', 'shelterRemove', 'signAdd', 'signMove', 'signRemove'];

const graphCache = new WeakMap();
function graphOf(world) {
  if (graphCache.has(world)) return graphCache.get(world);
  const P = world.paths; const byNode = new Map();
  P.edges.forEach((e) => { for (const nd of [e.a, e.b]) { if (!byNode.has(nd)) byNode.set(nd, []); byNode.get(nd).push(e.id); } });
  const junctions = P.nodes.filter((n) => n.degree >= 3).map((n) => n.id);
  // neighbouring junctions: the junctions reached along edges, through degree-2 chains
  const neighbours = (nd) => P.edges.filter((e) => e.a === nd || e.b === nd).map((e) => (e.a === nd ? e.b : e.a)).filter((m) => P.nodes[m].degree >= 3);
  const g = { byNode, junctions, neighbours, edgesNear: (e) => [...new Set([...(byNode.get(P.edges[e].a) ?? []), ...(byNode.get(P.edges[e].b) ?? [])])].filter((x) => x !== e) };
  graphCache.set(world, g); return g;
}

function applyOp(world, config, plan, op, rng) {
  const P = world.paths; const E = P.edges.length; const G = graphOf(world); const p = clonePlan(plan);
  const pickEdge = () => rng.int(0, E - 1);
  const pos = (edge) => ({ edge, s: +(rng.next() * P.edges[edge].len).toFixed(2) });
  switch (op) {
    case 'plow': {
      const near = p.plowed.length && rng.chance(0.7) ? G.edgesNear(rng.pick(p.plowed)).filter((e) => !p.plowed.includes(e)) : [];
      const e = near.length ? rng.pick(near) : pickEdge(); if (p.plowed.includes(e)) return null; p.plowed.push(e); break;
    }
    case 'unplow': if (!p.plowed.length) return null; p.plowed.splice(rng.int(0, p.plowed.length - 1), 1); break;
    case 'close': { const e = pickEdge(); if (p.closed.includes(e)) return null; p.closed.push(e); break; }
    case 'reopen': if (!p.closed.length) return null; p.closed.splice(rng.int(0, p.closed.length - 1), 1); break;
    case 'lampAdd': p.lamps.push(pos(pickEdge())); break;
    case 'lampRemove': if (!p.lamps.length) return null; p.lamps.splice(rng.int(0, p.lamps.length - 1), 1); break;
    case 'lampMove': {
      if (!p.lamps.length) return null; const q = rng.int(0, p.lamps.length - 1);
      const near = G.edgesNear(p.lamps[q].edge); if (!near.length) return null; p.lamps[q] = pos(rng.pick(near)); break;
    }
    case 'shelterAdd': { const j = rng.pick(G.junctions); if (p.shelters.includes(j)) return null; p.shelters.push(j); break; }
    case 'shelterRemove': if (!p.shelters.length) return null; p.shelters.splice(rng.int(0, p.shelters.length - 1), 1); break;
    case 'shelterMove': {
      if (!p.shelters.length) return null; const q = rng.int(0, p.shelters.length - 1);
      const nb = G.neighbours(p.shelters[q]).filter((m) => !p.shelters.includes(m)); if (!nb.length) return null; p.shelters[q] = rng.pick(nb); break;
    }
    case 'signAdd': p.signs.push(pos(pickEdge())); break;
    case 'signRemove': if (!p.signs.length) return null; p.signs.splice(rng.int(0, p.signs.length - 1), 1); break;
    case 'signMove': { if (!p.signs.length) return null; const q = rng.int(0, p.signs.length - 1); p.signs[q] = pos(pickEdge()); break; }
    default: throw new Error(`unknown operator ${op}`);
  }
  return p;
}

// One mutation: an operator at random, redrawn until the child satisfies I1-I3 (at most `tries`).
// Returns { plan, op, diff } or null if no valid child was found.
export function mutate(world, config, plan, rng, { tries = 60 } = {}) {
  for (let t = 0; t < tries; t++) {
    const op = rng.pick(OPERATORS);
    const child = applyOp(world, config, plan, op, rng);
    if (!child) continue;
    if (checkPlan(world, config, child).length) continue;            // I1, I3
    // I2: only a closure changes where survivors can walk; nothing else can break it
    if (op === 'close' && !routesExist(world, config, child)) continue;
    return { plan: child, op, diff: describeDiff(world, config, plan, child, op) };
  }
  return null;
}

// what changed, in words (shown next to each child in manual mode)
export function describeDiff(world, config, parent, child, op) {
  const name = (e) => world.paths.edges[e]?.name ?? `path ${e}`;
  const added = (k) => child[k].filter((x) => !parent[k].some((y) => JSON.stringify(y) === JSON.stringify(x)));
  const removed = (k) => parent[k].filter((x) => !child[k].some((y) => JSON.stringify(y) === JSON.stringify(x)));
  const words = {
    plow: () => `plowed ${name(added('plowed')[0])} (${Math.round(world.paths.edges[added('plowed')[0]].len)} m)`,
    unplow: () => `stopped plowing ${name(removed('plowed')[0])}`,
    close: () => `closed ${name(added('closed')[0])}`, reopen: () => `reopened ${name(removed('closed')[0])}`,
    lampAdd: () => 'added a lamp', lampRemove: () => 'removed a lamp', lampMove: () => 'moved a lamp along the path',
    shelterAdd: () => 'added a warming shelter', shelterRemove: () => 'removed a warming shelter', shelterMove: () => 'moved a shelter to the next junction',
    signAdd: () => 'put up a sign', signRemove: () => 'took down a sign', signMove: () => 'moved a sign',
  };
  return { op, text: (words[op] ?? (() => op))(), cost: planCost(world, config, child).total - planCost(world, config, parent).total };
}
