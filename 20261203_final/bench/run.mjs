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
import { makeKnowledge, look, plan as kPlan } from '../src/sim/knowledge.js';

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
  ...(() => {
    // a creature's map after a sweep of looks around the Ramble, then a plan to the nearest frontier
    const k = makeKnowledge(world, 'creature', CONFIG);
    const rr = makeRng(9);
    for (let q = 0; q < 300; q++) { const c = world.cellOf(-150 + rr.next() * 250, -300 + rr.next() * 250); if (c >= 0 && world.horizon.rowOf[c] >= 0) look(world, k, c, rr.next() * 360, 30, 100, q); }
    const from = world.cellOf(-60, -214);
    const walker = makeWalker(world, 'creature', CONFIG);
    // the original planner of 20261110_agents/src/sim/knowledge.js: an array-of-pairs heap and new
    // arrays on every call, on the same map
    const original = () => {
      const { W, H, n } = world; const dist = new Float64Array(n).fill(Infinity); const prev = new Int32Array(n).fill(-1);
      const open = (c) => k.seen[c] && CONFIG.coverSpeed.creature[k.seen[c] - 1] > 0;
      const heap = [[0, from]]; dist[from] = 0;
      const push = (d, c) => { heap.push([d, c]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
      const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1; const r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
      while (heap.length) { const [d, c] = pop(); if (d > dist[c]) continue; const x = c % W; const y = (c - x) / W;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const nx = x + dx; const ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const m = ny * W + nx; if (!open(m)) continue; if (dx && dy && (!open(y * W + nx) || !open(ny * W + x))) continue; const cc = dx && dy ? Math.SQRT2 : 1; if (d + cc < dist[m]) { dist[m] = d + cc; prev[m] = c; push(d + cc, m); } } }
      return dist;
    };
    return [
      { name: 'knowledge plan: original (20261110), whole own map', target: null, run: original },
      { name: 'knowledge plan: ported, to nearest frontier', target: null, run: () => kPlan(walker, k, from, { goal: (c) => k.frontier[c] === 1 }) },
      { name: 'knowledge plan: ported, whole own map', target: null, run: () => walker.field(from, { speedOf: (c) => (k.seen[c] ? CONFIG.coverSpeed.creature[k.seen[c] - 1] : 0) }) },
    ];
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
