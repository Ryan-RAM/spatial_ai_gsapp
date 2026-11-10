// The simulation: spawns the population, steps every agent, runs the shared bookkeeping that no
// agent sees (pad slots, loss-of-separation checks, the collective heat maps and path overlay),
// and summarises performance per agent type and per trip number.

import { makeRng } from './rng.js';
import { FT } from './config.js';
import { makeDrone, makeHeli, updateAgent, resetIds, label } from './agents.js';
import { K, LANDMARK_TYPES } from './knowledge.js';

export function makeSim(world, config = world.config, seed = config.seed) {
  resetIds();
  const rng = makeRng(seed);
  const N = world.N;
  const sim = {
    world, config, rng, time: 0, tick: 0, agents: [], events: [], trips: [], planBudget: 0,
    slots: new Map(),
    heat: {
      drone: new Float32Array(N), heli: new Float32Array(N),   // seconds spent over each cell
      crowd: new Float32Array(N),                               // true crowding (ground truth)
      perceived: new Float32Array(N),                           // crowding as agents reported it
    },
    hotspots: [],              // congestion landmarks in 3D (x, y, z, count, type)
    paths: { buf: new Float32Array(config.render.pathsMaxSegments * 7), n: 0, total: 0 },
    separation: { lastPair: new Map(), heli: 0, drone: 0, mixed: 0 },
  };

  // ---- customers for each hub (drop points on low roofs or open ground) ----
  const hubs = world.pads.filter((p) => p.hub);
  if (!hubs.length) throw new Error('No drone hubs could be placed: check dronePads in config.js');
  for (const hub of hubs) {
    hub.customers = [];
    let tries = 0;
    while (hub.customers.length < config.drone.customersPerHub && tries++ < 5000) {
      const r = rng.range(500, config.drone.tripRadius), th = rng.range(0, 2 * Math.PI);
      const x = hub.x + Math.cos(th) * r, y = hub.y + Math.sin(th) * r;
      const c = world.cellOf(x, y);
      if (c < 0 || !world.land[c] || world.nfzMask[c] || world.height[c] > 45 || /jersey/i.test(world.landNameAt(world.cx(c), world.cy(c)))) continue; // NYC customers only
      hub.customers.push({ id: `${hub.id}-${hub.customers.length}`, x: world.cx(c), y: world.cy(c), z: world.height[c], hub: hub.id });
    }
  }

  // ---- population ----
  const P = config.population;
  for (let i = 0; i < P.drones; i++) sim.agents.push(makeDrone(sim, hubs[i % hubs.length]));
  for (let i = 0; i < P.tours; i++) {
    const base = world.heliportById[config.tours.bases[i % config.tours.bases.length]];
    sim.agents.push(makeHeli(sim, 'tour', { x: base.x, y: base.y, z: base.z, heading: rng.range(-3, 3), base }));
  }
  for (let i = 0; i < P.medical; i++) sim.agents.push(makeHeli(sim, 'medical', { x: 0, y: 0, z: 0 }));

  // ---- spatial hash ----
  const BUCKET = 250;
  const bw = Math.ceil(world.frame.width / BUCKET) + 1;
  let hash = new Map();
  const rebuildHash = () => {
    hash = new Map();
    for (const a of sim.agents) {
      if (!a.active) continue;
      const k = Math.floor(a.y / BUCKET) * bw + Math.floor(a.x / BUCKET);
      let arr = hash.get(k); if (!arr) hash.set(k, (arr = [])); arr.push(a);
    }
  };
  const tmp = [];
  sim.neighbours = (x, y, r) => {
    tmp.length = 0;
    const i0 = Math.floor((x - r) / BUCKET), i1 = Math.floor((x + r) / BUCKET);
    const j0 = Math.floor((y - r) / BUCKET), j1 = Math.floor((y + r) / BUCKET);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const arr = hash.get(j * bw + i); if (arr) for (const a of arr) tmp.push(a);
    }
    return tmp.slice();
  };

  // ---- landing slots (heliport pads and rooftop pads) ----
  const slotOf = (site) => {
    const key = `${site.kind}:${site.id}`;
    let s = sim.slots.get(key);
    if (!s) sim.slots.set(key, (s = { site, holders: new Set(), waiting: new Map() }));
    return s;
  };
  const capacity = (site) => site.capacity ?? site.pads ?? 1;
  sim.holdsSlot = (site, a) => slotOf(site).holders.has(a.id);
  sim.requestSlot = (site, a, priority = false) => {
    const s = slotOf(site);
    if (s.holders.has(a.id)) return true;
    const me = s.waiting.get(a.id) || { t: sim.time, priority };
    me.ask = sim.time; s.waiting.set(a.id, me);
    const free = capacity(site) - s.holders.size;
    if (free <= 0) return false;
    // medical flights first, then first come first served (only agents still asking count)
    let ahead = 0;
    for (const [id, w] of s.waiting) {
      if (id === a.id || w.ask < sim.time - 5) continue;
      if ((w.priority && !priority) || (w.priority === priority && w.t < me.t)) ahead++;
    }
    if (ahead >= free) return false;
    s.waiting.delete(a.id); s.holders.add(a.id);
    return true;
  };
  sim.releaseSlot = (site, a) => { const s = slotOf(site); s.holders.delete(a.id); s.waiting.delete(a.id); };
  sim.siteAt = (a) => world.pads.find((p) => Math.hypot(p.x - a.x, p.y - a.y) < 5) || null;
  const byId = new Map(sim.agents.map((a) => [a.id, a]));
  sim.agentById = (id) => byId.get(id);

  sim.pickCustomer = (a) => {
    const cs = a.hub.customers;
    if (a.served.size && rng.chance(config.drone.repeatCustomerChance)) {
      const ids = [...a.served]; const id = ids[Math.floor(rng.next() * ids.length)];
      return cs.find((c) => c.id === id);
    }
    return cs[Math.floor(rng.next() * cs.length)];
  };

  // ---- bookkeeping hooks used by agents.js ----
  sim.recordTrip = (a, t) => {
    sim.trips.push({ agent: a.id, type: a.type, no: t.no, kind: t.kind, duration: t.duration, energy: t.energy, dist: t.dist,
      nfz: t.nfz, band: t.band, wrongWay: t.wrongWay, waits: t.waits, replans: t.replans, reuse: t.reuse, emergency: t.emergency, ok: t.ok, yields: t.yields,
      known: a.knowledge.seenCount, end: sim.time });
  };
  sim.addPathSegment = (a, p0, p1) => {
    const P = sim.paths; const cap = config.render.pathsMaxSegments; const i = (P.n % cap) * 7;
    P.buf[i] = p0[0]; P.buf[i + 1] = p0[1]; P.buf[i + 2] = p0[2]; P.buf[i + 3] = p1[0]; P.buf[i + 4] = p1[1]; P.buf[i + 5] = p1[2];
    P.buf[i + 6] = a.type === 'drone' ? 0 : a.type === 'tour' ? 1 : 2;
    P.n++; P.total++;
  };
  sim.noteCongestion = (a, x, y, z, count, isNew) => {
    const c = world.cellOf(x, y);
    if (c >= 0) sim.heat.perceived[c] += 1;
    if (isNew) { sim.hotspots.push({ x, y, z, count, type: a.type, t: sim.time }); if (sim.hotspots.length > 6000) sim.hotspots.shift(); }
  };
  sim.noteEvent = (a, kind, text) => {
    sim.events.push({ t: sim.time, kind, text, agent: a.id });
    if (sim.events.length > 200) sim.events.shift();
  };
  sim.noteYield = () => {};

  // ---- one tick ----
  const sepD = config.drone.separation, losH = config.heli.lossOfSeparation;
  sim.step = () => {
    const dt = config.sim.dt;
    sim.time += dt; sim.tick++;
    rebuildHash();
    sim.planBudget = 30;
    for (const a of sim.agents) {
      const doSense = (sim.tick + a.id) % config.sim.senseEvery === 0;
      updateAgent(sim, a, dt, doSense);
    }
    // ground truth: time over each cell, crowding, loss of separation
    rebuildHash();
    for (const a of sim.agents) {
      if (!a.active || !a.airborne) continue;
      const c = world.cellOf(a.x, a.y);
      if (c < 0) continue;
      (a.type === 'drone' ? sim.heat.drone : sim.heat.heli)[c] += dt;
      const r = a.type === 'drone' ? config.drone.congestion.radius : config.heli.congestion.radius;
      let crowd = 0;
      for (const o of sim.neighbours(a.x, a.y, r)) {
        if (o === a || !o.airborne) continue;
        const dh = Math.hypot(o.x - a.x, o.y - a.y), dz = Math.abs(o.z - a.z);
        if (dh < r && dz < (a.type === 'drone' ? 30 : 60) && (a.type === 'drone') === (o.type === 'drone')) crowd++;
        if (o.id < a.id) continue;
        let lost = false, kind = 'mixed';
        if (a.type === 'drone' && o.type === 'drone') { lost = dh < sepD.horizontal * 0.5 && dz < sepD.vertical * 0.5; kind = 'drone'; }
        else if (a.type !== 'drone' && o.type !== 'drone') { lost = dh < losH.horizontal && dz < losH.vertical * FT; kind = 'heli'; }
        else lost = dh < losH.horizontal && dz < 30;
        if (lost) {
          const key = `${a.id}-${o.id}`;
          if (!(sim.separation.lastPair.get(key) > sim.time - 30)) {
            sim.separation[kind]++; sim.separation.lastPair.set(key, sim.time);
            if (kind !== 'drone') sim.noteEvent(a, 'separation', `Loss of separation: ${label(a)} and ${label(o)} (${Math.round(dh)} m, ${Math.round(dz / FT)} ft)`);
          }
        }
      }
      const need = a.type === 'drone' ? config.drone.congestion.count - 1 : config.heli.congestion.count - 1;
      if (crowd >= need) sim.heat.crowd[c] += dt;
    }
  };
  sim.run = (seconds, onTick) => { const n = Math.round(seconds / config.sim.dt); for (let i = 0; i < n; i++) { sim.step(); if (onTick) onTick(sim); } };

  // ---- collective views ----
  sim.allLandmarks = () => sim.agents.flatMap((a) => a.knowledge.landmarks);
  sim.landmarkHeat = (types = LANDMARK_TYPES) => {
    const g = new Float32Array(N); const set = new Set(types);
    for (const a of sim.agents) for (const lm of a.knowledge.landmarks) if (set.has(lm.type)) { const c = world.cellOf(lm.x, lm.y); if (c >= 0) g[c] += lm.count; }
    return g;
  };
  sim.knowledgeOverlap = (filter = () => true) => {
    const g = new Float32Array(N);
    for (const a of sim.agents) { if (!filter(a)) continue; const f = a.knowledge.flags; for (let c = 0; c < N; c++) if (f[c] & K.SEEN) g[c]++; }
    return g;
  };

  sim.summary = () => summarise(sim);
  return sim;
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const r1 = (x) => (x === null ? null : Math.round(x * 10) / 10);

export function summarise(sim) {
  const out = { simulatedMinutes: r1(sim.time / 60), source: sim.world.source, types: {}, separation: { ...sim.separation, lastPair: undefined } };
  for (const type of ['drone', 'tour', 'medical']) {
    const ag = sim.agents.filter((a) => a.type === type);
    const trips = sim.trips.filter((t) => t.type === type && t.ok);
    const byNo = {};
    for (const t of trips) { const k = t.no >= 4 ? '4+' : String(t.no); (byNo[k] ||= []).push(t); }
    const perTrip = {};
    for (const [k, ts] of Object.entries(byNo)) {
      perTrip[k] = {
        n: ts.length, minutes: r1(mean(ts.map((t) => t.duration / 60))), km: r1(mean(ts.map((t) => t.dist / 1000))),
        ...(type === 'drone' ? { wh: r1(mean(ts.map((t) => t.energy))), whPerKm: r1(mean(ts.map((t) => t.energy / Math.max(0.1, t.dist / 1000)))) } : {}),
        replans: r1(mean(ts.map((t) => t.replans))), reuseShare: r1(mean(ts.map((t) => (t.reuse ? 100 : 0)))),
        violationSeconds: r1(mean(ts.map((t) => t.nfz + t.band + t.wrongWay))), waitSeconds: r1(mean(ts.map((t) => t.waits))),
      };
    }
    const tot = (k) => ag.reduce((s, a) => s + a.totals[k], 0);
    out.types[type] = {
      agents: ag.length, tripsDone: trips.length, failedTrips: sim.trips.filter((t) => t.type === type && !t.ok).length,
      perTripNumber: perTrip,
      knowsBandRule: ag.filter((a) => a.knowledge.bandRule).length,
      meanKnownCells: Math.round(mean(ag.map((a) => a.knowledge.seenCount)) || 0),
      landmarks: ag.reduce((s, a) => s + a.knowledge.landmarks.length, 0),
      totals: { nfzSeconds: r1(tot('nfz')), offBandSeconds: r1(tot('band')), wrongWaySeconds: r1(tot('wrongWay')), waitSeconds: r1(tot('waits')),
        yields: tot('yields'), congestionEncounters: tot('congestion'), emergencies: tot('emergencies'), forcedLandings: tot('forced'), buildingNearMisses: tot('strikes'), routeReuses: tot('reuse') },
    };
  }
  // where the jams formed (top cells of true crowding)
  const crowd = sim.heat.crowd; const W = sim.world.W; const top = [];
  for (let c = 0; c < crowd.length; c++) if (crowd[c] > 0) top.push([crowd[c], c]);
  top.sort((a, b) => b[0] - a[0]);
  out.crowdHotspots = top.slice(0, 8).map(([s, c]) => {
    const [lat, lon] = sim.world.frame.toLatLon(sim.world.cx(c), sim.world.cy(c));
    return { lat: +lat.toFixed(5), lon: +lon.toFixed(5), agentSeconds: Math.round(s), cell: [c % W, Math.floor(c / W)] };
  });
  return out;
}
