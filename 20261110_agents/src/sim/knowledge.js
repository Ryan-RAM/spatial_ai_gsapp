// One agent's spatial knowledge: what it has seen of the city, of the rule layer and of other
// agents, plus its landmarks. This is the map that the "agent knowledge" view draws.
//
// Landmarks are stored the way each agent type would remember them:
//   drones       - relative to home (an odometry offset dx, dy, dz) and along the route
//                  ("820 m into trip 3"), like a breadcrumb trail;
//   helicopters  - relative to a visual reference they have seen ("700 m south-east of the
//                  Empire State Building", "over the Hudson").
// The true position is kept too, but only for drawing and for the collective heat maps.

import { bearingDeg } from './geo.js';

export const K = { SEEN: 1, LAND: 2, LANE: 4, NFZ: 8 };
export const LANDMARK_TYPES = ['lane-entry', 'lane-exit', 'band-switch', 'landing-site', 'congestion', 'nfz-edge', 'home', 'customer', 'hold'];

export function makeKnowledge(world, agent) {
  const N = world.N;
  const k = {
    flags: new Uint8Array(N),
    height: new Uint8Array(N),     // known top of the tallest thing in the cell, 2 m steps (0 = none seen)
    congestion: new Map(),         // cell -> time until which it is avoided
    lanes: new Set(),              // lane gate ids seen
    noFly: new Set(),              // no-fly zone ids seen
    heliports: new Set(), pads: new Set(), refs: new Set(),
    bandRule: false,               // has it seen a band sign?
    agents: new Map(),             // id -> { x, y, z, t, type } last sighting
    landmarks: [],
    routes: new Map(),             // drone: customer key -> breadcrumbs relative to home
    seenCount: 0,
  };
  k.knownHeight = (c) => k.height[c] * 2;
  k.see = (c, top, isLand) => {
    if (!(k.flags[c] & K.SEEN)) { k.flags[c] |= K.SEEN; k.seenCount++; }
    if (isLand) k.flags[c] |= K.LAND;
    const q = Math.min(255, Math.ceil(top / 2));
    if (q > k.height[c]) k.height[c] = q;
  };
  k.learnLaneNode = (node) => {
    if (k.lanes.has(node.id)) return false;
    k.lanes.add(node.id);
    for (const c of node.cells) k.flags[c] |= K.LANE;
    return true;
  };
  k.learnNoFly = (z) => {
    if (k.noFly.has(z.id)) return false;
    k.noFly.add(z.id);
    for (const c of z.cells) k.flags[c] |= K.NFZ;
    return true;
  };

  // Record a landmark. Similar landmarks of the same type closer than `merge` m are merged
  // (the count goes up instead), so a hold or a jam does not leave hundreds of copies.
  k.addLandmark = (type, x, y, z, t, info = {}, merge = 120) => {
    for (const lm of k.landmarks) {
      if (lm.type === type && Math.hypot(lm.x - x, lm.y - y) < merge) { lm.count++; lm.lastT = t; return null; }
    }
    const lm = { id: k.landmarks.length, type, x, y, z, t, lastT: t, count: 1, agent: agent.id, agentType: agent.type, info, rep: representation(world, agent, x, y, z) };
    k.landmarks.push(lm);
    return lm;
  };
  return k;
}

function representation(world, agent, x, y, z) {
  if (agent.type === 'drone') {
    return { frame: 'home', dx: x - agent.home.x, dy: y - agent.home.y, dz: z - agent.home.z, trip: agent.tripNo, along: Math.round(agent.trip?.dist ?? 0) };
  }
  // Helicopters: the nearest visual reference this crew has already seen.
  let best = null, bd = Infinity;
  for (const id of agent.knowledge.refs) {
    const r = world.refs[id]; const d = Math.hypot(r.x - x, r.y - y);
    if (d < bd) { bd = d; best = r; }
  }
  if (!best) return { frame: 'start', dx: x - agent.start.x, dy: y - agent.start.y };
  return { frame: 'ref', ref: best.id, refName: best.name, refKind: best.kind, dist: Math.round(bd), bearing: Math.round(bearingDeg(x - best.x, y - best.y)) };
}

// A readable sentence for a landmark, as the agent would say it.
export function describeLandmark(world, lm) {
  const r = lm.rep;
  const what = lm.type.replace('-', ' ');
  if (r.frame === 'home') {
    const d = Math.hypot(r.dx, r.dy);
    return `${what}: ${Math.round(d)} m at ${String(Math.round(bearingDeg(r.dx, r.dy))).padStart(3, '0')}° from home, ${r.along} m into trip ${r.trip}`;
  }
  if (r.frame === 'ref') {
    if (r.dist < 250) return `${what}: at ${r.refName}`;
    return `${what}: ${r.dist} m ${compass(r.bearing)} of ${r.refName}`;
  }
  return `${what}: ${Math.round(Math.hypot(r.dx, r.dy))} m from where it started`;
}

const compass = (b) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(b / 45) % 8];
