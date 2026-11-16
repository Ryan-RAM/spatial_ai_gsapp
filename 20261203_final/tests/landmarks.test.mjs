// M3.2: landmarks, stored as a chain of offsets, recognised from what the agent sees (§7.8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/sim/config.js';
import { loadWorld } from '../src/data/load-node.js';
import { makeKnowledge, look } from '../src/sim/knowledge.js';
import { addLandmark, recognise, resolveChain, confidenceAt, landmarksOf, TRANSIENT } from '../src/sim/landmarks.js';
import { applyPlan, emptyPlan } from '../src/sim/interventions.js';

const world = loadWorld();

function explore(kind, cells, range = 30) {
  const k = makeKnowledge(world, kind, CONFIG); let tick = 0;
  addLandmark(k, world, { type: 'start', cell: cells[0], tick: 0 });
  for (const c of cells) for (let h = 0; h < 360; h += 45) { const fresh = look(world, k, c, h, range, 100, tick); recognise(world, k, fresh, tick++, { tSec: tick * 2 }); }
  return k;
}
// a walk along the path graph through the Ramble: every 4th node of a long chain of edges
const nodes = world.paths.nodes.filter((n) => Math.hypot(n.x + 100, n.y + 200) < 120).map((n) => world.cellOf(n.x, n.y));

test('landmarks are stored relative to the one before; the chain decodes to the true positions', () => {
  const k = explore('creature', nodes);
  const lasting = k.landmarks.filter((l) => !TRANSIENT[l.type]);
  assert.ok(lasting.length > 15, `${lasting.length} landmarks`);
  const resolved = resolveChain(k);
  resolved.forEach((p, q) => { assert.ok(Math.abs(p.x - lasting[q].x) < 1e-6 && Math.abs(p.y - lasting[q].y) < 1e-6); });
  for (const l of lasting.slice(1)) assert.ok(lasting.some((m) => m.id === l.rel), `${l.id} refers to ${l.rel}`);
  assert.match(lasting[1].text, /^(\d+ m [EW](, \d+ m [NS])?|\d+ m [NS]|right at) of /);
});

test('recognised from the data: junctions, dead ends, bridges and named places of the Ramble', () => {
  const k = explore('creature', nodes);
  for (const t of ['junction', 'dead_end', 'named_place']) assert.ok(landmarksOf(k, t).length > 0, `no ${t}`);
  const names = landmarksOf(k, 'named_place').map((l) => l.note);
  assert.ok(names.some((n) => /Azalea|Gill|Ramble|Rustic|Stone Arch/.test(n)), names.join(', '));
  // no duplicates of one path node
  const refs = k.landmarks.filter((l) => l.ref).map((l) => l.ref);
  assert.equal(new Set(refs).size, refs.length);
});

test('lamps, shelters and signs of a plan become landmarks when seen', () => {
  const junction = world.paths.nodes.find((n) => n.degree >= 3 && Math.hypot(n.x + 60, n.y + 214) < 60);
  const e = world.paths.edges.find((ed) => ed.a === junction.id || ed.b === junction.id);
  const plan = { ...emptyPlan(), shelters: [junction.id], signs: [{ edge: e.id, s: 0 }], lamps: [{ edge: e.id, s: 1 }] };
  const layers = applyPlan(world, CONFIG, plan);
  const k = makeKnowledge(world, 'survivor', CONFIG);
  const cell = world.cellOf(junction.x, junction.y);
  for (let h = 0; h < 360; h += 45) recognise(world, k, look(world, k, cell, h, 20, 110, 0), 0, { layers });
  for (const t of ['shelter', 'sign', 'lamp']) assert.equal(landmarksOf(k, t).length, 1, t);
});

test('heard and sighting landmarks fade and only the latest few are kept; lasting ones do not fade', () => {
  const k = makeKnowledge(world, 'creature', CONFIG); const c = nodes[0];
  for (let q = 0; q < 8; q++) addLandmark(k, world, { type: 'heard', cell: c, tick: q, tSec: q * 10 });
  assert.equal(landmarksOf(k, 'heard').length, TRANSIENT.heard.keep);
  const h = landmarksOf(k, 'heard')[0];
  assert.ok(Math.abs(confidenceAt(h, h.tSec + 180) - 0.5) < 1e-9, 'half-life 3 minutes');
  const j = addLandmark(k, world, { type: 'junction', cell: c, tick: 9, tSec: 90 });
  assert.equal(confidenceAt(j, 10000), 1);
  assert.equal(j.rel, null, 'transient landmarks are not links in the chain');
});
