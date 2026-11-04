// Position and movement relations between the occupants of the forest.
// Reads the game state after each step and answers questions such as "is the thief above the police?",
// "is the police between the thief and the west exit?" or "did the thief just slip past the officer?".
// The answers drive the visual indicators and two behaviours (the cut-off and the owls).
//
// Position (prepositions of place):
//   above / below   within 2 columns on the plan, on the other level
//   behind          within sight range, but in the rear half of someone's facing
//   adjacent        no occupiable cell in between (walking neighbours, or stacked in the same column)
//   between         a lies on the plan segment from b to c, give or take a tolerance
//   among           most of the 8 cells around are solid (trees, bushes, rocks or leaves)
// Movement (prepositions of movement):
//   toward / away   one step changes the path distance to the other agent
//   up / down       a ladder took the agent to the other level
//   around          the agent's bearing from the diamond turned through 270 degrees or more
//   past            the gap closed to a few cells and opened again while the officer never saw the thief

import { G, C, nodeXYL, forEachNeighbour } from './world.js';

const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------- position

// Adjacent: no occupiable location between the two. On the grid that is a single walking step
// (8 directions, ladders included), or the same column on the other level, because nothing
// between the ground and the canopy floor can be stood on.
export function isAdjacent(world, a, b) {
  if (a === b) return false;
  const p = nodeXYL(world, a);
  const q = nodeXYL(world, b);
  if (p.x === q.x && p.y === q.y) return true;
  let found = false;
  forEachNeighbour(world, a, (n) => { if (n === b) found = true; });
  return found;
}

// a is above b: at most 2 columns apart on the plan, a on the canopy and b on the ground.
export function isAbove(world, a, b) {
  const p = nodeXYL(world, a);
  const q = nodeXYL(world, b);
  return p.level > q.level && Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) <= 2;
}

// m is between a and b on the plan: its projection falls inside the segment (not at either end)
// and it lies within `tol` cells of the segment. It must stand on the level of a or b, so an officer
// on a platform does not block a path on the ground underneath.
export function isBetween(world, a, m, b, tol) {
  const A = nodeXYL(world, a);
  const M = nodeXYL(world, m);
  const B = nodeXYL(world, b);
  if (M.level !== A.level && M.level !== B.level) return false;
  const vx = B.x - A.x;
  const vy = B.y - A.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 4) return false;
  const t = ((M.x - A.x) * vx + (M.y - A.y) * vy) / len2;
  if (t <= 0.08 || t >= 0.92) return false;
  const off = Math.abs((M.x - A.x) * vy - (M.y - A.y) * vx) / Math.sqrt(len2);
  return off <= tol;
}

// target is behind the observer: within `range` (Euclidean, on the plan) and more than 90 degrees
// away from where the observer faces. The forward cone is 120 degrees wide, so behind is never seen.
export function isBehind(world, observer, facing, target, range) {
  const P = nodeXYL(world, observer);
  const T = nodeXYL(world, target);
  const dx = T.x - P.x;
  const dy = T.y - P.y;
  const dz = (T.level - P.level) * world.config.levelHeight;
  if (dx === 0 && dy === 0) return false;
  if (Math.hypot(dx, dy, dz) > range) return false;
  return Math.abs(wrap(Math.atan2(dy, dx) - facing)) > Math.PI / 2;
}

// Among: how many of the 8 cells around n are solid on its level, and which material dominates.
export function coverAt(world, n) {
  const { x, y, level } = nodeXYL(world, n);
  const counts = { trees: 0, bushes: 0, rocks: 0, leaves: 0 };
  let solid = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const i = (y + dy) * world.W + (x + dx);
      if (level === 0) {
        const g = world.ground[i];
        if (g === G.TREE) counts.trees++;
        else if (g === G.BUSH) counts.bushes++;
        else if (g === G.ROCK) counts.rocks++;
        else continue;
      } else if (world.canopy[i] === C.FOLIAGE) counts.leaves++;
      else continue;
      solid++;
    }
  }
  const kind = Object.entries(counts).sort((p, q) => q[1] - p[1])[0][0];
  return { solid, kind };
}

// ---------------------------------------------------------------- per step

export function newTracks() {
  return {
    around: { police: null, thief: null },  // { center, last, sum, trail }
    gap: { prev: Infinity, min: Infinity, closing: false, seen: false, minNode: null },
  };
}

// Everything true right now, plus the movements completed in the step that just ran.
// `prev` holds the agents' nodes before the step (null on the first call of a round).
export function computeRelations(game, prev) {
  const { world, config, pf, exits } = game.ctx;
  const rc = config.relations;
  const p = game.police;
  const t = game.thief;
  const position = [];
  const movement = [];

  // above / below
  if (isAbove(world, t.node, p.node)) position.push({ kind: 'above', upper: 'thief', lower: 'police', text: 'The thief is above the police' });
  else if (isAbove(world, p.node, t.node)) position.push({ kind: 'above', upper: 'police', lower: 'thief', text: 'The police is above the thief' });

  // behind
  if (isBehind(world, p.node, p.facing, t.node, config.visionRange)) {
    position.push({ kind: 'behind', who: 'thief', of: 'police', text: 'The thief is behind the police' });
  }
  if (isBehind(world, t.node, t.facing, p.node, config.visionRange)) {
    position.push({ kind: 'behind', who: 'police', of: 'thief', text: 'The police is behind the thief' });
  }

  // adjacent
  if (isAdjacent(world, t.node, p.node)) position.push({ kind: 'adjacent', a: 'thief', b: 'police', node: p.node, text: 'The thief is next to the police' });
  if (!game.diamond.carried && isAdjacent(world, t.node, game.diamond.home)) {
    position.push({ kind: 'adjacent', a: 'thief', b: 'diamond', node: game.diamond.home, text: 'The thief is next to the diamond' });
  }
  for (const e of exits) {
    if (isAdjacent(world, t.node, e.node)) position.push({ kind: 'adjacent', a: 'thief', b: 'exit', node: e.node, text: `The thief is next to the ${e.side} exit` });
  }
  for (const o of game.owls) {
    if (o.node === t.node || isAdjacent(world, t.node, o.node)) {
      position.push({ kind: 'adjacent', a: 'thief', b: 'owl', node: o.node, text: 'The thief is next to an owl' });
    }
  }

  // between: the officer stands between the thief and the diamond before the theft, and between the
  // thief and an exit after it (the only moments where being in the way matters)
  for (const e of game.diamond.carried ? exits : []) {
    if (isBetween(world, t.node, p.node, e.node, rc.betweenTolerance)) {
      position.push({ kind: 'between', who: 'police', a: 'thief', b: 'exit', node: e.node, side: e.side, text: `The police is between the thief and the ${e.side} exit` });
    }
  }
  if (!game.diamond.carried && isBetween(world, t.node, p.node, game.diamond.home, rc.betweenTolerance)) {
    position.push({ kind: 'between', who: 'police', a: 'thief', b: 'diamond', node: game.diamond.home, text: 'The police is between the thief and the diamond' });
  }

  // among
  for (const who of ['thief', 'police']) {
    const c = coverAt(world, game[who].node);
    if (c.solid >= rc.coverMin) position.push({ kind: 'among', who, solid: c.solid, material: c.kind, text: `The ${who} is among the ${c.kind} (${c.solid} of 8 around)` });
  }

  if (prev) {
    // toward / away: the mover's step, measured against where the other one stood
    for (const [who, other] of [['police', 'thief'], ['thief', 'police']]) {
      const from = prev[who];
      const to = game[who].node;
      if (from === to) continue;
      const ref = who === 'police' ? prev.thief : p.node;
      const delta = pf.distance(to, ref) - pf.distance(from, ref);
      if (Math.abs(delta) < 0.5) continue;
      movement.push({ kind: delta < 0 ? 'toward' : 'away', who, other, from, to, text: `The ${who} moves ${delta < 0 ? 'toward' : 'away from'} the ${other}` });
    }
    // up / down a ladder
    for (const who of ['police', 'thief']) {
      const a = nodeXYL(world, prev[who]);
      const b = nodeXYL(world, game[who].node);
      if (a.level !== b.level) {
        const up = b.level > a.level;
        movement.push({ kind: up ? 'up' : 'down', who, node: game[who].node, text: `The ${who} climbs ${up ? 'up to the canopy' : 'down to the ground'}` });
      }
    }
    // around the diamond
    if (!game.diamond.carried) {
      for (const who of ['police', 'thief']) {
        const done = trackAround(game, who, rc);
        if (done) movement.push(done);
      }
    }
    // past
    const past = trackPast(game, rc);
    if (past) movement.push(past);
  }
  return { position, movement };
}

// Adds up how far the agent's bearing from the diamond turns while it stays within the radius.
function trackAround(game, who, rc) {
  const { world } = game.ctx;
  const agent = game[who];
  const C0 = nodeXYL(world, game.diamond.home);
  const A = nodeXYL(world, agent.node);
  const r = Math.hypot(A.x - C0.x, A.y - C0.y);
  const tracks = game.tracks.around;
  if (r < 1 || r > rc.aroundRadius) { tracks[who] = null; return null; }
  const bearing = Math.atan2(A.y - C0.y, A.x - C0.x);
  const tr = tracks[who];
  if (!tr || tr.center !== game.diamond.home) {
    tracks[who] = { center: game.diamond.home, last: bearing, sum: 0, trail: [agent.node] };
    return null;
  }
  if (agent.node === tr.trail[tr.trail.length - 1]) return null;
  tr.sum += wrap(bearing - tr.last);
  tr.last = bearing;
  tr.trail.push(agent.node);
  if (tr.trail.length > 80) tr.trail.shift();
  if (Math.abs(tr.sum) < (rc.aroundDeg * Math.PI) / 180) return null;
  const trail = tr.trail.slice();
  const dir = tr.sum > 0 ? 'clockwise' : 'counter-clockwise';
  tracks[who] = { center: game.diamond.home, last: bearing, sum: 0, trail: [agent.node] };
  return { kind: 'around', who, center: game.diamond.home, trail, dir, text: `The ${who} went around the diamond (${dir} on the map)` };
}

// The gap between the two closes, bottoms out within a few cells and opens again: the thief went
// past the officer. It only counts if the officer never saw the thief on the way.
function trackPast(game, rc) {
  const g = game.tracks.gap;
  const d = game.distances.path;
  const sees = game.police.seesThief;
  let out = null;
  if (d < g.prev - 0.25) {
    if (!g.closing) { g.closing = true; g.min = d; g.seen = false; }
    if (d <= g.min) { g.min = d; g.minNode = game.thief.node; }
  } else if (d > g.prev + 0.25 && g.closing) {
    if (g.min <= rc.pastDistance && !g.seen && !game.over) {
      out = { kind: 'past', who: 'thief', node: g.minNode, min: g.min, text: `The thief slipped past the police, ${g.min.toFixed(1)} cells away, unseen` };
    }
    g.closing = false;
    g.min = Infinity;
  }
  if (sees) g.seen = true;
  g.prev = d;
  return out;
}

// ---------------------------------------------------------------- owls

// Owls perch on canopy cells (or the ground if a map has no canopy), spread out and away from
// the diamond. They are occupants with a built-in capability: warning.
export function placeOwls(ctx, rng, diamondNode) {
  const { world, config, pf } = ctx;
  const oc = config.owls;
  const fromDiamond = pf.row(diamondNode);
  const canopy = world.nodes.filter((n) => n >= world.N);
  const pool = (canopy.length ? canopy : world.nodes)
    .filter((n) => fromDiamond[world.nodeIndex[n]] >= oc.minFromDiamond && !ctx.exits.some((e) => e.node === n));
  const owls = [];
  for (let k = 0; k < oc.count && pool.length; k++) {
    let best = null;
    let bestGap = -1;
    for (let a = 0; a < 40; a++) {
      const n = rng.pick(pool);
      const P = nodeXYL(world, n);
      const gap = owls.length
        ? Math.min(...owls.map((o) => { const Q = nodeXYL(world, o.node); return Math.hypot(P.x - Q.x, P.y - Q.y); }))
        : rng.next();
      if (gap > bestGap) { bestGap = gap; best = n; }
    }
    owls.push({ id: k, node: best, facing: rng.next() * TAU, cooldown: 0, hooting: false, watching: false });
  }
  return owls;
}

// An owl hoots when the thief comes next to it, then rests for a while. The hoot is a sound like
// a footstep, but louder: the police hears it within the owl's hoot range (acoustic distance) and
// goes to check, the same way it follows footsteps.
export function stepOwls(game) {
  const { world, config, metrics } = game.ctx;
  const oc = config.owls;
  const t = game.thief;
  const hoots = [];
  for (const o of game.owls) {
    o.hooting = false;
    if (o.cooldown > 0) o.cooldown--;
    o.watching = o.node === t.node || isAdjacent(world, o.node, t.node);
    if (!o.watching) continue;
    const P = nodeXYL(world, o.node);
    const T = nodeXYL(world, t.node);
    if (T.x !== P.x || T.y !== P.y) o.facing = Math.atan2(T.y - P.y, T.x - P.x);
    if (o.cooldown > 0) continue;
    o.hooting = true;
    o.cooldown = oc.cooldown;
    const heard = metrics.acoustic(o.node, game.police.node) <= oc.hootRange;
    hoots.push({ owl: o, heard });
    game.sounds.push({ who: 'owl', node: o.node, heard: true, policeHeard: heard });
    if (heard) {
      game.police.heardAt = o.node;
      game.log('owl', 'hoot', 'An owl hoots at the thief next to it. The police heard it and comes to look.');
    } else {
      game.log('owl', 'hoot', 'An owl hoots at the thief next to it, but the police is too far away to hear.');
    }
  }
  return hoots;
}
