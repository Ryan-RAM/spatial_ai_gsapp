// `npm run bench`: times each part of the simulation against the targets in CONFIG.targets
// (CLAUDE.md §3: measure first, then optimise). Results are printed as a table and saved to
// bench/results/<date>-<commit>.json so numbers before and after each optimisation are kept.
// Each benchmark is { name, target (ms or null), run() }; parts are added as the sim grows (M4.1).

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { CONFIG } from '../src/sim/config.js';
import { makeRng } from '../src/sim/rng.js';

const benches = [
  {
    name: 'rng: 1e6 draws',
    target: null,
    run() { const r = makeRng(1); let s = 0; for (let i = 0; i < 1e6; i++) s += r.next(); return s; },
  },
  // M2.9 adds: 'round: 900 ticks headless' (target CONFIG.targets.roundMs)
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
