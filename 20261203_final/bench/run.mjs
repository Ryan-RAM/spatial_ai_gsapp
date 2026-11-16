// `npm run bench`: times each part of the simulation against the targets in CONFIG.targets
// (CLAUDE.md §3: measure first, then optimise). Results are printed as a table and saved to
// bench/results/<date>-<commit>.json so numbers before and after each optimisation are kept.
// Each benchmark is { name, target (ms or null), run() }; parts are added as the sim grows (M4.1).

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { CONFIG } from '../src/sim/config.js';
import { makeRng } from '../src/sim/rng.js';
import { loadWorld } from '../src/data/load-node.js';
import { castRay, EYE } from '../src/sim/los.js';
import { makeWalker } from '../src/sim/paths.js';
import { readFileSync } from 'node:fs';
import { makeStorm } from '../src/sim/storm.js';
import { makeRound, baselineBrains } from '../src/sim/round.js';

const storm = makeStorm(JSON.parse(readFileSync(new URL('../data/baked/storm-2016-01.json', import.meta.url), 'utf8')));

const world = loadWorld();

const benches = [
  {
    name: 'rng: 1e6 draws',
    target: null,
    run() { const r = makeRng(1); let s = 0; for (let i = 0; i < 1e6; i++) s += r.next(); return s; },
  },
  { name: 'load: world from data/baked', target: 300, run: () => loadWorld() },
  {
    name: 'los: 10,000 rays of 30 m',
    target: null,
    run() {
      const r = makeRng(5); let s = 0;
      for (let q = 0; q < 10000; q++) {
        const k = r.int(0, world.n - 1); const [x, y] = world.center(k); const a = r.next() * 2 * Math.PI;
        s += castRay(world, x, y, world.groundAt(x, y) + EYE, Math.sin(a), Math.cos(a), 0, 30);
      }
      return s;
    },
  },
  (() => {
    const w = makeWalker(world, 'survivor', CONFIG);
    const a = world.cellOf(-200, -150); const b = world.cellOf(330, -410); // the Lake shore -> exit E76
    return { name: 'd_T: A* across the area (survivor)', target: null, run: () => w.travelTime(a, b) };
  })(),
  (() => {
    const w = makeWalker(world, 'creature', CONFIG);
    return { name: 'd_T: Dijkstra field, all cells', target: null, run: () => w.field(world.cellOf(0, -200)) };
  })(),
  {
    name: 'round: 900 ticks headless (baseline brains)',
    target: CONFIG.targets.roundMs,
    run: () => makeRound(world, storm, { start: '2016-01-24T01:00', zone: 'azalea-west', seed: 11, brains: baselineBrains, config: { ...CONFIG, survivor: { ...CONFIG.survivor, warmthK: 0 } } }).run(),
  },
  // M6.2 adds: 'suite: 24 rounds parallel' (target CONFIG.targets.suiteMs)
];

function time(fn, reps = 5) {
  fn(); // warm up
  const ms = [];
  for (let i = 0; i < reps; i++) { const t = performance.now(); fn(); ms.push(performance.now() - t); }
  ms.sort((a, b) => a - b);
  return { median: ms[reps >> 1], min: ms[0] };
}

const commit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'nogit'; } })();
const rows = benches.map((b) => {
  const { median, min } = time(b.run);
  const ok = b.target == null ? '—' : median <= b.target ? 'ok' : 'SLOW';
  return { name: b.name, medianMs: +median.toFixed(2), minMs: +min.toFixed(2), targetMs: b.target, ok };
});

console.table(rows);
const date = new Date().toISOString().slice(0, 10);
const out = { date, commit, node: process.version, cpu: cpus()[0]?.model, cores: cpus().length, targets: CONFIG.targets, rows };
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL(`./results/${date}-${commit}.json`, import.meta.url), JSON.stringify(out, null, 2) + '\n');
if (rows.some((r) => r.ok === 'SLOW')) process.exitCode = 1;
