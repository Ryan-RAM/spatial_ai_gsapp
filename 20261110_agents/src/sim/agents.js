// The two kinds of agent.
//
//   Delivery drone  - small, slow, short battery, small vision cone. Goal: carry a package from its
//                     hub to a customer and come back. Criterion: least energy. Keeps to its
//                     altitude band once it has seen a band sign. Remembers landmarks relative to
//                     home and as breadcrumb routes.
//   Helicopter      - big, fast, wide turns, wide vision cone. Tour flights fly a sightseeing
//                     circuit, medical flights come in to a heliport. Criterion: least time while
//                     keeping separation. Prefers the river lanes once it has seen them; medical
//                     flights have priority in conflicts. Remembers landmarks against visual
//                     references (towers, bridges, the river).
//
// Nobody starts with a map: each agent knows only where it is, which way it faces, and the
// offset to its goal (a heliport's offset is only approximate). Everything else (buildings, the
// lanes, the bands, the no-fly zones, the pads) comes through its vision cone.

import { FT } from './config.js';
import { makeKnowledge, K } from './knowledge.js';
import { sense } from './perception.js';
import { aStar, smoothPath, cellsOnSegment } from './planner.js';
import { TYPE_BIT, bandAltitudes, droneBandFor } from './world.js';
import { wrapAngle, clamp, bearingDeg, closestOnSegment } from './geo.js';

let nextId = 0;
export function resetIds() { nextId = 0; }

function baseAgent(sim, type, spec, x, y, z, heading) {
  const a = {
    id: nextId++, type, spec, x, y, z, heading, speed: 0, vx: 0, vy: 0, vz: 0, active: true,
    mode: 'idle', timer: 0, plan: null, planCells: new Set(), needPlan: true, lastPlan: -1e9,
    goal: null, visible: [], tripNo: 0, trip: null, trail: [], lastTrail: null, start: { x, y, z },
    laneNow: -1, altTarget: z, yieldUntil: 0, holdUntil: 0, congestedUntil: 0, sublayer: 0,
    totals: { dist: 0, energy: 0, trips: 0, nfz: 0, band: 0, wrongWay: 0, waits: 0, emergencies: 0, forced: 0, strikes: 0, yields: 0, congestion: 0, reuse: 0 },
  };
  a.knowledge = makeKnowledge(sim.world, a);
  return a;
}

// ---------------------------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------------------------

export function makeDrone(sim, hub) {
  const c = sim.config.drone;
  const a = baseAgent(sim, 'drone', c, hub.x, hub.y, hub.z, sim.rng.range(-Math.PI, Math.PI));
  a.home = { x: hub.x, y: hub.y, z: hub.z, pad: hub.id };
  a.hub = hub;
  a.battery = c.battery;
  a.mode = 'charging';
  a.timer = sim.rng.range(0, 1200); // staggered first departures
  a.served = new Set();
  a.isBlockingHeight = (top) => top > a.cruiseZ() - c.clearance;
  a.knowledge.pads.add(hub.id);
  a.knowledge.addLandmark('home', hub.x, hub.y, hub.z, 0, { pad: hub.id });
  return a;
}

export function makeHeli(sim, kind, opts) {
  const c = sim.config.heli;
  const spec = { ...c, ...c[kind], kind };
  const a = baseAgent(sim, kind, spec, opts.x, opts.y, opts.z, opts.heading ?? 0);
  a.isBlockingHeight = (top) => top > a.cruiseZ() - c.clearance;
  a.dispatchError = new Map(); // heliport id -> fixed error vector of the dispatch position
  if (kind === 'tour') {
    a.base = opts.base; a.mode = 'parked'; a.timer = sim.rng.range(0, 600);
    a.knowledge.heliports.add(opts.base.index); // it starts on its base: it knows it
  } else {
    a.mode = 'offsite'; a.timer = sim.rng.range(0, 900); a.active = false;
  }
  return a;
}

// ---------------------------------------------------------------------------------------------
// Altitudes
// ---------------------------------------------------------------------------------------------

function courseOf(a) { return a.goal ? bearingDeg(a.goal.x - a.tripOrigin.x, a.goal.y - a.tripOrigin.y) : 0; }

export function cruiseZFor(sim, a) {
  const cfg = sim.config;
  if (a.type === 'drone') {
    if (!a.knowledge.bandRule) return cfg.drone.naiveAltitudeFt * FT;
    return droneBandFor(cfg, courseOf(a));
  }
  if (!a.knowledge.bandRule) return cfg.heli.naiveAltitudeFt * FT;
  const b = bandAltitudes(cfg, a.type);
  return clamp(b.cruise + a.sublayer * b.step, b.floor + 15, b.ceiling - 15);
}

// ---------------------------------------------------------------------------------------------
// Planning on the agent's own knowledge
// ---------------------------------------------------------------------------------------------

function costFn(sim, a) {
  const w = sim.world; const k = a.knowledge; const cfg = sim.config;
  const zc = a.cruiseZ();
  const bit = TYPE_BIT[a.type];
  const clearance = a.spec.clearance;
  const now = sim.time;
  const isHeli = a.type !== 'drone';
  const goalCell = a.goal ? w.cellOf(a.goal.x, a.goal.y) : -1;
  const startCell = w.cellOf(a.x, a.y);
  const blocked = (c) => {
    if (c === goalCell || c === startCell) return false;
    if ((k.flags[c] & K.NFZ) && (w.nfzMask[c] & bit)) return true;
    if (k.knownHeight(c) > zc - clearance) return true;
    if (isHeli) { // a helicopter keeps one cell of room round anything too tall (wide turns)
      const W = w.W;
      for (const d of [1, -1, W, -W]) { const n = c + d; if (n >= 0 && n < w.N && k.knownHeight(n) > zc - clearance) return true; }
    }
    return false;
  };
  const cellCost = (c, ux, uy) => {
    if (blocked(c)) return Infinity;
    let m = 1;
    if (isHeli) {
      if (k.flags[c] & K.LANE) {
        const dot = ux * w.laneDirX[c] + uy * w.laneDirY[c];
        if (dot < -0.25) return Infinity;            // known lane, wrong way
        m = dot > 0.5 ? cfg.heli.laneCost : 1;
      } else if (k.flags[c] & K.SEEN) m = (k.flags[c] & K.LAND) ? cfg.heli.landCost : 1;
    }
    const cg = k.congestion.get(c);
    if (cg !== undefined && cg > now) m += a.spec.congestion.penalty;
    return m;
  };
  const moveCost = (from, to, di, dj) => {
    const len = Math.hypot(di, dj);
    return cellCost(to, di / len, dj / len);
  };
  return { cellCost, moveCost, minCost: isHeli ? cfg.heli.laneCost : 1 };
}

function plan(sim, a) {
  const w = sim.world;
  a.needPlan = false; a.lastPlan = sim.time;
  if (!a.goal) { a.plan = null; return; }
  const { cellCost, moveCost, minCost } = costFn(sim, a);
  let pts = null;
  // Drones: try a remembered breadcrumb route first (landmark reuse).
  const key = a.type === 'drone' ? routeKey(a) : null;
  if (key && a.knowledge.routes.has(key)) {
    const crumbs = a.knowledge.routes.get(key).map(([dx, dy]) => [a.home.x + dx, a.home.y + dy]);
    if (routeClear(w, crumbs, cellCost)) { pts = crumbs; a.totals.reuse++; if (a.trip) a.trip.reuse = true; }
  }
  if (!pts) {
    const res = aStar(w, w.cellOf(a.x, a.y), w.cellOf(a.goal.x, a.goal.y), moveCost, { minCost });
    if (res) pts = a.rawPlan ? res.cells.map((c) => [w.cx(c), w.cy(c)]) : smoothPath(w, res.cells, cellCost);
    else pts = [[a.x, a.y]];
    a.rawPlan = false;
    if (a.trip) a.trip.replans++;
  }
  pts.push([a.goal.x, a.goal.y]);
  a.plan = { pts, i: 1 };
  a.planCells.clear();
  const tmp = [];
  for (let i = 0; i < pts.length - 1; i++) for (const c of cellsOnSegment(w, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], tmp)) a.planCells.add(c);
}

function routeKey(a) { return a.goal?.key ?? null; }
function routeClear(w, pts, cellCost) {
  const tmp = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (const c of cellsOnSegment(w, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], tmp)) if (!(cellCost(c, 0, 0) < Infinity)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------------------------

function beginTrip(sim, a, kind) {
  a.tripNo++;
  a.trip = { no: a.tripNo, kind, t0: sim.time, battery0: a.battery ?? 0, dist: 0, nfz: 0, band: 0, wrongWay: 0, waits: 0, replans: 0, reuse: false, emergency: false, yields: 0, crumbs: [] };
  a.tripOrigin = { x: a.x, y: a.y };
}

function endTrip(sim, a, ok = true) {
  if (!a.trip) return;
  const t = a.trip;
  t.duration = sim.time - t.t0;
  t.energy = a.type === 'drone' ? Math.max(0, t.battery0 - a.battery + (t.charged ?? 0)) : 0;
  t.ok = ok;
  a.totals.trips++;
  sim.recordTrip(a, t);
  a.trip = null;
}

function setGoal(sim, a, g) {
  a.goal = g; a.needPlan = true;
  if (a.trip) a.tripOrigin = { x: a.x, y: a.y };
}

// ---------------------------------------------------------------------------------------------
// Per-tick update
// ---------------------------------------------------------------------------------------------

export function updateAgent(sim, a, dt, doSense) {
  if (a.type === 'drone') updateDrone(sim, a, dt, doSense);
  else updateHeli(sim, a, dt, doSense);
}

function afterSense(sim, a, ev) {
  const k = a.knowledge; const t = sim.time; const w = sim.world;
  for (const l of ev.learned) {
    if (l.kind === 'band') {
      a.needPlan = true;
      const before = a.altTarget;
      const after = a.cruiseZ();
      if (Math.abs(after - before) > 10 && a.airborne) k.addLandmark('band-switch', a.x, a.y, a.z, t, { from: Math.round(before / FT), to: Math.round(after / FT), reason: 'learned the band rule' });
    } else if (l.kind === 'nfz') {
      const z = l.zone;
      const d = Math.hypot(a.x - z.x, a.y - z.y) || 1;
      const bx = z.x + ((a.x - z.x) / d) * z.radius, by = z.y + ((a.y - z.y) / d) * z.radius;
      k.addLandmark('nfz-edge', bx, by, a.z, t, { zone: z.name, applies: z.applies.includes(a.type) }, 200);
      if (z.applies.includes(a.type) && z.cells.some((c) => a.planCells.has(c))) a.needPlan = true;
    } else if (l.kind === 'pad' && a.type === 'drone') {
      k.addLandmark('landing-site', l.pad.x, l.pad.y, l.pad.z, t, { pad: l.pad.id, hub: l.pad.hub }, 60);
    } else if (l.kind === 'heliport' && a.type !== 'drone') {
      k.addLandmark('landing-site', l.heliport.x, l.heliport.y, l.heliport.z, t, { heliport: l.heliport.id }, 60);
      if (a.goal && a.goal.heliport === l.heliport.id) { a.goal.x = l.heliport.x; a.goal.y = l.heliport.y; a.needPlan = true; }
    } else if (l.kind === 'lane' && a.type !== 'drone') {
      if (sim.time - a.lastPlan > 6) a.needPlan = true;
    }
  }
  for (const c of ev.blockedNew) if (a.planCells.has(c)) { a.needPlan = true; break; }
  void w;
}

// ---- congestion: crowding seen in the cone becomes a hindrance --------------------------------
function checkCongestion(sim, a) {
  const cg = a.spec.congestion; const k = a.knowledge;
  const dzMax = a.type === 'drone' ? 30 : 60;
  const near = a.visible.filter((o) => (a.type === 'drone' || o.type !== 'drone') && Math.hypot(o.x - a.x, o.y - a.y) < cg.radius && Math.abs(o.z - a.z) < dzMax);
  if (near.length < cg.count) return 0;
  const until = sim.time + cg.memory;
  for (const o of near) {
    const c = sim.world.cellOf(o.x, o.y);
    if (c < 0) continue;
    const W = sim.world.W;
    for (const d of [0, 1, -1, W, -W]) if (c + d >= 0 && c + d < sim.world.N) k.congestion.set(c + d, until);
  }
  const mx = near.reduce((s, o) => s + o.x, a.x) / (near.length + 1);
  const my = near.reduce((s, o) => s + o.y, a.y) / (near.length + 1);
  const lm = k.addLandmark('congestion', mx, my, a.z, sim.time, { count: near.length + 1 }, a.type === 'drone' ? 150 : 500);
  sim.noteCongestion(a, mx, my, a.z, near.length + 1, !!lm);
  if (sim.time > a.congestedUntil) { a.needPlan = true; a.totals.congestion++; }
  a.congestedUntil = sim.time + 10;
  return near.length;
}

// ---- see-and-avoid ----------------------------------------------------------------------------
// Returns a horizontal avoidance vector and a vertical nudge, following 14 CFR 91.113 between
// aircraft of the same kind (head-on: both turn right; converging: the one with the other on its
// right gives way; overtaking: pass on the right), 107.37 (drones give way to crewed aircraft),
// and medical priority.
function avoidance(sim, a, horizon) {
  let ax = 0, ay = 0, az = 0, yielded = false;
  const sepH = a.type === 'drone' ? a.spec.separation.horizontal : a.spec.separation.horizontal;
  const sepV = a.type === 'drone' ? a.spec.separation.vertical : a.spec.separation.vertical * FT;
  const rightX = Math.sin(a.heading), rightY = -Math.cos(a.heading);
  for (const o of a.visible) {
    const px = o.x - a.x, py = o.y - a.y, pz = o.z - a.z;
    const d = Math.hypot(px, py);
    if (a.type === 'drone' && o.type !== 'drone') { // give way to helicopters, early and generously
      if (d < 450 && Math.abs(pz) < 90) {
        ax -= (px / (d || 1)) * 1.2; ay -= (py / (d || 1)) * 1.2; az -= 0.6; yielded = true;
      }
      continue;
    }
    if (a.type !== 'drone' && o.type === 'drone') { if (d < 100 && Math.abs(pz) < 40) az += 0.6; continue; }
    const rvx = o.vx - a.vx, rvy = o.vy - a.vy, rvz = o.vz - a.vz;
    const vv = rvx * rvx + rvy * rvy;
    const t = vv > 1e-6 ? clamp(-(px * rvx + py * rvy) / vv, 0, horizon) : 0;
    const dcpa = Math.hypot(px + rvx * t, py + rvy * t);
    const dzc = Math.abs(pz + rvz * t);
    if (dcpa > sepH * 1.4 || dzc > sepV * 1.5) continue;
    const myPriority = a.type === 'medical' ? 2 : 1; const itsPriority = o.type === 'medical' ? 2 : 1;
    if (myPriority > itsPriority && dcpa > sepH * 0.35) continue; // medical keeps its course
    const rel = wrapAngle(Math.atan2(py, px) - a.heading);
    const headOn = Math.cos(wrapAngle(Math.atan2(o.vy, o.vx) - a.heading)) < -0.85 && Math.abs(rel) < 0.5;
    const onRight = rel < -0.15 && rel > -2.4;
    const overtaking = Math.abs(rel) < 0.6 && !headOn && (px * rvx + py * rvy) < 0;
    const mustYield = itsPriority > myPriority || headOn || onRight || overtaking;
    const urgency = clamp(1 - dcpa / (sepH * 1.4), 0.15, 1);
    if (mustYield) {
      ax += rightX * urgency * 1.4; ay += rightY * urgency * 1.4; yielded = true;
      if (itsPriority > myPriority) az += (a.z > o.z ? 1 : -1) * urgency;
    } else if (dcpa < sepH * 0.5) { // even with right of way, never fly into it
      ax -= (px / (d || 1)) * urgency * 0.5; ay -= (py / (d || 1)) * urgency * 0.5;
    }
  }
  return { ax, ay, az, yielded };
}

// ---- following the plan ----------------------------------------------------------------------
function desiredDirection(sim, a, acceptR) {
  if (a.needPlan && sim.planBudget > 0) { sim.planBudget--; plan(sim, a); }
  if (!a.plan) return null;
  const p = a.plan;
  while (p.i < p.pts.length - 1) {
    const [wx, wy] = p.pts[p.i];
    if (Math.hypot(wx - a.x, wy - a.y) < acceptR) { p.i++; continue; }
    // skip ahead when the next leg is already closer
    const [nx, ny] = p.pts[p.i + 1];
    const [qx, qy] = closestOnSegment(a.x, a.y, wx, wy, nx, ny);
    if (Math.hypot(qx - a.x, qy - a.y) < acceptR * 0.6) { p.i++; continue; }
    break;
  }
  const [tx, ty] = p.pts[Math.min(p.i, p.pts.length - 1)];
  const d = Math.hypot(tx - a.x, ty - a.y);
  return d > 0.01 ? { x: (tx - a.x) / d, y: (ty - a.y) / d, d } : { x: 0, y: 0, d: 0 };
}

function recordCrumb(a) {
  if (!a.trip || a.type !== 'drone') return;
  const cr = a.trip.crumbs; const last = cr[cr.length - 1];
  if (!last || Math.hypot(a.x - a.home.x - last[0], a.y - a.home.y - last[1]) > 120) cr.push([a.x - a.home.x, a.y - a.home.y]);
}

function moveTrail(sim, a, d) {
  a.totals.dist += d;
  if (a.trip) a.trip.dist += d;
  const lt = a.lastTrail;
  if (!lt || Math.hypot(a.x - lt[0], a.y - lt[1], a.z - lt[2]) > sim.config.sim.trailSpacing) {
    const p = [a.x, a.y, a.z];
    if (lt) sim.addPathSegment(a, lt, p);
    a.lastTrail = p; a.trail.push(p);
    if (a.trail.length > sim.config.sim.trailMax) a.trail.shift();
  }
}

// ---- rule bookkeeping (ground truth, for the performance numbers) ----------------------------
function ruleCheck(sim, a, dt) {
  if (!a.airborne) return;
  const w = sim.world; const cfg = sim.config;
  if (w.inNoFly(a.type, a.x, a.y, a.z)) { a.totals.nfz += dt; if (a.trip) a.trip.nfz += dt; }
  const cruising = a.mode === 'cruise' || a.mode === 'return';
  if (cruising) {
    let bad = false;
    if (a.type === 'drone') {
      const want = droneBandFor(cfg, courseOf(a));
      bad = Math.abs(a.z - want) > cfg.bands.drone.tolerance * FT || a.z > cfg.bands.drone.ceiling * FT;
    } else {
      const b = bandAltitudes(cfg, a.type);
      bad = a.z < b.floor - 10 || a.z > b.ceiling + 10;
    }
    if (bad) { a.totals.band += dt; if (a.trip) a.trip.band += dt; }
  }
  const c = w.cellOf(a.x, a.y);
  if (c >= 0 && a.type !== 'drone') {
    const ln = w.laneOf[c];
    if (ln >= 0 && (cruising || a.mode === 'search') && a.z > cfg.bands.heli.tour.floor * FT * 0.9 && a.speed > 5) {
      const dot = (a.vx * w.laneDirX[c] + a.vy * w.laneDirY[c]) / a.speed;
      if (dot < -0.3) { a.totals.wrongWay += dt; if (a.trip) a.trip.wrongWay += dt; }
    }
    // lane entry / exit landmarks (only for lanes it knows about)
    const known = ln >= 0 && (a.knowledge.flags[c] & K.LANE);
    const now = known ? ln : -1;
    if (now !== a.laneNow && a.airborne && a.z > 100) {
      if (now >= 0) a.knowledge.addLandmark('lane-entry', a.x, a.y, a.z, sim.time, { lane: w.lanes[now].name }, 400);
      else if (a.laneNow >= 0) a.knowledge.addLandmark('lane-exit', a.x, a.y, a.z, sim.time, { lane: w.lanes[a.laneNow].name }, 400);
      a.laneNow = now;
    }
  }
  if (cruising && c >= 0 && w.height[c] > a.z - 1) { // flew into something it had not seen: count and climb out
    a.totals.strikes++;
    if (!(a.lastStrikeNote > sim.time - 120)) { a.lastStrikeNote = sim.time; sim.noteEvent(a, 'strike', `${label(a)} nearly hit a building it had not seen and climbed away`); }
    a.knowledge.see(c, w.height[c], w.land[c]); // now it knows that building
    a.needPlan = true;
    a.z = w.height[c] + 5;
  }
}

export const label = (a) => `${a.type === 'drone' ? 'Drone' : a.type === 'tour' ? 'Tour helicopter' : 'Medical helicopter'} #${a.id}`;

// =============================================================================================
// Drone
// =============================================================================================

function updateDrone(sim, a, dt, doSense) {
  const c = a.spec; const cfg = sim.config;
  a.cruiseZ = a.cruiseZ || (() => cruiseZFor(sim, a));
  if (doSense && a.active) afterSense(sim, a, sense(a, sim));

  let wantV = { x: 0, y: 0 }; let targetZ = a.z; let hSpeed = c.speed;
  switch (a.mode) {
    case 'charging': {
      a.airborne = false; a.battery = Math.min(c.battery, a.battery + (c.battery / c.rechargeTime) * dt * 0.5);
      a.timer -= dt;
      if (a.timer <= 0 && a.battery > c.battery * 0.95) {
        if (a.resumeGoal) { // after an emergency stop: carry on
          a.mode = 'takeoff'; setGoal(sim, a, a.resumeGoal); a.resumeGoal = null; break;
        }
        const cust = sim.pickCustomer(a);
        beginTrip(sim, a, 'delivery');
        setGoal(sim, a, { x: cust.x, y: cust.y, z: cust.z, key: `c${cust.id}`, customer: cust });
        a.mode = 'takeoff';
      }
      break;
    }
    case 'takeoff': {
      a.airborne = true;
      const pad = sim.siteAt(a);
      if (pad && !sim.holdsSlot(pad, a) && !sim.requestSlot(pad, a)) { a.trip && (a.trip.waits += dt); a.totals.waits += dt; break; }
      a.slotHeld = !!pad;
      targetZ = a.cruiseZ(); hSpeed = 0;
      if (Math.abs(a.z - targetZ) < 3) { if (pad) sim.releaseSlot(pad, a); a.slotHeld = false; a.mode = a.goal?.customer ? 'cruise' : 'return'; a.needPlan = true; }
      break;
    }
    case 'cruise': case 'return': case 'divert': {
      a.airborne = true;
      const zc = a.cruiseZ();
      if (Math.abs(zc - a.altTarget) > 10 && a.knowledge.bandRule && a.mode !== 'divert') {
        a.knowledge.addLandmark('band-switch', a.x, a.y, a.z, sim.time, { from: Math.round(a.altTarget / FT), to: Math.round(zc / FT), reason: 'new course' }, 80);
      }
      targetZ = zc;
      const dir = desiredDirection(sim, a, 20);
      if (dir) { wantV = { x: dir.x, y: dir.y }; if (dir.d < 40) hSpeed = Math.max(2, c.speed * dir.d / 40); }
      const cong = checkCongestion(sim, a);
      if (cong >= c.congestion.holdCount - 1 && sim.time > a.holdUntil + 30) { a.holdUntil = sim.time + c.congestion.holdTime; }
      if (sim.time < a.holdUntil) { hSpeed = 0; a.totals.waits += dt; if (a.trip) a.trip.waits += dt; }
      recordCrumb(a);
      // battery: divert to the nearest pad it knows when it runs low
      if (a.mode !== 'divert' && a.battery < c.battery * c.reserve) {
        const pad = nearestKnownPad(sim, a);
        if (pad) {
          a.resumeGoal = a.goal; a.totals.emergencies++; if (a.trip) a.trip.emergency = true;
          setGoal(sim, a, { x: pad.x, y: pad.y, z: pad.z, pad: pad.id, key: null });
          a.mode = 'divert';
          sim.noteEvent(a, 'emergency', `${label(a)} is low on battery and diverts to a pad it saw earlier`);
        }
      }
      const g = a.goal;
      if (g && Math.hypot(g.x - a.x, g.y - a.y) < 15) {
        if (a.mode === 'cruise') a.mode = 'drop';
        else a.mode = 'landing';
        a.timer = c.deliverHold;
      }
      break;
    }
    case 'drop': {
      const g = a.goal;
      targetZ = g.z + 15; hSpeed = 0;
      if (Math.abs(a.z - targetZ) < 2) {
        a.timer -= dt;
        if (a.timer <= 0) {
          const k = a.knowledge;
          if (!a.served.has(g.customer.id)) k.addLandmark('customer', g.x, g.y, g.z, sim.time, { customer: g.customer.id }, 30);
          a.served.add(g.customer.id);
          if (a.trip && !a.trip.reuse) k.routes.set(g.key, a.trip.crumbs.slice());
          if (a.trip) a.trip.crumbs = [];
          setGoal(sim, a, { x: a.home.x, y: a.home.y, z: a.home.z, key: `h${g.customer.id}`, home: true, pad: a.home.pad });
          a.mode = 'climb';
        }
      }
      break;
    }
    case 'climb': {
      targetZ = a.cruiseZ(); hSpeed = 0;
      if (Math.abs(a.z - targetZ) < 3) { a.mode = 'return'; a.needPlan = true; }
      break;
    }
    case 'landing': {
      const g = a.goal;
      const pad = sim.world.pads[g.pad];
      const low = a.battery < c.battery * c.reserve * 0.7; // a nearly empty drone asks for priority
      if (!sim.holdsSlot(pad, a) && !sim.requestSlot(pad, a, low)) {
        // wait on a holding ring round the pad, each drone at its own spot
        const th = a.id * 2.39996, R = 60 + (a.id % 3) * 25;
        const hx = pad.x + Math.cos(th) * R - a.x, hy = pad.y + Math.sin(th) * R - a.y, hd = Math.hypot(hx, hy);
        wantV = hd > 1 ? { x: hx / hd, y: hy / hd } : { x: 0, y: 0 }; hSpeed = Math.min(c.speed, hd * 0.5);
        targetZ = a.cruiseZ(); a.totals.waits += dt; if (a.trip) a.trip.waits += dt;
        checkCongestion(sim, a);
        if (sim.time > a.holdUntil) { a.knowledge.addLandmark('hold', a.x, a.y, a.z, sim.time, { pad: pad.id }, 100); a.holdUntil = sim.time + 20; }
        break;
      }
      a.slotHeld = true;
      wantV = { x: (pad.x - a.x), y: (pad.y - a.y) }; const d = Math.hypot(wantV.x, wantV.y);
      if (d > 0.5) { wantV.x /= d; wantV.y /= d; hSpeed = Math.min(4, d); } else hSpeed = 0;
      targetZ = pad.z;
      if (a.z - pad.z < 0.6 && d < 2) {
        sim.releaseSlot(pad, a); a.slotHeld = false;
        a.x = pad.x; a.y = pad.y; a.z = pad.z; a.airborne = false; a.speed = 0; a.vx = a.vy = a.vz = 0;
        if (g.home) {
          if (a.trip) { a.trip.charged = 0; recordReturnRoute(a); }
          endTrip(sim, a, true);
          a.mode = 'charging'; a.timer = c.rechargeTime;
        } else { // emergency pad
          if (a.trip) a.trip.charged = (a.trip.charged || 0) + (c.battery - a.battery);
          a.mode = 'charging'; a.timer = c.rechargeTime * 2; a.battery = Math.max(a.battery, 0.01);
        }
      }
      break;
    }
    case 'recover': {
      a.timer -= dt;
      if (a.timer <= 0) { a.x = a.home.x; a.y = a.home.y; a.z = a.home.z; a.battery = c.battery; a.active = true; a.mode = 'charging'; a.timer = c.rechargeTime; }
      return;
    }
    default: break;
  }
  if (!a.active) return;

  // see-and-avoid
  // the pad area is reserved for the drone holding its slot: it does not swerve there
  const onPad = (a.mode === 'landing' || a.mode === 'takeoff') && a.goal && a.slotHeld;
  const av = a.airborne && !onPad ? avoidance(sim, a, 10) : { ax: 0, ay: 0, az: 0, yielded: false };
  if (av.yielded && sim.time > a.yieldUntil) { a.totals.yields++; a.yieldUntil = sim.time + 5; if (a.trip) a.trip.yields++; }
  let vx = wantV.x * hSpeed + av.ax * c.speed * 0.8, vy = wantV.y * hSpeed + av.ay * c.speed * 0.8;
  const vmag = Math.hypot(vx, vy);
  if (vmag > c.speed) { vx *= c.speed / vmag; vy *= c.speed / vmag; }
  // never steer into a building it knows about: drop the avoidance part, and stop if even the
  // planned direction is blocked (then re-plan)
  if (a.airborne && blockedAhead(sim, a, vx, vy)) {
    vx = wantV.x * hSpeed; vy = wantV.y * hSpeed;
    if (blockedAhead(sim, a, vx, vy)) {
      a.stuckT = (a.stuckT || 0) + dt;
      if (a.stuckT < 3) { vx = 0; vy = 0; if (!a.rawPlan) { a.needPlan = true; a.rawPlan = true; } } // re-plan along cell centres
    } else a.stuckT = 0;
  } else a.stuckT = 0;
  // first-order response (a small multirotor accelerates quickly)
  const k = Math.min(1, dt * 1.5);
  a.vx += (vx - a.vx) * k; a.vy += (vy - a.vy) * k;
  if (a.airborne && a.stuckT === 0 && blockedAhead(sim, a, a.vx, a.vy)) { a.vx *= 0.2; a.vy *= 0.2; }
  const tz = targetZ + av.az * 8;
  a.vz = clamp((tz - a.z) * 0.8, -c.descentRate, c.climbRate);
  a.speed = Math.hypot(a.vx, a.vy);
  if (a.speed > 0.5) a.heading = Math.atan2(a.vy, a.vx);
  else if (a.goal && a.airborne) a.heading += clamp(wrapAngle(Math.atan2(a.goal.y - a.y, a.goal.x - a.x) - a.heading), -0.8 * dt, 0.8 * dt);
  a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
  a.altTarget = targetZ;
  // energy
  if (a.airborne) {
    const P = c.hoverPower + c.dragK * a.speed * a.speed + Math.max(0, c.mass * 9.81 * a.vz) / c.climbEff;
    const e = (P * dt) / 3600;
    a.battery -= e; a.totals.energy += e;
    if (a.battery <= 0) {
      a.battery = 0; a.totals.forced++;
      sim.noteEvent(a, 'forced', `${label(a)} ran out of battery and made a forced landing`);
      a.knowledge.addLandmark('landing-site', a.x, a.y, sim.world.height[sim.world.cellOf(a.x, a.y)] || 0, sim.time, { forced: true }, 50);
      endTrip(sim, a, false);
      a.active = false; a.airborne = false; a.mode = 'recover'; a.timer = 300; a.resumeGoal = null;
      return;
    }
  }
  moveTrail(sim, a, a.speed * dt);
  ruleCheck(sim, a, dt);
}

// Is the cell the agent would be in a couple of seconds from now known to be too tall?
function blockedAhead(sim, a, vx, vy, secs = 2.5) {
  const v = Math.hypot(vx, vy); if (v < 0.1) return false;
  const w = sim.world; const k = a.knowledge;
  const look = Math.max(v * secs, w.cs * 0.6);
  const here = w.cellOf(a.x, a.y);
  for (const f of [0.5, 1]) {
    const c = w.cellOf(a.x + (vx / v) * look * f, a.y + (vy / v) * look * f);
    if (c < 0 || c === here) continue;
    if (k.knownHeight(c) > a.z - 3) return true;
  }
  return false;
}

// Highest known roof (plus a margin) in a strip ahead of a helicopter.
function safeFloor(sim, a, dist) {
  const w = sim.world; const k = a.knowledge; let top = 0;
  const ux = Math.cos(a.heading), uy = Math.sin(a.heading);
  for (let d = 0; d <= dist; d += w.cs) {
    for (const side of [-1, 0, 1]) {
      const c = w.cellOf(a.x + ux * d - uy * side * w.cs, a.y + uy * d + ux * side * w.cs);
      if (c >= 0) top = Math.max(top, k.knownHeight(c));
    }
  }
  return top + a.spec.clearance * 0.75;
}

function recordReturnRoute(a) {
  if (a.goal?.key && !a.trip.reuseHome) a.knowledge.routes.set(a.goal.key, a.trip.crumbs.slice());
}

function nearestKnownPad(sim, a) {
  let best = null, bd = Infinity;
  for (const id of a.knowledge.pads) {
    const p = sim.world.pads[id]; const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// =============================================================================================
// Helicopters
// =============================================================================================

function heliGoalFor(sim, a, heliport) {
  // The dispatch gives the heliport's position with an error until the crew has seen it.
  if (!a.dispatchError.has(heliport.id)) {
    const r = sim.rng.range(0.4, 1) * a.spec.dispatchError, th = sim.rng.range(0, Math.PI * 2);
    a.dispatchError.set(heliport.id, [Math.cos(th) * r, Math.sin(th) * r]);
  }
  const known = a.knowledge.heliports.has(heliport.index);
  const [ex, ey] = known ? [0, 0] : a.dispatchError.get(heliport.id);
  return { x: heliport.x + ex, y: heliport.y + ey, z: heliport.z, heliport: heliport.index, site: heliport };
}

function nextTourGoal(sim, a) {
  const sights = sim.config.tours.sights;
  if (a.tourStep < sights.length) {
    const [la, lo, name] = sights[a.tourStep];
    const [x, y] = sim.world.frame.toXY(la, lo);
    return { x, y, z: 0, sight: name };
  }
  return heliGoalFor(sim, a, a.base);
}

function updateHeli(sim, a, dt, doSense) {
  const s = a.spec; const cfg = sim.config; const w = sim.world;
  a.cruiseZ = a.cruiseZ || (() => cruiseZFor(sim, a));
  if (doSense && a.active) afterSense(sim, a, sense(a, sim));
  let targetSpeed = s.speed; let targetZ = a.z; let desired = null;

  switch (a.mode) {
    case 'offsite': { // medical flights between missions, outside the site
      a.timer -= dt; a.airborne = false;
      if (a.timer > 0) return;
      const entries = cfg.medical.entries;
      const [la, lo] = entries[Math.floor(sim.rng.next() * entries.length)];
      const [x, y] = w.frame.toXY(la, lo);
      const bases = cfg.medical.bases;
      const base = w.heliportById[sim.rng.chance(0.5) ? bases[0] : bases[1 + Math.floor(sim.rng.next() * (bases.length - 1))]];
      Object.assign(a, { x, y, z: a.cruiseZ(), active: true, airborne: true, speed: s.speed * 0.8 });
      a.heading = Math.atan2(base.y - y, base.x - x); a.vx = Math.cos(a.heading) * a.speed; a.vy = Math.sin(a.heading) * a.speed; a.vz = 0;
      a.lastTrail = null; a.laneNow = -1;
      beginTrip(sim, a, 'medical');
      a.base = base;
      setGoal(sim, a, heliGoalFor(sim, a, base));
      a.mode = 'cruise';
      sim.noteEvent(a, 'enter', `${label(a)} enters the site for ${base.id}`);
      break;
    }
    case 'parked': {
      a.airborne = false; a.timer -= dt; a.speed = 0; a.vx = a.vy = a.vz = 0;
      if (a.timer > 0) return;
      if (a.type === 'tour') {
        beginTrip(sim, a, 'tour'); a.tourStep = 0;
        setGoal(sim, a, nextTourGoal(sim, a));
      } else { // medical: leave through an exit
        const [la, lo] = cfg.medical.entries[Math.floor(sim.rng.next() * cfg.medical.entries.length)];
        const [x, y] = w.frame.toXY(la, lo);
        setGoal(sim, a, { x, y, z: 0, exit: true });
      }
      a.mode = 'takeoff';
      break;
    }
    case 'takeoff': {
      a.airborne = true;
      const hp = a.parkedAt;
      if (hp && !sim.holdsSlot(hp, a)) sim.requestSlot(hp, a, true);
      targetSpeed = a.z - (hp?.z ?? 0) > 60 ? s.speed * 0.6 : 0;
      targetZ = a.cruiseZ();
      if (a.z - (hp?.z ?? 0) > 90) { if (hp) sim.releaseSlot(hp, a); a.parkedAt = null; a.mode = 'cruise'; a.needPlan = true; }
      desired = desiredDirection(sim, a, 180);
      break;
    }
    case 'cruise': {
      a.airborne = true;
      targetZ = a.cruiseZ();
      if (sim.time - a.lastPlan > s.replanEvery) a.needPlan = true;
      desired = desiredDirection(sim, a, 180);
      const g = a.goal;
      const dg = Math.hypot(g.x - a.x, g.y - a.y);
      if (checkCongestion(sim, a) && a.knowledge.bandRule && sim.time > (a.sublayerUntil || 0)) {
        const before = a.cruiseZ();
        a.sublayer = a.sublayer === 0 ? (sim.rng.chance(0.5) ? 1 : -1) : 0;
        a.sublayerUntil = sim.time + 60;
        a.knowledge.addLandmark('band-switch', a.x, a.y, a.z, sim.time, { from: Math.round(before / FT), to: Math.round(a.cruiseZ() / FT), reason: 'traffic' }, 300);
      }
      if (sim.time > (a.sublayerUntil || 0) && a.sublayer !== 0 && !a.visible.length) a.sublayer = 0;
      if (g.sight && dg < 650) { a.tourStep++; setGoal(sim, a, nextTourGoal(sim, a)); break; }
      if (g.exit && (dg < 700 || sim.world.cellOf(a.x, a.y) < 0)) { // medical flight leaves the site
        endTrip(sim, a, true);
        a.active = false; a.airborne = false; a.mode = 'offsite'; a.timer = sim.rng.range(200, 600);
        break;
      }
      if (g.heliport !== undefined) {
        const known = a.knowledge.heliports.has(g.heliport);
        if (known && dg < 1500) { a.mode = 'approach'; break; }
        if (!known && dg < 450) { a.mode = 'search'; a.searchT = 0; }
      }
      break;
    }
    case 'search': { // circle the dispatch position until the heliport is in sight
      a.airborne = true; targetZ = a.cruiseZ() - 60; targetSpeed = s.speed * 0.6;
      a.searchT = (a.searchT || 0) + dt;
      desired = { x: Math.cos(a.heading + 0.6), y: Math.sin(a.heading + 0.6), d: 1 };
      if (a.knowledge.heliports.has(a.goal.heliport)) a.mode = 'approach';
      else if (a.searchT > 240) { a.knowledge.heliports.add(a.goal.heliport); a.goal.x = a.goal.site.x; a.goal.y = a.goal.site.y; a.mode = 'approach'; } // asks by radio
      break;
    }
    case 'approach': case 'hold': {
      a.airborne = true;
      const hp = a.goal.site; const dg = Math.hypot(hp.x - a.x, hp.y - a.y);
      const granted = sim.holdsSlot(hp, a) || (dg < 1200 && sim.requestSlot(hp, a, a.type === 'medical'));
      if (!granted) {
        if (dg < 1300) { // hold: orbit where it is, at its band altitude
          if (a.mode !== 'hold') { a.mode = 'hold'; a.knowledge.addLandmark('hold', a.x, a.y, a.z, sim.time, { heliport: hp.id }, 500); sim.noteEvent(a, 'hold', `${label(a)} holds: ${hp.id} is full`); }
          desired = { x: Math.cos(a.heading + 1.2), y: Math.sin(a.heading + 1.2), d: 1 };
          targetSpeed = s.speed * 0.55; targetZ = a.cruiseZ();
          a.totals.waits += dt; if (a.trip) a.trip.waits += dt;
          checkCongestion(sim, a);
          break;
        }
        desired = desiredDirection(sim, a, 180); targetZ = a.cruiseZ();
        break;
      }
      a.mode = 'approach';
      // final approach: slow down with distance, descend on a ~ 8 degree path
      const ux = (hp.x - a.x) / (dg || 1), uy = (hp.y - a.y) / (dg || 1);
      desired = dg > 450 ? desiredDirection(sim, a, 150) || { x: ux, y: uy, d: dg } : { x: ux, y: uy, d: dg };
      targetSpeed = clamp(dg * 0.06, 0, s.speed * 0.8);
      targetZ = Math.max(hp.z, Math.min(a.cruiseZ(), hp.z + dg * 0.14));
      if (dg < 40) {
        targetSpeed = 0; desired = null;
        a.x += clamp(hp.x - a.x, -3 * dt, 3 * dt); a.y += clamp(hp.y - a.y, -3 * dt, 3 * dt);
        targetZ = hp.z;
        if (a.z - hp.z < 1.5 && dg < 6) {
          a.x = hp.x; a.y = hp.y; a.z = hp.z; a.speed = 0; a.vx = a.vy = a.vz = 0; a.airborne = false;
          a.parkedAt = hp; a.mode = 'parked'; a.timer = s.dwell;
          if (a.type === 'tour') endTrip(sim, a, true);
          return;
        }
      }
      break;
    }
    default: break;
  }
  if (!a.active) return;

  // ---- kinematics: limited turn rate, speed and climb ----
  const av = a.airborne ? avoidance(sim, a, 35) : { ax: 0, ay: 0, az: 0, yielded: false };
  if (av.yielded && sim.time > a.yieldUntil) { a.totals.yields++; a.yieldUntil = sim.time + 10; if (a.trip) a.trip.yields++; sim.noteYield(a); }
  const danger = a.airborne && a.mode !== 'approach' && blockedAhead(sim, a, a.vx, a.vy, 9);
  if (danger) { targetSpeed *= 0.5; a.needPlan = true; }
  // keep clear of known roofs ahead even if that means leaving the band for a moment
  if (a.airborne && a.mode !== 'approach' && a.mode !== 'takeoff') targetZ = Math.max(targetZ, safeFloor(sim, a, 700));
  let hx = desired ? desired.x : Math.cos(a.heading), hy = desired ? desired.y : Math.sin(a.heading);
  hx += av.ax * 1.2; hy += av.ay * 1.2;
  if (a.mode !== 'parked' && (desired || av.yielded)) {
    const want = Math.atan2(hy, hx);
    const maxTurn = (s.turnRate * Math.PI / 180) * dt * (a.speed < 15 ? 3 : 1) * (danger ? 2 : 1);
    a.heading = wrapAngle(a.heading + clamp(wrapAngle(want - a.heading), -maxTurn, maxTurn));
  }
  if (av.yielded) targetSpeed *= 0.85;
  a.speed += clamp(targetSpeed - a.speed, -3 * dt, 2 * dt);
  a.speed = Math.max(0, a.speed);
  a.vx = Math.cos(a.heading) * a.speed; a.vy = Math.sin(a.heading) * a.speed;
  const tz = targetZ + av.az * 40;
  a.vz = clamp((tz - a.z) * 0.25, -s.climbRate, s.climbRate);
  a.x += a.vx * dt; a.y += a.vy * dt; a.z = Math.max(0, a.z + a.vz * dt);
  a.altTarget = targetZ;
  moveTrail(sim, a, a.speed * dt);
  ruleCheck(sim, a, dt);
}
