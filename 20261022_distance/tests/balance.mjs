// Plays many rounds without rendering and reports the police win rate and average round length.
// Usage: node tests/balance.mjs [rounds] [maps]

import { CONFIG } from '../src/sim/config.js';
import { makeContext } from '../src/sim/context.js';
import { playRound } from '../src/sim/game.js';

const rounds = Number(process.argv[2] || 320);
const maps = Number(process.argv[3] || 8);
const perMap = Math.ceil(rounds / maps);

let police = 0;
let total = 0;
let steps = 0;
let policeSteps = 0;
const rows = [];
const t0 = Date.now();
for (let m = 0; m < maps; m++) {
  const seed = CONFIG.seed + m;
  const ctx = makeContext(CONFIG, seed);
  let wins = 0;
  for (let r = 1; r <= perMap; r++) {
    const res = playRound(ctx, r);
    total++;
    steps += res.steps;
    if (res.winner === 'police') { police++; wins++; policeSteps += res.steps; }
  }
  rows.push({ seed, rounds: perMap, policeWinRate: +(wins / perMap).toFixed(3) });
}
console.table(rows);
console.log(JSON.stringify({
  rounds: total,
  maps,
  policeWins: police,
  policeWinRate: +(police / total).toFixed(3),
  averageSteps: +(steps / total).toFixed(1),
  averageStepsWhenPoliceWins: police ? +(policeSteps / police).toFixed(1) : null,
  seconds: (Date.now() - t0) / 1000,
}));
