// Plays many runs with the scripted player and reports the win rate per difficulty.
// Usage: node tests/balance.mjs [runs per map] [maps] [skill]

import { CONFIG } from '../src/sim/config.js';
import { makeContext } from '../src/sim/context.js';
import { playBotRun } from '../src/sim/bot.js';

const perMap = Number(process.argv[2] || 40);
const maps = Number(process.argv[3] || 6);
const skill = Number(process.argv[4] || 1);
const ctxs = Array.from({ length: maps }, (_, m) => makeContext(CONFIG, CONFIG.seed + m));
const out = {};
for (const difficulty of Object.keys(CONFIG.game.difficulty)) {
  let wins = 0; let total = 0; let ticks = 0; let shots = 0; const why = {};
  for (const ctx of ctxs) {
    for (let r = 1; r <= perMap; r++) {
      const g = playBotRun(ctx, { difficulty, round: r, skill });
      total++; ticks += g.step; shots += g.player.shots;
      if (g.result === 'win') wins++;
      const last = g.events[g.events.length - 1].text;
      why[last] = (why[last] || 0) + 1;
    }
  }
  out[difficulty] = { winRate: +(wins / total).toFixed(3), avgSeconds: +((ticks / total) * CONFIG.game.tickMs / 1000).toFixed(1), shotsPerRun: +(shots / total).toFixed(2), endings: why };
}
console.log(JSON.stringify(out, null, 1));
