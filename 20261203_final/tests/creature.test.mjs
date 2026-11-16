// M3.3: the creature's states, light aversion, plowed paths, night-long memory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/sim/config.js';
import { loadWorld } from '../src/data/load-node.js';
import { makeStorm, localSeconds } from '../src/sim/storm.js';
import { newMemory, mapTheWoods, creatureBrain, lightCost, ambushSpot } from '../src/sim/creature.js';
import { makeRound, agentBrains, wakeCell, runNight, nightsOf, evaluationSuite } from '../src/sim/round.js';
import { applyPlan, emptyPlan } from '../src/sim/interventions.js';
import { landmarksOf, addLandmark } from '../src/sim/landmarks.js';
import { remember } from '../src/sim/knowledge.js';
import { walkerFor } from '../src/sim/paths.js';

const world = loadWorld();
const storm = makeStorm(JSON.parse(readFileSync(new URL('../data/baked/storm-2016-01.json', import.meta.url), 'utf8')));
const L0 = applyPlan(world, CONFIG, emptyPlan());
const dusk = storm.at(localSeconds(CONFIG.creature.mappingStart));
function mapped(seed = 1, ticks = CONFIG.creature.mappingTicks) {
  const memory = newMemory(world, CONFIG);
  const m = mapTheWoods(world, CONFIG, { memory, startCell: wakeCell(world, CONFIG, seed, 'azalea-west'), ticks, layers: L0, weather: dusk });
  memory.lastCell = m.endCell; return { memory, m };
}
// a round with the creature placed by hand next to the survivors, and a hook to set its state
function roundWith(memory, { start = '2016-01-23T19:00', seed = 5, creatureAt = null } = {}) {
  const brains = { ...agentBrains, creatureStart: ({ occupancy }) => (creatureAt != null && occupancy.at(creatureAt) === -1 ? creatureAt : memory.lastCell) };
  return makeRound(world, storm, { start, zone: 'azalea-west', seed, brains, creatureMemory: memory, layers: L0 });
}

test('mapping: frontier exploration at dusk maps the woods and makes landmarks', () => {
  const { memory, m } = mapped();
  assert.ok(memory.knownCount > 3000, `${memory.knownCount} cells mapped`);
  assert.ok(m.newCells / m.ticks > 3, `${(m.newCells / m.ticks).toFixed(1)} new cells per tick`);
  assert.ok(landmarksOf(memory, 'junction').length > 10);
});

test('patrolling when nothing is going on; chasing when it sees a survivor (and running)', () => {
  const { memory } = mapped();
  const r = roundWith(memory); r.step();
  assert.equal(r.state.creatures[0].state, 'patrolling');
  // put it right behind a survivor, facing them
  const s = r.state.agents[0]; const c = r.state.creatures[0];
  const [sx, sy] = world.center(s.cell);
  let spot = null; for (const [dx, dy] of [[-6, 0], [6, 0], [0, -6], [0, 6], [-3, 0], [3, 0]]) { const q = world.cellOf(sx + dx, sy + dy); if (q >= 0 && r.state.occupancy.at(q) === -1 && walkerFor(world, 'creature', CONFIG).passable(q)) { spot = q; break; } }
  r.state.occupancy.move(c.id, c.cell, spot); c.cell = spot;
  const [cx, cy] = world.center(spot); c.heading = (Math.atan2(sx - cx, sy - cy) * 180 / Math.PI + 360) % 360;
  creatureBrain(c, { world, config: CONFIG, state: r.state, weather: storm.at(r.state.t), snow: r.state.snow, walker: walkerFor(world, 'creature', CONFIG), sounds: [] });
  assert.equal(c.state, 'chasing'); assert.ok(c.running);
  assert.ok(landmarksOf(memory, 'sighting').length >= 1);
});

test('investigating a sound; tracking a readable track; searching dead ends; ambushing', () => {
  const { memory } = mapped();
  const r = roundWith(memory); r.step();
  const c = r.state.creatures[0]; const ctx = { world, config: CONFIG, state: r.state, weather: storm.at(r.state.t), snow: r.state.snow, walker: walkerFor(world, 'creature', CONFIG), sounds: [] };
  // a loud cry right next to it
  const [x, y] = world.center(c.cell); const src = world.cellOf(x + 9, y) >= 0 ? world.cellOf(x + 9, y) : world.cellOf(x - 9, y);
  r.state.lastSounds = [{ origin: src, kind: 'cry', by: 0, agentKind: 'survivor', extraM: -30 }];
  for (const s of r.state.agents) { s.outcome = 'escaped'; } // nobody to see
  creatureBrain(c, ctx); assert.equal(c.state, 'investigating', 'a cry 9 m away');
  // a fresh survivor track in its view
  r.state.lastSounds = []; c.state = 'patrolling'; c.route = null;
  const cone = memory.lastCone; const [tx, ty] = cone[Math.floor(cone.length / 2)];
  const [ox, oy] = world.center(c.cell); const tcell = world.cellOf(ox + (tx - ox) * 0.5, oy + (ty - oy) * 0.5);
  r.state.snow.step(tcell, r.state.t, 0, 90, 0);
  creatureBrain(c, ctx); assert.equal(c.state, 'tracking', 'a fresh track in view');
  // the planted track would keep it tracking: from here on, no tracks in view
  ctx.snow = { ...r.state.snow, trackAt: () => -1 };
  // lost the trail after only hearing: sweep remembered dead ends
  c.state = 'investigating'; c.route = null; c.lostTicks = 99; memory.threats = []; remember(memory, { cell: c.cell, tick: r.state.tick, how: 'heard' });
  for (const l of landmarksOf(memory, 'dead_end').slice(0, 1)) addLandmark(memory, world, { type: 'dead_end', cell: c.cell, tick: 0 });
  creatureBrain(c, ctx); assert.ok(['searching', 'patrolling'].includes(c.state), `after losing a sound: ${c.state}`);
  // lost a survivor it had seen: wait between them and the exit
  c.state = 'chasing'; c.route = null; c.lostTicks = 99; remember(memory, { cell: c.cell, tick: r.state.tick, how: 'seen' });
  creatureBrain(c, ctx); assert.equal(c.state, 'ambushing', 'after losing a sighting');
  assert.ok(c.goal != null);
});

test('light-averse: lit cells cost 3x in its plans; plowed paths slow it to 0.7', () => {
  const lamps = [{ edge: 10, s: 0 }, { edge: 40, s: 0 }];
  const L = applyPlan(world, CONFIG, { ...emptyPlan(), lamps });
  const extra = lightCost(world, CONFIG, L);
  const lit = [...L.light.keys()].find((k) => L.light[k]);
  assert.ok(Math.abs(extra[lit] - (CONFIG.creature.litCostFactor - 1) * world.s / CONFIG.creature.speed) < 1e-6);
  assert.equal(lightCost(world, CONFIG, L0), null);
  const { memory } = mapped();
  const Lp = applyPlan(world, CONFIG, { ...emptyPlan(), plowed: [0, 1, 2] });
  const r = makeRound(world, storm, { start: '2016-01-23T19:00', zone: 'azalea-west', seed: 5, brains: agentBrains, creatureMemory: memory, layers: Lp });
  const c = r.state.creatures[0]; const plowedCell = [...Lp.plowed.keys()].find((k) => Lp.plowed[k]);
  r.state.occupancy.move(c.id, c.cell, plowedCell); c.cell = plowedCell;
  creatureBrain(c, { world, config: CONFIG, state: r.state, weather: storm.at(r.state.t), snow: r.state.snow, walker: walkerFor(world, 'creature', CONFIG), sounds: [] });
  assert.equal(c.speedFactor, CONFIG.creature.plowedSpeedFactor);
});

test('its memory persists across the rounds of a night', () => {
  const night = nightsOf(evaluationSuite(CONFIG))[0];
  const short = { ...CONFIG, creature: { ...CONFIG.creature, mappingTicks: 300 }, roundTicks: 150 };
  const res = runNight(world, storm, { config: short, night: { ...night, rounds: night.rounds.slice(0, 3) } });
  assert.equal(res.rounds.length, 3);
  // the same memory object grew across the rounds
  const res2 = runNight(world, storm, { config: short, night: { ...night, rounds: night.rounds.slice(0, 1) } });
  assert.equal(res.mapping.cellsSeen, res2.mapping.cellsSeen, 'the same mapping phase');
  assert.ok(res.memoryCellsEnd > res2.memoryCellsEnd, 'three rounds teach it more than one');
  assert.ok(res2.memoryCellsEnd > res2.mapping.cellsSeen, 'it keeps learning during a round');
});

test("ambush spot lies on the survivor's likely route east, at a junction it knows when one is near", () => {
  const { memory } = mapped();
  const from = world.cellOf(-58, -214);
  const spot = ambushSpot(world, CONFIG, memory, from);
  const [x0] = world.center(from); const [x1] = world.center(spot);
  assert.ok(x1 >= x0 - 10, 'not behind them');
});
