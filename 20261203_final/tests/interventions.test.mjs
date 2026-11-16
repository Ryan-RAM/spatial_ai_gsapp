// M2.8: the intervention plan, rules I1-I3, and local recomputation of light.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/sim/config.js';
import { loadWorld } from '../src/data/load-node.js';
import {
  emptyPlan, serializePlan, deserializePlan, planCost, fullBudgetCost, checkPlan, applyPlan, moveLamp,
  routesExist, isValidPlan, spawnCells, edgeCells, pointOnEdge,
} from '../src/sim/interventions.js';

const world = loadWorld();
const E = world.paths.edges;
const junctions = world.paths.nodes.filter((n) => n.degree >= 3).map((n) => n.id);
const longest = [...E].sort((a, b) => b.len - a.len).map((e) => e.id);

test('spawn zones lie in the Ramble on walkable ground; the empty plan is valid (I2 on the base map)', () => {
  for (const z of CONFIG.spawnZones) assert.ok(spawnCells(world, CONFIG, z.id).length >= 10, z.id);
  assert.ok(isValidPlan(world, CONFIG, emptyPlan()));
});

test('serialize -> deserialize round trip', () => {
  const p = { plowed: [1, 2], closed: [5], lamps: [{ edge: 3, s: 4.5 }], shelters: [junctions[0]], signs: [{ edge: 7, s: 1 }] };
  assert.deepEqual(deserializePlan(serializePlan(p)), p);
});

test('I1: the budget, and the cost of a plan', () => {
  assert.equal(fullBudgetCost(CONFIG), 5300);
  const p = emptyPlan(); let m = 0;
  for (const e of longest) { if (m + E[e].len > 1200) continue; p.plowed.push(e); m += E[e].len; }
  assert.deepEqual(checkPlan(world, CONFIG, p), []);
  p.lamps = Array.from({ length: 12 }, (_, q) => ({ edge: q, s: 0 })); p.shelters = junctions.slice(0, 2); p.signs = Array.from({ length: 6 }, (_, q) => ({ edge: q, s: 0 }));
  assert.deepEqual(checkPlan(world, CONFIG, p), []);
  assert.ok(Math.abs(planCost(world, CONFIG, p).total - (m + 12 * 150 + 2 * 1000 + 6 * 50)) < 1e-6);
  const over = { ...p, lamps: [...p.lamps, { edge: 0, s: 0 }] };
  assert.match(checkPlan(world, CONFIG, over)[0], /^I1: 13 lamps/);
  const tooLong = { ...emptyPlan(), plowed: longest.slice(0, 40) };
  assert.ok(checkPlan(world, CONFIG, tooLong).some((e) => e.startsWith('I1') && e.includes('plowed')));
});

test('I3: only where the park could put them', () => {
  const nonJunction = world.paths.nodes.find((n) => n.degree === 1).id;
  assert.ok(checkPlan(world, CONFIG, { ...emptyPlan(), shelters: [nonJunction] })[0].startsWith('I3'));
  assert.ok(checkPlan(world, CONFIG, { ...emptyPlan(), lamps: [{ edge: 0, s: E[0].len + 5 }] })[0].startsWith('I3'));
  assert.ok(checkPlan(world, CONFIG, { ...emptyPlan(), plowed: [9999] })[0].startsWith('I3'));
  assert.ok(checkPlan(world, CONFIG, { ...emptyPlan(), plowed: [3], closed: [3] }).some((e) => e.startsWith('I3')));
});

test('I2: closing every path out of the Ramble breaks the plan', () => {
  // close every edge with a cell within 10 m of the exits' side of the area: no way out
  const ec = edgeCells(world);
  const exitsNear = world.paths.exits;
  const cut = E.filter((e) => ec[e.id].some((k) => { const [x, y] = world.center(k); return exitsNear.some((x0) => Math.hypot(x - x0.x, y - x0.y) < 25); })).map((e) => e.id);
  const plan = { ...emptyPlan(), closed: cut };
  // the exits sit on paths, so closing them leaves no passable exit cell
  assert.equal(routesExist(world, CONFIG, plan), false);
  assert.equal(routesExist(world, CONFIG, { ...emptyPlan(), closed: [longest[0]] }), true, 'one closure elsewhere leaves a way out');
});

test('lamps light the cells they can see; moving one recomputes only its neighbourhood, same as from scratch', () => {
  const lamps = [{ edge: longest[0], s: 10 }, { edge: longest[3], s: 5 }, { edge: longest[8], s: 2 }];
  const layers = applyPlan(world, CONFIG, { ...emptyPlan(), lamps });
  const lit = layers.light.reduce((s, v) => s + (v > 0), 0);
  assert.ok(lit > 20 && lit < 3 * Math.PI * 16 + 10, `${lit} lit cells`);
  const [lx, ly] = pointOnEdge(world, lamps[0].edge, lamps[0].s);
  assert.ok(layers.light[world.cellOf(lx, ly)] >= 1, 'the lamp\'s own cell is lit');
  const to = { edge: longest[12], s: 3 };
  moveLamp(world, CONFIG, layers, 0, to);
  const fresh = applyPlan(world, CONFIG, { ...emptyPlan(), lamps: [to, lamps[1], lamps[2]] });
  assert.deepEqual(layers.light, fresh.light);
  assert.deepEqual([...layers.lamp].filter((v) => v >= 0).sort(), [...fresh.lamp].filter((v) => v >= 0).sort());
});

test('applying a plan marks plowed, closed, shelter and sign cells', () => {
  const p = { ...emptyPlan(), plowed: [longest[0]], closed: [longest[1]], shelters: [junctions[0]], signs: [{ edge: longest[2], s: 1 }] };
  const L = applyPlan(world, CONFIG, p); const ec = edgeCells(world);
  assert.ok(ec[longest[0]].every((k) => L.plowed[k] === 1));
  assert.ok(ec[longest[1]].every((k) => L.closed[k] === 1));
  assert.equal(L.shelter.filter((v) => v === 0).length, 1);
  assert.equal(L.sign.filter((v) => v === 0).length, 1);
});
