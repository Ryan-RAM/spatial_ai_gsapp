// The drone network: the Manhattan street grid (drones fly above the street centre lines) and
// straight express corridors between the six hubs, higher up. Where two corridors cross they get
// different altitude levels (greedy colouring of the crossing graph), so crossing traffic is
// separated vertically.
//
// Grid geometry (also used by placeholder.js to place the blocks): the 1811 grid north of a line
// round Houston / 14th St, avenues at bearing 29°, 262 m apart, cross streets 80.5 m apart; a finer,
// less rotated grid below it.

import { FT } from './config.js';
import { pointInPoly, closestOnSegment } from './geo.js';

const D2R = Math.PI / 180;

export function gridFrames(config, frame) {
  const g = config.droneNet.grid;
  const mk = (q) => {
    const [ox, oy] = frame.toXY(q.origin[0], q.origin[1]);
    const th = q.bearing * D2R;
    const U = [Math.sin(th), Math.cos(th)]; // along the avenues
    const V = [Math.cos(th), -Math.sin(th)]; // along the cross streets
    return { ...q, ox, oy, U, V, at: (u, v) => [ox + U[0] * u + V[0] * v, oy + U[1] * u + V[1] * v] };
  };
  const up = mk(g.uptown), down = mk(g.downtown);
  const [hx, hy] = frame.toXY(g.boundary[0], g.boundary[1]);
  const isUptown = (x, y) => (y - hy) + g.boundarySlope * (x - hx) > 0;
  // Central Park in uptown grid coordinates (u along avenues, v along streets)
  const park = (u, v) => u > g.park.fromStreet * up.street && u < g.park.toStreet * up.street && v < 0 && v > g.park.westV;
  return { up, down, isUptown, park };
}

// Express corridors between hubs and their levels. Pure geometry: needs only the config.
export function corridors(config, frame) {
  const net = config.droneNet;
  const hubs = net.hubs.map((h, i) => { const [x, y] = frame.toXY(h.lat, h.lon); return { ...h, index: i, x, y }; });
  const zones = config.noFly.filter((z) => z.applies.includes('drone')).map((z) => { const [x, y] = frame.toXY(z.lat, z.lon); return { ...z, x, y }; });
  const out = [];
  for (let a = 0; a < hubs.length; a++) for (let b = a + 1; b < hubs.length; b++) {
    const A = hubs[a], B = hubs[b];
    const blockedBy = zones.find((z) => { const [qx, qy] = closestOnSegment(z.x, z.y, A.x, A.y, B.x, B.y); return Math.hypot(qx - z.x, qy - z.y) < z.radius + 40; });
    if (blockedBy) { out.push({ a, b, skipped: blockedBy.name }); continue; }
    out.push({ a, b, x1: A.x, y1: A.y, x2: B.x, y2: B.y, len: Math.hypot(B.x - A.x, B.y - A.y) });
  }
  const live = out.filter((c) => !c.skipped);
  // crossing graph
  const cross = live.map(() => new Set());
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const p = live[i], q = live[j];
    if (p.a === q.a || p.a === q.b || p.b === q.a || p.b === q.b) continue; // they meet at a hub, not in the air
    if (segmentsCross(p.x1, p.y1, p.x2, p.y2, q.x1, q.y1, q.x2, q.y2)) { cross[i].add(j); cross[j].add(i); }
  }
  // greedy colouring, most-crossed first; a corridor's level differs from every corridor it crosses
  const order = live.map((_, i) => i).sort((i, j) => cross[j].size - cross[i].size || live[j].len - live[i].len);
  const levels = net.expressLevelsFt;
  for (const i of order) {
    const used = new Set([...cross[i]].map((j) => live[j].level).filter((v) => v !== undefined));
    const free = levels.findIndex((_, k) => !used.has(k));
    live[i].level = free >= 0 ? free : levels.length - 1;
    live[i].unresolved = free < 0;
  }
  live.forEach((c, id) => { c.id = id; c.levelFt = levels[c.level]; c.z = c.levelFt * FT; c.crosses = [...cross[id]]; c.name = `${hubs[c.a].name} – ${hubs[c.b].name}`; });
  return { hubs, corridors: live, skipped: out.filter((c) => c.skipped) };
}

function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) < 0 && o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) < 0;
}

// The full network: street nodes and edges, hub nodes, access links, express edges.
export function buildDroneNet(world) {
  const { config, frame } = world;
  const net = config.droneNet;
  const G = gridFrames(config, frame);
  const manhattan = world.landPolys.filter((l) => /manhattan/i.test(l.name));
  const onLand = (x, y) => manhattan.some((l) => pointInPoly(x, y, l.p));
  const nodes = [], edges = [], key = new Map();
  const addNode = (x, y, kind, extra = {}) => { const n = { id: nodes.length, x, y, kind, adj: [], ...extra }; nodes.push(n); return n; };
  const addEdge = (a, b, kind, extra = {}) => {
    const len = Math.hypot(nodes[b].x - nodes[a].x, nodes[b].y - nodes[a].y);
    const e = { id: edges.length, a, b, kind, len, ...extra };
    edges.push(e); nodes[a].adj.push(e.id); nodes[b].adj.push(e.id);
    return e;
  };
  const R = 9000;
  for (const [gname, q] of [['up', G.up], ['down', G.down]]) {
    const ni = Math.ceil(R / q.street), nj = Math.ceil(R / q.avenue);
    const inside = (x, y) => onLand(x, y) && (gname === 'up' ? G.isUptown(x, y) : !G.isUptown(x, y)) && x > 0 && y > 0 && x < frame.width && y < frame.height;
    for (let i = -ni; i <= ni; i++) for (let j = -nj; j <= nj; j++) {
      const [x, y] = q.at(i * q.street, j * q.avenue);
      if (!inside(x, y)) continue;
      key.set(`${gname}:${i}:${j}`, addNode(x, y, 'street', { grid: gname, i, j }).id);
    }
    for (let i = -ni; i <= ni; i++) for (let j = -nj; j <= nj; j++) {
      const a = key.get(`${gname}:${i}:${j}`); if (a === undefined) continue;
      for (const [di, dj, kind] of [[1, 0, 'avenue'], [0, 1, 'street']]) {
        const b = key.get(`${gname}:${i + di}:${j + dj}`); if (b === undefined) continue;
        const mx = (nodes[a].x + nodes[b].x) / 2, my = (nodes[a].y + nodes[b].y) / 2;
        if (!onLand(mx, my)) continue;
        if (gname === 'up') { // no streets across Central Park except the transverse roads
          const u = (i + di / 2) * q.street, v = (j + dj / 2) * q.avenue;
          if (G.park(u, v) && !(kind === 'street' && net.grid.park.transverses.includes(i))) continue;
        }
        addEdge(a, b, kind);
      }
    }
  }
  // stitch the two grids together where they meet
  const ups = nodes.filter((n) => n.grid === 'up'), downs = nodes.filter((n) => n.grid === 'down');
  for (const d of downs) {
    let best = null, bd = 170;
    for (const u of ups) { const dd = Math.hypot(u.x - d.x, u.y - d.y); if (dd < bd) { bd = dd; best = u; } }
    if (best) addEdge(d.id, best.id, 'link');
  }
  // hubs (and other pads) connect to their two nearest street nodes
  const streetNodes = nodes.slice();
  const nearest = (x, y, k) => streetNodes.map((n) => [Math.hypot(n.x - x, n.y - y), n.id]).sort((p, q) => p[0] - q[0]).slice(0, k).map((p) => p[1]);
  const padNode = new Map();
  for (const pad of world.pads) {
    const n = addNode(pad.x, pad.y, pad.hub ? 'hub' : 'pad', { pad: pad.id });
    for (const s of nearest(pad.x, pad.y, 2)) addEdge(n.id, s, 'access');
    padNode.set(pad.id, n.id);
  }
  // express corridors between hubs
  const cor = corridors(config, frame);
  for (const c of cor.corridors) {
    const a = padNode.get(c.a), b = padNode.get(c.b); // the hubs are pads 0-5
    c.edge = addEdge(a, b, 'express', { corridor: c.id, z: c.z }).id;
  }
  // street edges are seen through the cell of their midpoint
  const cellEdges = new Map();
  for (const e of edges) {
    if (e.kind === 'express') continue;
    const c = world.cellOf((nodes[e.a].x + nodes[e.b].x) / 2, (nodes[e.a].y + nodes[e.b].y) / 2);
    if (c < 0) continue;
    let arr = cellEdges.get(c); if (!arr) cellEdges.set(c, (arr = [])); arr.push(e.id);
  }
  const nearestStreetNode = (x, y) => nearest(x, y, 1)[0];
  return { nodes, edges, corridors: cor.corridors, skipped: cor.skipped, padNode, cellEdges, nearestStreetNode, streetCount: streetNodes.length };
}

// Altitude (m) an edge is flown at, for an agent that knows (or not) the street-layer rule.
export function edgeAltitude(config, e, knowsRule) {
  if (e.kind === 'express') return e.z;
  const L = config.droneNet;
  if (!knowsRule) return config.drone.naiveAltitudeFt * FT;
  return (e.kind === 'avenue' ? L.avenueFt : L.streetFt) * FT;
}
