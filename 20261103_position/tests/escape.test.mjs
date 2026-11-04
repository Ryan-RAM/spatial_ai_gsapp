// The escape game: moving, climbing, hiding, shooting, the case, winning and losing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/sim/config.js';
import { makeContext } from '../src/sim/context.js';
import { newRun, stepRun, stepCell, ladderPartner } from '../src/sim/escape.js';
import { playBotRun } from '../src/sim/bot.js';
import { nodeXYL } from '../src/sim/world.js';
import { coverAt } from '../src/sim/relations.js';

const ctx = makeContext(CONFIG);
const far = (g) => { // park the creature far away, out of the way
  const row = ctx.pf.row(g.player.node);
  g.creature.node = ctx.world.nodes.reduce((a, b) => (row[ctx.world.nodeIndex[b]] > row[ctx.world.nodeIndex[a]] ? b : a));
  g.creature.frozenLeft = 1e6;
};

test('a run starts on the west ground, far from the case, with the creature near the case', () => {
  for (let r = 1; r <= 15; r++) {
    const g = newRun(ctx, { round: r });
    assert.equal(nodeXYL(ctx.world, g.player.node).level, 0);
    assert.ok(ctx.pf.distance(g.caseItem.node, g.door) >= CONFIG.game.caseFromDoor);
    assert.ok(ctx.pf.distance(g.creature.node, g.caseItem.node) <= CONFIG.policeStartFromDiamond[1]);
    assert.equal(g.over, false);
  }
});

test('walking moves 2 cells in 5 ticks, running 4, and running uses stamina', () => {
  const g = newRun(ctx, { round: 2 });
  far(g);
  const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => {
    let n = g.player.node;
    for (let k = 0; k < 5; k++) { n = stepCell(ctx.world, n, dx, dy); if (n === null) return false; }
    return true;
  });
  assert.ok(dir, 'some straight corridor of 5 cells');
  const start = g.player.node;
  for (let k = 0; k < 5; k++) stepRun(g, { dx: dir[0], dy: dir[1] });
  assert.equal(ctx.pf.distance(start, g.player.node), 2);
  const g2 = newRun(ctx, { round: 2 });
  far(g2);
  const s0 = g2.player.stamina;
  const start2 = g2.player.node;
  for (let k = 0; k < 5; k++) stepRun(g2, { dx: dir[0], dy: dir[1], run: true });
  assert.equal(ctx.pf.distance(start2, g2.player.node), 4);
  assert.equal(g2.player.stamina, s0 - 5);
});

test('climbing a ladder takes a few ticks and lands on the other level', () => {
  const g = newRun(ctx, { round: 3 });
  far(g);
  const i = ctx.world.ladders[0];
  g.player.node = i;
  assert.equal(ladderPartner(ctx.world, i), ctx.world.N + i);
  stepRun(g, { climb: true });
  for (let k = 0; k < CONFIG.game.climbTicks; k++) stepRun(g, {});
  assert.equal(g.player.node, ctx.world.N + i);
});

test('hidden among cover when enough of the cells around are solid', () => {
  const g = newRun(ctx, { round: 4 });
  far(g);
  const spot = ctx.world.nodes.find((n) => n < ctx.world.N && coverAt(ctx.world, n).solid >= CONFIG.relations.coverMin);
  g.player.node = spot;
  stepRun(g, {});
  assert.equal(g.player.hidden, true);
  assert.ok(g.relations.position.some((r) => r.kind === 'among'));
});

test('a shot within range and in the clear freezes the creature for 3 seconds and costs a bullet', () => {
  const g = newRun(ctx, { round: 5 });
  // put the creature two cells away along a free line
  let n = g.player.node;
  let target = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const a = stepCell(ctx.world, n, dx, dy); const b = a !== null ? stepCell(ctx.world, a, dx, dy) : null;
    const c = b !== null ? stepCell(ctx.world, b, dx, dy) : null;
    if (c !== null) { target = c; break; }
  }
  g.creature.node = target;
  const ammo = g.player.ammo;
  stepRun(g, { shoot: true });
  assert.equal(g.player.ammo, ammo - 1);
  assert.equal(g.creature.mode, 'frozen');
  assert.equal(g.over, false, 'a frozen creature does not catch you');
  assert.ok(g.creature.frozenLeft >= CONFIG.game.freezeTicks - 2);
});

test('carrying the case to the hospital door wins; the creature next to you loses', () => {
  const g = newRun(ctx, { round: 6 });
  far(g);
  g.player.node = g.caseItem.node;
  stepRun(g, {});
  assert.equal(g.player.carrying, true);
  assert.ok(g.alarmLeft > 0);
  g.player.node = g.door;
  stepRun(g, {});
  assert.equal(g.result, 'win');

  const h = newRun(ctx, { round: 7 });
  let next = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { next = stepCell(ctx.world, h.player.node, dx, dy); if (next !== null) break; }
  h.creature.node = next;
  stepRun(h, {});
  assert.equal(h.result, 'lose');
});

test('every run ends, and the scripted player wins some and loses some on normal', () => {
  let wins = 0;
  for (let r = 1; r <= 30; r++) {
    const g = playBotRun(ctx, { round: r });
    assert.ok(g.over);
    if (g.result === 'win') wins++;
  }
  assert.ok(wins >= 6 && wins <= 24, `${wins} of 30`);
});
