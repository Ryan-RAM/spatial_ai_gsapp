// Position and movement relations between the occupants of the forest: you, the creature, the
// vaccine case, the hospital door and the crows. Read after every tick; they drive the indicators,
// hiding (among), the crows (adjacent) and the creature's ambush (between).
//
// Position (prepositions of place):
//   above / below   within 2 columns on the plan, on the other level
//   behind          within sight range, but in the rear half of someone's facing
//   adjacent        no occupiable cell in between (walking neighbours, or stacked in the same column)
//   between         m lies on the plan segment from a to b, give or take a tolerance
//   among           most of the 8 cells around are solid: hidden in cover
// Movement (prepositions of movement):
//   toward / away   one step changes the path distance to the other one
//   up / down       a ladder took someone to the other level
//   around          the bearing from the case turned through 270 degrees or more
//   past            the gap closed to a few cells and opened again while the creature never saw you

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
// and it lies within `tol` cells of the segment. It must stand on the level of a or b.
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

// target is behind the observer: within `range` and more than 90 degrees from its facing.
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

// ---------------------------------------------------------------- per tick

export function newTracks() {
  return {
    around: { player: null, creature: null },
    gap: { prev: Infinity, min: Infinity, closing: false, seen: false, minNode: null },
  };
}

const NAME = { player: 'You', creature: 'The creature' };
const OBJ = { player: 'you', creature: 'the creature' };
const BE = { player: 'are', creature: 'is' };
const sentence = (who, rest) => `${NAME[who]} ${BE[who]} ${rest}`;

// Everything true right now, plus the movements completed in the tick that just ran.
// `prev` holds both nodes before the tick (null on the first call of a run).
export function computeRelations(game, prev) {
  const { world, config, pf, exits } = game.ctx;
  const rc = config.relations;
  const me = game.player;
  const it = game.creature;
  const door = exits[0].node;
  const position = [];
  const movement = [];

  // above / below
  if (isAbove(world, me.node, it.node)) position.push({ kind: 'above', upper: 'player', lower: 'creature', text: sentence('player', 'above the creature') });
  else if (isAbove(world, it.node, me.node)) position.push({ kind: 'above', upper: 'creature', lower: 'player', text: sentence('creature', 'above you') });

  // behind
  if (isBehind(world, it.node, it.facing, me.node, config.visionRange)) position.push({ kind: 'behind', who: 'player', of: 'creature', text: sentence('player', 'behind the creature') });
  if (isBehind(world, me.node, me.facing, it.node, config.visionRange)) position.push({ kind: 'behind', who: 'creature', of: 'player', text: sentence('creature', 'behind you') });

  // adjacent
  if (isAdjacent(world, me.node, it.node)) position.push({ kind: 'adjacent', a: 'player', b: 'creature', node: it.node, text: sentence('player', 'next to the creature') });
  if (!game.caseItem.carried && isAdjacent(world, me.node, game.caseItem.node)) {
    position.push({ kind: 'adjacent', a: 'player', b: 'case', node: game.caseItem.node, text: sentence('player', 'next to the vaccine case') });
  }
  if (isAdjacent(world, me.node, door)) position.push({ kind: 'adjacent', a: 'player', b: 'hospital', node: door, text: sentence('player', 'next to the hospital door') });
  for (const c of game.crows) {
    if (c.node === me.node || isAdjacent(world, me.node, c.node)) position.push({ kind: 'adjacent', a: 'player', b: 'crow', node: c.node, text: sentence('player', 'next to a crow') });
  }

  // between: the creature stands between you and what you need (the case, then the hospital)
  const goal = game.caseItem.carried ? door : game.caseItem.node;
  if (isBetween(world, me.node, it.node, goal, rc.betweenTolerance)) {
    position.push({ kind: 'between', who: 'creature', a: 'player', b: game.caseItem.carried ? 'hospital' : 'case', node: goal,
      text: `The creature is between you and the ${game.caseItem.carried ? 'hospital' : 'case'}` });
  }

  // among: you are hidden in cover
  const cover = coverAt(world, me.node);
  if (cover.solid >= rc.coverMin) position.push({ kind: 'among', who: 'player', solid: cover.solid, material: cover.kind, text: sentence('player', `hidden among the ${cover.kind} (${cover.solid} of 8 around)`) });

  if (prev) {
    // toward / away: each one's step, measured against where the other stood
    for (const [who, other] of [['player', 'creature'], ['creature', 'player']]) {
      const from = prev[who];
      const to = game[who].node;
      if (from === to) continue;
      const ref = who === 'player' ? prev.creature : me.node;
      const delta = pf.distance(to, ref) - pf.distance(from, ref);
      if (Math.abs(delta) < 0.5) continue;
      const verb = who === 'player' ? 'move' : 'moves';
      movement.push({ kind: delta < 0 ? 'toward' : 'away', who, other, from, to, text: `${NAME[who]} ${verb} ${delta < 0 ? 'toward' : 'away from'} ${OBJ[other]}` });
    }
    // up / down a ladder
    for (const who of ['player', 'creature']) {
      const a = nodeXYL(world, prev[who]);
      const b = nodeXYL(world, game[who].node);
      if (a.level !== b.level) {
        const up = b.level > a.level;
        const verb = who === 'player' ? 'climb' : 'climbs';
        movement.push({ kind: up ? 'up' : 'down', who, node: game[who].node, text: `${NAME[who]} ${verb} ${up ? 'up to the canopy' : 'down to the ground'}` });
      }
    }
    if (!game.caseItem.carried) {
      for (const who of ['player', 'creature']) {
        const done = trackAround(game, who, rc);
        if (done) movement.push(done);
      }
    }
    const past = trackPast(game, rc);
    if (past) movement.push(past);
  }
  return { position, movement };
}

function trackAround(game, who, rc) {
  const { world } = game.ctx;
  const agent = game[who];
  const C0 = nodeXYL(world, game.caseItem.node);
  const A = nodeXYL(world, agent.node);
  const r = Math.hypot(A.x - C0.x, A.y - C0.y);
  const tracks = game.tracks.around;
  if (r < 1 || r > rc.aroundRadius) { tracks[who] = null; return null; }
  const bearing = Math.atan2(A.y - C0.y, A.x - C0.x);
  const tr = tracks[who];
  if (!tr) { tracks[who] = { last: bearing, sum: 0, trail: [agent.node] }; return null; }
  if (agent.node === tr.trail[tr.trail.length - 1]) return null;
  tr.sum += wrap(bearing - tr.last);
  tr.last = bearing;
  tr.trail.push(agent.node);
  if (tr.trail.length > 80) tr.trail.shift();
  if (Math.abs(tr.sum) < (rc.aroundDeg * Math.PI) / 180) return null;
  const trail = tr.trail.slice();
  tracks[who] = { last: bearing, sum: 0, trail: [agent.node] };
  const verb = who === 'player' ? 'went' : 'went';
  return { kind: 'around', who, center: game.caseItem.node, trail, text: `${NAME[who]} ${verb} around the case` };
}

function trackPast(game, rc) {
  const g = game.tracks.gap;
  const d = game.distances.path;
  let out = null;
  if (d < g.prev - 0.25) {
    if (!g.closing) { g.closing = true; g.min = d; g.seen = false; }
    if (d <= g.min) { g.min = d; g.minNode = game.player.node; }
  } else if (d > g.prev + 0.25 && g.closing) {
    if (g.min <= rc.pastDistance && !g.seen && !game.over) {
      out = { kind: 'past', who: 'player', node: g.minNode, min: g.min, text: `You slipped past the creature, ${g.min.toFixed(1)} cells away, unseen` };
    }
    g.closing = false;
    g.min = Infinity;
  }
  if (game.creature.seesPlayer) g.seen = true;
  g.prev = d;
  return out;
}

// ---------------------------------------------------------------- crows

// Crows perch on canopy cells, spread out and away from the case: occupants whose built-in
// capability is to raise the alarm.
export function placeCrows(ctx, rng, caseNode) {
  const { world, config, pf } = ctx;
  const cc = config.crows;
  const fromCase = pf.row(caseNode);
  const canopy = world.nodes.filter((n) => n >= world.N);
  const pool = (canopy.length ? canopy : world.nodes)
    .filter((n) => fromCase[world.nodeIndex[n]] >= cc.minFromCase && !ctx.exits.some((e) => e.node === n));
  const crows = [];
  for (let k = 0; k < cc.count && pool.length; k++) {
    let best = null;
    let bestGap = -1;
    for (let a = 0; a < 40; a++) {
      const n = rng.pick(pool);
      const P = nodeXYL(world, n);
      const gap = crows.length
        ? Math.min(...crows.map((o) => { const Q = nodeXYL(world, o.node); return Math.hypot(P.x - Q.x, P.y - Q.y); }))
        : rng.next();
      if (gap > bestGap) { bestGap = gap; best = n; }
    }
    crows.push({ id: k, node: best, facing: rng.next() * TAU, cooldown: 0, cawing: false, watching: false });
  }
  return crows;
}

// A crow caws when you come next to it, then rests. The creature hears the caw within the caw
// range (acoustic distance) and goes to the crow, the same way it follows footsteps.
export function stepCrows(game) {
  const { world, config, metrics } = game.ctx;
  const cc = config.crows;
  const me = game.player;
  for (const c of game.crows) {
    c.cawing = false;
    if (c.cooldown > 0) c.cooldown--;
    c.watching = c.node === me.node || isAdjacent(world, c.node, me.node);
    if (!c.watching) continue;
    const P = nodeXYL(world, c.node);
    const T = nodeXYL(world, me.node);
    if (T.x !== P.x || T.y !== P.y) c.facing = Math.atan2(T.y - P.y, T.x - P.x);
    if (c.cooldown > 0) continue;
    c.cawing = true;
    c.cooldown = cc.cooldown;
    const heard = metrics.acoustic(c.node, game.creature.node) <= cc.cawRange;
    game.sounds.push({ who: 'crow', node: c.node, heard: true, creatureHeard: heard });
    if (heard) {
      game.creature.heardAt = c.node;
      game.log('crow', 'caw', 'A crow caws at you. The creature heard it and comes.');
    } else {
      game.log('crow', 'caw', 'A crow caws at you, but the creature is too far away to hear.');
    }
  }
}
