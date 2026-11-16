// Builds the gallery of generated environments (ROADMAP M8.4): candidate plans (the presets,
// variations that isolate one intervention, and plans evolved by the automatic mode for each side),
// each scored on the 24-round suite, with heat maps of where survivors and the creature went and
// where survivors were caught or taken by the cold, on the first night (6 rounds).
//   node tools/build-gallery.mjs            -> data/gallery.json (deterministic: fixed seeds)
// The stories in data/gallery-stories.json are written by hand from the numbers this prints.

import { readFileSync, writeFileSync } from 'node:fs';
import { loadWorld } from '../src/data/load-node.js';
import { CONFIG } from '../src/sim/config.js';
import { makeStorm, localSeconds } from '../src/sim/storm.js';
import { makeRound, agentBrains, nightsOf, evaluationSuite, wakeCell } from '../src/sim/round.js';
import { newMemory, mapTheWoods } from '../src/sim/creature.js';
import { applyPlan, emptyPlan, clonePlan, checkPlan, routesExist } from '../src/sim/interventions.js';
import { presets, encodePlan, nearestNode, pathAdjacency } from '../src/sim/presets.js';
import { evaluatePlan } from '../src/sim/evaluate.js';
import { mutate } from '../src/sim/mutate.js';
import { makeRng } from '../src/sim/rng.js';

const root = new URL('../', import.meta.url);
const world = await loadWorld({ withHorizon: true });
const storm = makeStorm(JSON.parse(readFileSync(new URL('data/baked/storm-2016-01.json', root))));
const P = Object.fromEntries(presets(world, CONFIG).map((p) => [p.id, p.plan]));
const score = (plan, config = CONFIG) => evaluatePlan(world, storm, plan, config).metrics;

// --- candidates
const cands = [];
const add = (id, title, plan, how) => { const e = checkPlan(world, CONFIG, plan); if (e.length) throw new Error(`${id}: ${e.join('; ')}`); cands.push({ id, title, plan, how }); };
add('empty', 'The park as it was', P.empty, 'no interventions');
add('plan-b', 'Plan B', P['plan-b'], 'preset (§15)');
add('lamp-corridor', 'The lamp corridor', P['lamp-corridor'], 'preset');
add('arch-route', 'The other route', P['arch-route'], 'preset');
{ const p = clonePlan(P['plan-b']); p.lamps = []; add('plan-b-dark', 'Plan B in the dark', p, 'Plan B without its 3 lamps'); }
{ const p = clonePlan(P['plan-b']); p.lamps = P['lamp-corridor'].lamps.slice(); add('plan-b-bright', 'Plan B, lit up', p, 'Plan B with all 12 lamps along the route'); }
{ // two warming shelters at the junctions nearest the spawn zones, nothing else
  const p = emptyPlan(); const J = world.paths.nodes.filter((n) => n.degree >= 3);
  for (const z of CONFIG.spawnZones) { const j = J.reduce((a, b) => (Math.hypot(b.x - z.x, b.y - z.y) < Math.hypot(a.x - z.x, a.y - z.y) ? b : a)); if (!p.shelters.includes(j.id)) p.shelters.push(j.id); }
  add('shelters', 'Two warm rooms', p, 'two warming shelters next to where people start, nothing else');
}
{ // the funnel: Plan B, and every side branch at the junctions along its route closed (as long as I2 holds)
  const p = clonePlan(P['plan-b']); const on = new Set(p.plowed); const adj = pathAdjacency(world);
  const nodes = new Set(p.plowed.flatMap((e) => [world.paths.edges[e].a, world.paths.edges[e].b]));
  for (const nd of nodes) for (const e of world.paths.edges.filter((x) => (x.a === nd || x.b === nd) && !on.has(x.id))) {
    const q = clonePlan(p); q.closed.push(e.id); if (!checkPlan(world, CONFIG, q).length && routesExist(world, CONFIG, q)) p.closed.push(e.id);
  }
  void adj; add('funnel', 'The funnel', p, `Plan B with ${p.closed.length} side paths closed along the route`);
}
// evolved, for each side: (1+1)-ES from Plan B, 30 epochs, fixed seed
for (const [side, perspective] of [['survivors', 'survivor'], ['creature', 'creature']]) {
  const cfg = { ...CONFIG, perspective }; const key = perspective === 'creature' ? 'Fprime' : 'F';
  const rng = makeRng(CONFIG.seed ^ (perspective === 'creature' ? 0xc0ffee : 0xbeef)); let best = P['plan-b']; let bs = score(best, cfg)[key];
  for (let e = 1; e <= 30; e++) { const m = mutate(world, cfg, best, rng); if (!m) continue; const s = score(m.plan, cfg)[key]; if (s >= bs) { best = m.plan; bs = s; } process.stdout.write(`\r${side} epoch ${e}: ${bs.toFixed(3)}   `); }
  console.log();
  add(`evolved-${side}`, side === 'survivors' ? 'What the optimiser built' : 'The park the creature would build', best, `30 epochs of the automatic mode from Plan B, scoring for the ${side}`);
}

// --- heat maps on the first night
function heat(plan) {
  const night = nightsOf(evaluationSuite(CONFIG))[0]; const L = applyPlan(world, CONFIG, plan);
  const memory = newMemory(world, CONFIG);
  const mm = mapTheWoods(world, CONFIG, { memory, startCell: wakeCell(world, CONFIG, night.seed, night.zone), ticks: CONFIG.creature.mappingTicks, layers: L, weather: storm.at(localSeconds(CONFIG.creature.mappingStart)) });
  memory.lastCell = mm.endCell;
  const sv = new Map(); const cr = new Map(); const ends = [];
  const inc = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const r of night.rounds) {
    const rd = makeRound(world, storm, { plan, layers: L, start: r.start, zone: r.zone, seed: r.seed, brains: agentBrains, creatureMemory: memory });
    while (!rd.state.done) { rd.step(); for (const a of rd.state.agents) if (!a.outcome) inc(sv, a.cell); for (const c of rd.state.creatures) inc(cr, c.cell); }
    for (const a of rd.state.agents) if (a.outcome) ends.push([a.cell, { escaped: 'e', caught: 'c', collapsed: 'k', lost: 'l' }[a.outcome]]);
  }
  const pack = (m) => [...m].sort((a, b) => a[0] - b[0]).flat();
  return { survivor: pack(sv), creature: pack(cr), ends };
}

const out = [];
for (const c of cands) {
  const m = score(c.plan);
  const pct = (v) => Math.round(100 * v);
  console.log(`${c.id.padEnd(18)} F ${m.F.toFixed(3)} F' ${m.Fprime.toFixed(3)} esc ${pct(m.escapeRate)} caught ${pct(m.catchRate)} cold ${pct(m.collapseRate)} lost ${pct(m.lostRate)} warmth ${m.meanLowestWarmth.toFixed(0)} seen ${m.meanTimesSeen.toFixed(2)} close ${m.meanMinutesClose.toFixed(1)}min cost ${Math.round(m.cost)} | ${c.plan.plowed.length}p ${c.plan.closed.length}c ${c.plan.lamps.length}l ${c.plan.shelters.length}s ${c.plan.signs.length}g`);
  const keep = ['F', 'Fprime', 'escapeRate', 'catchRate', 'collapseRate', 'lostRate', 'meanLowestWarmth', 'meanTimesSeen', 'meanMinutesClose', 'meanEscapeTimeMin', 'meanTimeToCatchMin', 'cost'];
  out.push({ id: c.id, title: c.title, how: c.how, plan: encodePlan(c.plan), metrics: Object.fromEntries(keep.map((k) => [k, m[k] == null ? null : +m[k].toFixed(4)])), heat: heat(c.plan) });
}
writeFileSync(new URL('data/gallery.json', root), JSON.stringify({ about: 'Generated environments (ROADMAP M8.4): tools/build-gallery.mjs. heat.survivor/creature: flat [cell, ticks, ...] over the first night (6 rounds); ends: [cell, e escaped | c caught | k taken by the cold | l lost].', world: { W: world.W, H: world.H }, environments: out }));
console.log('wrote data/gallery.json');
