// Headless run: builds the world (real data if data/processed/ has it, else the placeholder),
// simulates, and prints the performance summary. Usage: node tests/run_sim.mjs [minutes] [out.json]
import { writeFileSync } from 'node:fs';
import { CONFIG } from '../src/sim/config.js';
import { buildWorld } from '../src/sim/world.js';
import { makeSim } from '../src/sim/sim.js';
import { loadDataNode } from './helpers.mjs';

const minutes = Number(process.argv[2] || 60);
const t0 = Date.now();
const world = buildWorld(CONFIG, loadDataNode(CONFIG));
const t1 = Date.now();
const sim = makeSim(world);
let lastLog = 0;
sim.run(minutes * 60, (s) => {
  if (s.time - lastLog >= 600) { lastLog = s.time; console.error(`  ${Math.round(s.time / 60)} min simulated, ${((Date.now() - t1) / 1000).toFixed(1)} s`); }
});
const out = { world: { source: world.source, grid: [world.W, world.H], buildings: world.data.buildings.length, pads: world.pads.length, buildSeconds: (t1 - t0) / 1000 }, ...sim.summary() };
console.log(JSON.stringify(out, null, 1));
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
