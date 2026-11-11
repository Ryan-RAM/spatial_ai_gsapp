// Agent behaviour over short runs of the full simulation (placeholder city). Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, FT } from '../src/sim/config.js';
import { buildWorld } from '../src/sim/world.js';
import { makeSim } from '../src/sim/sim.js';
import { K } from '../src/sim/knowledge.js';
import { closestOnSegment } from '../src/sim/geo.js';

const world = buildWorld(CONFIG);
const small = { ...CONFIG, population: { drones: 60, tours: 6, medical: 3 } };

test('agents start with no map and no rules', () => {
  const sim = makeSim(world, small);
  for (const a of sim.agents) {
    assert.equal(a.knowledge.bandRule, false);
    assert.equal(a.knowledge.seenCount, 0);
    assert.equal(a.knowledge.lanes.size + a.knowledge.noFly.size, 0);
  }
  // a drone knows only its own hub; a tour helicopter only its base heliport
  const d = sim.agents.find((a) => a.type === 'drone'); assert.equal(d.knowledge.pads.size, 1);
  const t = sim.agents.find((a) => a.type === 'tour'); assert.equal(t.knowledge.heliports.size, 1);
});

test('a 40-minute run: trips finish, knowledge and landmarks grow, rules get learned', () => {
  const sim = makeSim(world, small);
  sim.run(40 * 60);
  const s = sim.summary();
  assert.ok(s.types.drone.tripsDone > 30, `drone trips ${s.types.drone.tripsDone}`);
  assert.ok(s.types.tour.tripsDone >= 3, `tour trips ${s.types.tour.tripsDone}`);
  assert.ok(s.types.medical.tripsDone >= 1);
  assert.ok(s.types.drone.knowsBandRule > 20);
  assert.ok(s.types.tour.knowsBandRule === 6);
  const heli = sim.agents.filter((a) => a.type !== 'drone');
  assert.ok(heli.every((a) => a.knowledge.lanes.size > 0), 'every helicopter found part of the lane loop');
  assert.ok(sim.allLandmarks().some((l) => l.type === 'lane-entry'));
  assert.ok(sim.allLandmarks().some((l) => l.type === 'landing-site'));
  // the knowledge views have content
  const overlap = sim.knowledgeOverlap(); assert.ok(overlap.some((v) => v > 3));
  assert.ok(sim.paths.n > 1000);
  // drones that know the layer rule fly at a street layer or a corridor level, on their lane
  const L = CONFIG.droneNet;
  const levels = [L.avenueFt, L.streetFt, ...L.expressLevelsFt].map((f) => f * FT);
  const cruising = sim.agents.filter((a) => a.type === 'drone' && (a.mode === 'cruise' || a.mode === 'return') && a.knowledge.bandRule && Math.abs(a.z - a.altTarget) < 2 && a.route);
  assert.ok(cruising.length > 5);
  for (const a of cruising) {
    assert.ok(levels.some((z) => Math.abs(a.z - z) < 3), `drone at ${(a.z / FT).toFixed(0)} ft`);
    const e = a.route.edges[a.route.k], A = world.net.nodes[e.a], B = world.net.nodes[e.b];
    const [qx, qy] = closestOnSegment(a.x, a.y, A.x, A.y, B.x, B.y);
    assert.ok(Math.hypot(a.x - qx, a.y - qy) < L.keepRight + 6, 'a drone stays over its street or corridor');
  }
  assert.ok(sim.trips.some((t) => t.type === 'drone' && t.express), 'some trips use an express corridor');
});

test('helicopters plan along a known lane and never against it', () => {
  const sim = makeSim(world, { ...small, population: { drones: 0, tours: 1, medical: 0 } });
  const h = sim.agents[0];
  // give it knowledge of the whole Hudson northbound lane, then ask for a route south along the river
  const lane = world.lanes.find((l) => l.id === 'hudson-nb');
  for (const id of lane.nodes) h.knowledge.learnLaneNode(world.laneNodes[id]);
  h.knowledge.bandRule = true;
  h.cruiseZ = () => CONFIG.bands.heli.tour.cruise * FT;
  const [nx, ny] = lane.xy[lane.xy.length - 2];
  const [sx, sy] = lane.xy[1];
  Object.assign(h, { x: nx, y: ny, z: 244, airborne: true });
  // southbound along a northbound lane: the plan must leave the lane cells
  h.goal = { x: sx, y: sy, z: 0 }; h.mode = 'cruise'; h.needPlan = true; sim.planBudget = 5;
  sim.step();
  let against = 0;
  for (const c of h.planCells) if (h.knowledge.flags[c] & K.LANE && world.laneDirY[c] > 0.5) against++;
  const share = against / Math.max(1, h.planCells.size);
  assert.ok(share < 0.25, `share of plan on the northbound lane while flying south: ${share.toFixed(2)}`);
  // northbound: the plan uses the lane
  Object.assign(h, { x: sx, y: sy }); h.goal = { x: nx, y: ny, z: 0 }; h.needPlan = true; sim.planBudget = 5;
  sim.step();
  let on = 0; for (const c of h.planCells) if (h.knowledge.flags[c] & K.LANE) on++;
  assert.ok(on / h.planCells.size > 0.5, 'northbound plan follows the lane');
});

test('a medical helicopter gets the heliport pad before a waiting tour', () => {
  const sim = makeSim(world, { ...small, population: { drones: 0, tours: 2, medical: 1 } });
  const hp = world.heliportById['6N5'];
  const [t1, t2] = sim.agents.filter((a) => a.type === 'tour'); const m = sim.agents.find((a) => a.type === 'medical');
  for (let i = 0; i < hp.pads; i++) assert.ok(sim.requestSlot(hp, { id: 1000 + i }));
  assert.equal(sim.requestSlot(hp, t1), false);  // full: the tour waits first
  sim.time += 1;
  assert.equal(sim.requestSlot(hp, m, true), false); // the medical flight waits too
  sim.releaseSlot(hp, { id: 1000 });
  assert.equal(sim.requestSlot(hp, t1), false, 'tour must not take the pad while a medical flight waits');
  assert.equal(sim.requestSlot(hp, m, true), true);
  void t2;
});
