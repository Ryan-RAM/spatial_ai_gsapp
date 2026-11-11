// Delivery drones on the drone network (streets.js).
//
// Rules of movement (our design): outside the express corridors a drone flies only above the
// Manhattan street grid, keeping to the right of the centre line: along the avenues at 100 ft,
// along the cross streets at 150 ft (so crossing streams pass 50 ft apart at intersections).
// Between the six hubs it may fly straight, in an express corridor at the corridor's level
// (250-400 ft; corridors that cross each other have different levels).
//
// What it knows at the start: its position, heading, its home hub, and the offset to each customer
// it is sent to. It learns the street-layer rule from a sign, each express corridor from that
// corridor's signs (which give its two ends and its level), the pads and the no-fly zones from
// seeing them, and congestion from the drones in its cone. Criterion: least energy per trip.

import { FT } from './config.js';
import { edgeAltitude } from './streets.js';
import { sense } from './perception.js';
import { baseAgent, beginTrip, endTrip, setGoal, moveTrail, afterSense, label } from './agents.js';
import { clamp, wrapAngle } from './geo.js';

export function makeDrone(sim, hub) {
  const c = sim.config.drone;
  const a = baseAgent(sim, 'drone', c, hub.x, hub.y, hub.z, sim.rng.range(-Math.PI, Math.PI));
  a.home = { x: hub.x, y: hub.y, z: hub.z, pad: hub.id };
  a.hub = hub;
  a.homeNode = sim.world.net.padNode.get(hub.id);
  a.node = a.homeNode;
  a.battery = c.battery;
  a.mode = 'charging';
  a.timer = sim.rng.range(0, 1200); // staggered first departures
  a.served = new Set();
  a.route = null;
  a.isBlockingHeight = () => false; // it flies above streets and in corridors, never across blocks
  a.knowledge.pads.add(hub.id);
  a.knowledge.addLandmark('home', hub.x, hub.y, hub.z, 0, { pad: hub.id });
  a.cruiseZ = () => {
    const e = a.route?.edges[a.route.k];
    return e ? edgeAltitude(sim.config, e, a.knowledge.bandRule) : edgeAltitude(sim.config, { kind: 'avenue' }, a.knowledge.bandRule);
  };
  return a;
}

// ---- planning on the network -----------------------------------------------------------------

const power = (c, v) => c.hoverPower + c.dragK * v * v;
function speedOf(sim, e) {
  const n = sim.config.droneNet;
  return e.kind === 'express' ? n.expressSpeed : e.kind === 'access' ? 4 : n.streetSpeed;
}
function edgeWh(sim, a, e) {
  const k = a.knowledge;
  if (e.kind === 'express' && !k.corridors.has(e.corridor)) return Infinity; // not known yet
  if (k.nfzEdge(e.id)) return Infinity;                                      // inside a no-fly zone it has seen
  const v = speedOf(sim, e);
  let wh = (e.len / v) * power(sim.config.drone, v) / 3600;
  const cg = k.congEdges.get(e.id);
  if (cg !== undefined && cg > sim.time) wh += sim.config.drone.congestion.penalty;
  return wh;
}

// Dijkstra / A* over the nodes; returns { nodes, edges } from `from` to `to`.
export function routeOnNet(sim, a, from, to) {
  const net = sim.world.net; const N = net.nodes.length;
  const g = new Float64Array(N).fill(Infinity), via = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const minWhPerM = power(sim.config.drone, sim.config.droneNet.expressSpeed) / sim.config.droneNet.expressSpeed / 3600;
  const T = net.nodes[to];
  const h = (n) => Math.hypot(net.nodes[n].x - T.x, net.nodes[n].y - T.y) * minWhPerM;
  const heap = [[h(from), from]]; g[from] = 0;
  const pop = () => { let bi = 0; for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[bi][0]) bi = i; const r = heap[bi]; heap[bi] = heap[heap.length - 1]; heap.pop(); return r; };
  while (heap.length) {
    const [, u] = pop();
    if (done[u]) continue; done[u] = 1;
    if (u === to) break;
    for (const eid of net.nodes[u].adj) {
      const e = net.edges[eid];
      const v = e.a === u ? e.b : e.a;
      if (done[v]) continue;
      // pads other than the start and the goal are not junctions
      if (v !== to && net.nodes[v].kind === 'pad') continue; // hubs are junctions (corridor to corridor, corridor to streets), plain pads are not
      const w = edgeWh(sim, a, e);
      if (!(w < Infinity)) continue;
      if (g[u] + w < g[v]) { g[v] = g[u] + w; via[v] = eid; heap.push([g[v] + h(v), v]); }
    }
    if (heap.length > 20000) heap.sort((p, q) => p[0] - q[0]).length = 8000;
  }
  if (!done[to]) return null;
  const edges = [], nodes = [to];
  for (let n = to; n !== from;) { const e = net.edges[via[n]]; edges.push(e); n = e.a === n ? e.b : e.a; nodes.push(n); }
  edges.reverse(); nodes.reverse();
  return { nodes, edges, wh: g[to] };
}

function startRoute(sim, a, toNode) {
  const r = routeOnNet(sim, a, a.node, toNode);
  a.needPlan = false; a.lastPlan = sim.time;
  if (a.trip) a.trip.replans++;
  if (!r) { a.route = null; return false; }
  a.route = { ...r, k: 0, to: toNode };
  a.edgeStartT = sim.time;
  if (a.trip && r.edges.some((e) => e.kind === 'express')) a.trip.express = true;
  return true;
}

// Re-plan from the end of the edge it is on (it does not turn round in mid-street).
function replanAhead(sim, a) {
  const R = a.route; if (!R) return;
  const e = R.edges[R.k]; const next = R.nodes[R.k + 1];
  if (next === R.to) { a.needPlan = false; return; }
  const r = routeOnNet(sim, a, next, R.to);
  a.needPlan = false; a.lastPlan = sim.time;
  if (a.trip) a.trip.replans++;
  if (!r) return;
  a.route = { nodes: [R.nodes[R.k], ...r.nodes], edges: [e, ...r.edges], k: 0, to: R.to, wh: r.wh };
  if (a.trip && r.edges.some((x) => x.kind === 'express')) a.trip.express = true;
}

// Target point of the current edge: its end node, moved to the right of the direction of travel.
function edgeTarget(sim, a) {
  const net = sim.world.net; const R = a.route;
  const p = net.nodes[R.nodes[R.k]], q = net.nodes[R.nodes[R.k + 1]];
  const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1;
  const off = sim.config.droneNet.keepRight; // on streets, hub links and corridors alike
  const ox = (dy / L) * off, oy = -(dx / L) * off;
  return [q.x + ox, q.y + oy, q, p.x + ox, p.y + oy];
}

// Steer along the right-hand lane line (p' -> q'), aiming 25 m ahead of the closest point on it,
// so opposite directions keep their lanes for the whole edge.
function laneAim(a, px, py, qx, qy) {
  const dx = qx - px, dy = qy - py, L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((a.x - px) * dx + (a.y - py) * dy) / L2));
  const L = Math.sqrt(L2); const t2 = Math.min(1, t + 25 / L);
  return [px + dx * t2, py + dy * t2];
}

// ---- see-and-avoid on the network -----------------------------------------------------------
// A drone cannot swerve off its street: it follows (slows behind a drone ahead in its layer),
// keeps right for oncoming traffic, and drops 10 m for any helicopter it sees (14 CFR 107.37).
function followSpeed(a, want) {
  let v = want, dz = 0, yielded = false;
  const hx = Math.cos(a.heading), hy = Math.sin(a.heading);
  for (const o of a.visible) {
    const px = o.x - a.x, py = o.y - a.y, d = Math.hypot(px, py);
    if (o.type !== 'drone') { if (d < 450 && Math.abs(o.z - a.z) < 120) { dz = -10; yielded = true; } continue; }
    if (Math.abs(o.z - a.z) > a.spec.separation.vertical) continue;
    const ahead = (px * hx + py * hy) / (d || 1);
    const lateral = Math.abs(px * hy - py * hx);
    const same = o.speed > 0.5 && (o.vx * hx + o.vy * hy) / o.speed > 0.5; // only queue behind traffic going its way
    if (same && d > 1 && ahead > 0.6 && lateral < 6 && d < 40) { v = Math.min(v, Math.max(0, (d - 14) * 0.6)); yielded = true; }
  }
  return { v, dz, yielded };
}

function checkCongestion(sim, a) {
  const cg = a.spec.congestion; const k = a.knowledge;
  const near = a.visible.filter((o) => o.type === 'drone' && Math.hypot(o.x - a.x, o.y - a.y) < cg.radius && Math.abs(o.z - a.z) < 30);
  if (near.length < cg.count) return 0;
  const until = sim.time + cg.memory;
  for (const o of near) { const e = o.route?.edges[o.route.k]; if (e && e.kind !== 'access') k.congEdges.set(e.id, until); }
  const mx = near.reduce((s, o) => s + o.x, a.x) / (near.length + 1), my = near.reduce((s, o) => s + o.y, a.y) / (near.length + 1);
  const lm = k.addLandmark('congestion', mx, my, a.z, sim.time, { count: near.length + 1 }, 150);
  sim.noteCongestion(a, mx, my, a.z, near.length + 1, !!lm);
  if (sim.time > a.congestedUntil) { a.needPlan = true; a.totals.congestion++; }
  a.congestedUntil = sim.time + 10;
  return near.length;
}

function nearestKnownPad(sim, a) {
  let best = null, bd = Infinity;
  for (const id of a.knowledge.pads) { const p = sim.world.pads[id]; const d = Math.hypot(p.x - a.x, p.y - a.y); if (d < bd) { bd = d; best = p; } }
  return best;
}

function ruleCheck(sim, a, dt) {
  if (!a.airborne) return;
  const w = sim.world;
  if (w.inNoFly('drone', a.x, a.y, a.z)) { a.totals.nfz += dt; if (a.trip) a.trip.nfz += dt; }
  const e = a.route?.edges[a.route.k];
  if ((a.mode === 'cruise' || a.mode === 'return' || a.mode === 'divert') && e && e.kind !== 'access' && sim.time - a.edgeStartT > 6) {
    const want = edgeAltitude(sim.config, e, true);
    if (Math.abs(a.z - want) > sim.config.bands.drone.tolerance * FT) { a.totals.band += dt; if (a.trip) a.trip.band += dt; }
  }
}

// ---- one tick -----------------------------------------------------------------------------------

export function updateDrone(sim, a, dt, doSense) {
  const c = a.spec; const cfg = sim.config; const net = sim.world.net; const k = a.knowledge;
  if (doSense && a.active) {
    const ev = sense(a, sim);
    afterSense(sim, a, ev);
    for (const l of ev.learned) if (l.kind === 'corridor') {
      const cor = l.corridor;
      k.addLandmark('lane-entry', l.at.x, l.at.y, cor.z, sim.time, { corridor: cor.name, levelFt: cor.levelFt, sign: true }, 200);
      a.needPlan = true;
      sim.noteEvent(a, 'corridor', `${label(a)} found the express corridor ${cor.name} (${cor.levelFt} ft)`);
    }
  }
  let target = null, hSpeed = 0, targetZ = a.z;

  switch (a.mode) {
    case 'charging': {
      a.airborne = false; a.battery = Math.min(c.battery, a.battery + (c.battery / c.rechargeTime) * dt * 0.5);
      a.timer -= dt;
      if (a.timer > 0 || a.battery < c.battery * 0.95) break;
      if (a.resumeGoal) { setGoal(sim, a, a.resumeGoal); a.resumeGoal = null; }
      else {
        const cust = sim.pickCustomer(a);
        beginTrip(sim, a, 'delivery');
        setGoal(sim, a, { x: cust.x, y: cust.y, z: 0, node: cust.node, customer: cust });
      }
      if (a.node === a.goal.node) { // already there (it diverted to its own hub): the trip ends here
        if (a.goal.home && a.trip) endTrip(sim, a, true);
        a.timer = 5; break;
      }
      if (!startRoute(sim, a, a.goal.node) || !a.route.edges.length) { a.timer = 30; break; }
      a.mode = 'takeoff';
      break;
    }
    case 'takeoff': {
      a.airborne = true;
      const pad = sim.world.pads[net.nodes[a.node].pad];
      if (pad && !sim.holdsSlot(pad, a) && !sim.requestSlot(pad, a)) { a.totals.waits += dt; if (a.trip) a.trip.waits += dt; break; }
      a.slotHeld = !!pad;
      if (pad) { const [sx, sy] = sim.slotSpot(pad, a); target = [sx, sy]; hSpeed = 2; }
      targetZ = a.cruiseZ();
      if (Math.abs(a.z - targetZ) < 3) {
        if (pad) sim.releaseSlot(pad, a); a.slotHeld = false;
        a.mode = a.goal.customer ? 'cruise' : a.goal.home ? 'return' : 'divert';
        a.edgeStartT = sim.time;
        const e = a.route.edges[0];
        if (e.kind === 'express') enterCorridor(sim, a, e);
      }
      break;
    }
    case 'cruise': case 'return': case 'divert': {
      a.airborne = true;
      if (a.needPlan && sim.planBudget > 0) { sim.planBudget--; replanAhead(sim, a); }
      const R = a.route;
      if (!R) { a.mode = 'charging'; break; }
      const e = R.edges[R.k];
      targetZ = edgeAltitude(cfg, e, k.bandRule);
      const [tx, ty, endNode, sx0, sy0] = edgeTarget(sim, a);
      target = laneAim(a, sx0, sy0, tx, ty);
      const dzNeed = Math.abs(a.z - targetZ);
      hSpeed = dzNeed > 6 ? (e.kind === 'express' ? 0 : 3) : speedOf(sim, e); // level off first
      const dist = Math.hypot(tx - a.x, ty - a.y);
      if (dist < Math.max(2.5, hSpeed * dt * 1.2)) { // reached the end of this edge
        a.x = tx; a.y = ty;
        if (e.kind === 'express') exitCorridor(sim, a, e);
        a.node = endNode.id;
        if (R.k + 1 >= R.edges.length) { arrive(sim, a); break; }
        R.k++; a.edgeStartT = sim.time;
        const n = R.edges[R.k];
        if (n.kind === 'express') enterCorridor(sim, a, n);
        const zn = edgeAltitude(cfg, n, k.bandRule);
        if (k.bandRule && Math.abs(zn - edgeAltitude(cfg, e, true)) > 20) k.addLandmark('band-switch', a.x, a.y, a.z, sim.time, { from: Math.round(a.z / FT), to: Math.round(zn / FT), reason: n.kind === 'express' ? 'up into a corridor' : e.kind === 'express' ? 'down to the streets' : 'street layer' }, 80);
        break;
      }
      // a crowd in its cone: it marks those streets as costly and re-plans round them, and slows down
      // while it is in the crowd (it cannot stop for long: that would only grow the jam)
      if (e.kind !== 'access' && checkCongestion(sim, a) >= c.congestion.holdCount - 1) hSpeed *= 0.6;
      // low battery: go to the nearest pad it knows
      if (a.mode !== 'divert' && a.battery < c.battery * c.reserve) {
        const pad = nearestKnownPad(sim, a);
        if (pad) {
          a.resumeGoal = a.goal; a.totals.emergencies++; if (a.trip) a.trip.emergency = true;
          setGoal(sim, a, { x: pad.x, y: pad.y, z: pad.z, node: net.padNode.get(pad.id), pad: pad.id });
          a.route.to = a.goal.node; a.needPlan = true; a.mode = 'divert';
          sim.noteEvent(a, 'emergency', `${label(a)} is low on battery and diverts to a pad it saw earlier`);
        }
      }
      break;
    }
    case 'drop': {
      targetZ = 10; // lowered to 10 m over the street
      if (Math.abs(a.z - targetZ) < 2) {
        a.timer -= dt;
        if (a.timer <= 0) {
          const g = a.goal;
          if (!a.served.has(g.customer.id)) k.addLandmark('customer', g.x, g.y, 10, sim.time, { customer: g.customer.id }, 30);
          a.served.add(g.customer.id);
          setGoal(sim, a, { x: a.home.x, y: a.home.y, z: a.home.z, node: a.homeNode, home: true, pad: a.home.pad });
          if (!startRoute(sim, a, a.homeNode)) { a.mode = 'drop'; a.timer = 5; break; }
          a.mode = 'climb';
        }
      }
      break;
    }
    case 'climb': {
      targetZ = a.cruiseZ();
      if (Math.abs(a.z - targetZ) < 3) { a.mode = 'return'; a.edgeStartT = sim.time; }
      break;
    }
    case 'landing': {
      const pad = sim.world.pads[a.goal.pad];
      const low = a.battery < c.battery * c.reserve * 0.7;
      if (!sim.holdsSlot(pad, a) && !sim.requestSlot(pad, a, low)) { // wait on a ring round the pad
        const th = a.id * 2.39996, Rr = 45 + (a.id % 3) * 20;
        target = [pad.x + Math.cos(th) * Rr, pad.y + Math.sin(th) * Rr]; hSpeed = 4;
        targetZ = (cfg.droneNet.streetFt + 20 * (a.id % 3)) * FT;
        a.totals.waits += dt; if (a.trip) a.trip.waits += dt;
        if (sim.time > a.holdUntil) { k.addLandmark('hold', a.x, a.y, a.z, sim.time, { pad: pad.id }, 100); a.holdUntil = sim.time + 20; }
        break;
      }
      a.slotHeld = true;
      const [sx, sy] = sim.slotSpot(pad, a);
      target = [sx, sy]; hSpeed = Math.min(4, Math.hypot(sx - a.x, sy - a.y));
      targetZ = Math.hypot(sx - a.x, sy - a.y) < 3 ? pad.z : Math.max(pad.z + 8, a.z);
      if (a.z - pad.z < 0.6 && Math.hypot(sx - a.x, sy - a.y) < 2) {
        sim.releaseSlot(pad, a); a.slotHeld = false;
        Object.assign(a, { x: sx, y: sy, z: pad.z, airborne: false, speed: 0, vx: 0, vy: 0, vz: 0, node: net.padNode.get(pad.id) });
        a.route = null;
        if (a.goal.home) { endTrip(sim, a, true); a.mode = 'charging'; a.timer = c.rechargeTime; }
        else { if (a.trip) a.trip.charged = (a.trip.charged || 0) + (c.battery - a.battery); a.mode = 'charging'; a.timer = c.rechargeTime * 2; }
      }
      break;
    }
    case 'recover': {
      a.timer -= dt;
      if (a.timer <= 0) Object.assign(a, { x: a.home.x, y: a.home.y, z: a.home.z, battery: c.battery, active: true, mode: 'charging', timer: c.rechargeTime, node: a.homeNode, route: null });
      return;
    }
    default: break;
  }
  if (!a.active) return;

  // ---- motion: along the target, speed limited by traffic ahead ----
  const f = a.airborne ? followSpeed(a, hSpeed) : { v: 0, dz: 0, yielded: false };
  if (f.yielded && sim.time > a.yieldUntil) { a.totals.yields++; a.yieldUntil = sim.time + 5; if (a.trip) a.trip.yields++; }
  let vx = 0, vy = 0;
  if (target) {
    const dx = target[0] - a.x, dy = target[1] - a.y, d = Math.hypot(dx, dy);
    if (d > 0.01) { const v = Math.min(f.v, d / dt); vx = (dx / d) * v; vy = (dy / d) * v; }
  }
  const kk = Math.min(1, dt * 2);
  a.vx += (vx - a.vx) * kk; a.vy += (vy - a.vy) * kk;
  a.vz = clamp((targetZ + f.dz - a.z) * 0.8, -c.descentRate, c.climbRate);
  a.speed = Math.hypot(a.vx, a.vy);
  if (a.speed > 0.5) a.heading = Math.atan2(a.vy, a.vx);
  else if (target) a.heading += clamp(wrapAngle(Math.atan2(target[1] - a.y, target[0] - a.x) - a.heading), -1.2 * dt, 1.2 * dt);
  a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
  a.altTarget = targetZ;
  if (a.airborne) {
    const P = power(c, a.speed) + Math.max(0, c.mass * 9.81 * a.vz) / c.climbEff;
    const e = (P * dt) / 3600;
    a.battery -= e; a.totals.energy += e;
    if (a.battery <= 0) {
      a.battery = 0; a.totals.forced++;
      sim.noteEvent(a, 'forced', `${label(a)} ran out of battery and made a forced landing`);
      k.addLandmark('landing-site', a.x, a.y, 0, sim.time, { forced: true }, 50);
      endTrip(sim, a, false);
      Object.assign(a, { active: false, airborne: false, mode: 'recover', timer: 300, resumeGoal: null, route: null });
      return;
    }
  }
  moveTrail(sim, a, a.speed * dt);
  ruleCheck(sim, a, dt);
}

function arrive(sim, a) {
  const g = a.goal;
  if (g.customer) { a.mode = 'drop'; a.timer = a.spec.deliverHold; return; }
  a.mode = 'landing';
}

function enterCorridor(sim, a, e) {
  const cor = sim.world.net.corridors[e.corridor];
  a.knowledge.addLandmark('lane-entry', a.x, a.y, cor.z, sim.time, { corridor: cor.name, levelFt: cor.levelFt }, 120);
}
function exitCorridor(sim, a, e) {
  const cor = sim.world.net.corridors[e.corridor];
  a.knowledge.addLandmark('lane-exit', a.x, a.y, cor.z, sim.time, { corridor: cor.name, levelFt: cor.levelFt }, 120);
}
