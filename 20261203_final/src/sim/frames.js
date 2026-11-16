// The frames of reference of semantic model §5, and the conversions between them. One module,
// unit-tested (tests/frames.test.mjs). No DOM, no imports.
//
//   W  world, metric      (x, y) metres east and north of the KNYC station; cell idx = j * W + i
//   P  path network       { edge, s, offset }: metres along a path edge from its first node, and a
//                         signed lateral offset (positive to the left of the edge's direction)
//   N  named place        { place, bearing, distance }: from a named place, bearing in degrees
//                         clockwise from north
//   E  egocentric         { bearing, distance }: bearing relative to the agent's heading, -180..180
//   landmark chain        private to an agent: each landmark stored as an offset from the one
//                         before it (chainEncode / chainDecode), as in Frostroot: Agents
//
// Headings and bearings are in degrees, 0 = north, clockwise (§2).

const DEG = 180 / Math.PI;
export const bearingOf = (dx, dy) => ((Math.atan2(dx, dy) * DEG) + 360) % 360;
export const unitOf = (deg) => [Math.sin(deg / DEG), Math.cos(deg / DEG)];
export const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const POINTS8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass8 = (deg) => POINTS8[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

// Named features that make poor anchors: long or large ones whose centre means nothing on the
// ground ("40 m NE of the Lake"). They are still places; they are just not used for frame N.
const NOT_ANCHORS = new Set(['the-lake', 'the-ramble', 'the-gill', 'east-drive', 'west-drive', 'wallach-walk']);
export const N_RADIUS = 150; // m: beyond it a position is "in the woods, toward X" (§5)

export function makeFrames(world) {
  const edges = world.paths?.edges ?? [];
  // ---- frame P: segments of every edge, bucketed on a 30 m grid
  const B = 30;
  const segs = []; // [edge, k, ax, ay, bx, by, s0]
  edges.forEach((e, id) => {
    let s0 = 0;
    for (let k = 0; k + 1 < e.pts.length; k++) {
      const [ax, ay] = e.pts[k]; const [bx, by] = e.pts[k + 1];
      segs.push([id, k, ax, ay, bx, by, s0]); s0 += Math.hypot(bx - ax, by - ay);
    }
  });
  const buckets = new Map();
  const key = (bi, bj) => bi * 100003 + bj;
  segs.forEach((sg, q) => {
    const [, , ax, ay, bx, by] = sg;
    for (let bi = Math.floor(Math.min(ax, bx) / B); bi <= Math.floor(Math.max(ax, bx) / B); bi++)
      for (let bj = Math.floor(Math.min(ay, by) / B); bj <= Math.floor(Math.max(ay, by) / B); bj++) {
        const kk = key(bi, bj); if (!buckets.has(kk)) buckets.set(kk, []); buckets.get(kk).push(q);
      }
  });
  const anchors = (world.places ?? []).filter((p) => !NOT_ANCHORS.has(p.id) && p.kind !== 'drive');
  const placeById = new Map((world.places ?? []).map((p) => [p.id, p]));

  // the exact nearest segment: grow rings of buckets until one has a segment, then search every
  // bucket within that distance (a nearer segment can only lie there)
  function scan(x, y, bi0, bj0, r, best) {
    for (let bi = bi0 - r; bi <= bi0 + r; bi++) for (let bj = bj0 - r; bj <= bj0 + r; bj++) {
      for (const q of buckets.get(key(bi, bj)) ?? []) {
        const [id, , ax, ay, bx, by, s0] = segs[q];
        const dx = bx - ax; const dy = by - ay; const L2 = dx * dx + dy * dy || 1e-12;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
        const px = ax + t * dx; const py = ay + t * dy; const d = Math.hypot(x - px, y - py);
        if (d < best.d) Object.assign(best, { d, edge: id, s: s0 + t * Math.sqrt(L2), side: (dx * (y - ay) - dy * (x - ax)) >= 0 ? 1 : -1 });
      }
    }
  }
  function nearestSegment(x, y) {
    if (!segs.length) return null;
    const bi0 = Math.floor(x / B); const bj0 = Math.floor(y / B);
    const best = { d: Infinity };
    let r = 0;
    while (best.d === Infinity && r < 200) scan(x, y, bi0, bj0, r++, best);
    scan(x, y, bi0, bj0, Math.ceil(best.d / B) + 1, best);
    return { edge: best.edge, s: best.s, offset: best.side * best.d };
  }

  // ---- W <-> P
  function toP(x, y) {
    return nearestSegment(x, y);
  }
  function fromP({ edge, s, offset = 0 }) {
    const pts = edges[edge].pts; let acc = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay] = pts[k]; const [bx, by] = pts[k + 1]; const L = Math.hypot(bx - ax, by - ay);
      if (s <= acc + L || k + 2 === pts.length) {
        const t = L ? Math.max(0, Math.min(1, (s - acc) / L)) : 0;
        const nx = L ? -(by - ay) / L : 0; const ny = L ? (bx - ax) / L : 0; // left normal
        return [ax + t * (bx - ax) + offset * nx, ay + t * (by - ay) + offset * ny];
      }
      acc += L;
    }
    return pts[0].slice();
  }

  // ---- W <-> N
  function toN(x, y) {
    let best = null; let bestD = Infinity;
    for (const p of anchors) { const d = Math.hypot(x - p.x, y - p.y); if (d < bestD) { bestD = d; best = p; } }
    if (!best) return null;
    return { place: best.id, bearing: bearingOf(x - best.x, y - best.y), distance: bestD, within: bestD <= N_RADIUS };
  }
  function fromN({ place, bearing, distance }) {
    const p = placeById.get(place); const [ux, uy] = unitOf(bearing);
    return [p.x + ux * distance, p.y + uy * distance];
  }
  // What a person would say: "40 m NE of Azalea Pond", or "in the woods, 210 m SW of Belvedere
  // Castle" beyond N_RADIUS (with the ground cover deciding woods / open ground / path).
  function describeN(x, y) {
    const n = toN(x, y); if (!n) return 'somewhere in the park';
    const p = placeById.get(n.place); const d = Math.round(n.distance / 5) * 5;
    const rel = d < 5 ? `at ${p.name}` : `${d} m ${compass8(n.bearing)} of ${p.name}`;
    if (n.within) return rel;
    const k = world.cellOf(x, y); const c = k >= 0 ? world.cover[k] : 0;
    const where = c === 4 || c === 5 ? 'in the woods' : c === 1 || c === 2 ? 'on a path' : 'in the open';
    return `${where}, ${rel}`;
  }

  // ---- W <-> E (agent: { x, y, heading })
  function toE(agent, x, y) {
    const dx = x - agent.x; const dy = y - agent.y;
    return { bearing: wrap180(bearingOf(dx, dy) - agent.heading), distance: Math.hypot(dx, dy) };
  }
  function fromE(agent, { bearing, distance }) {
    const [ux, uy] = unitOf(agent.heading + bearing);
    return [agent.x + ux * distance, agent.y + uy * distance];
  }

  return { toP, fromP, toN, fromN, describeN, toE, fromE, anchors, nearestSegment };
}

// ---- the landmark chain: absolute points <-> offsets from the previous one (the first from an origin)
export function chainEncode(points, origin = [0, 0]) {
  const out = []; let prev = origin;
  for (const p of points) { out.push({ dE: p[0] - prev[0], dN: p[1] - prev[1] }); prev = p; }
  return out;
}
export function chainDecode(chain, origin = [0, 0]) {
  const out = []; let [x, y] = origin;
  for (const { dE, dN } of chain) { x += dE; y += dN; out.push([x, y]); }
  return out;
}
