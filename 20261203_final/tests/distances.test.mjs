// M2.4: the four distances and their axioms (semantic model §6, §15 item 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/sim/config.js';
import { COVER } from '../src/sim/cover.js';
import { loadWorld } from '../src/data/load-node.js';
import { makeStorm, localSeconds } from '../src/sim/storm.js';
import { makeMetrics, checkAxioms, acoustic, hearingThreshold } from '../src/sim/metrics.js';
import { makeWalker, toblerFactor } from '../src/sim/paths.js';
import { makeTestWorld } from './helpers.mjs';

const world = loadWorld({ withFingerprints: true });
const M = makeMetrics(world, CONFIG);
const storm = makeStorm(JSON.parse(readFileSync(new URL('../data/baked/storm-2016-01.json', import.meta.url), 'utf8')));
const at19 = storm.at(localSeconds('2016-01-23T19:00'));
const survivorCells = []; for (let k = 0; k < world.n; k++) if (CONFIG.coverSpeed.survivor[world.cover[k]] > 0) survivorCells.push(k);
// a compact neighbourhood for the axiom checks (pairs within the Ramble, so routes exist)
const near = survivorCells.filter((k) => { const [x, y] = world.center(k); return Math.hypot(x + 80, y + 200) < 90; });

test('Tobler: 1 on the flat, fastest gently downhill, asymmetric', () => {
  assert.ok(Math.abs(toblerFactor(0) - 1) < 1e-12);
  assert.ok(toblerFactor(-0.05) > toblerFactor(0) && toblerFactor(-0.05) > toblerFactor(-0.1));
  assert.ok(toblerFactor(-0.2) > toblerFactor(0.2), 'down a slope is faster than up it');
});

test('d_T: on a toy slope, up takes longer than down; snow slows the survivor far more than the creature', () => {
  const rows = ['==========', '==========', '=========='];
  const w = makeTestWorld(rows, { z: (i) => i * 0.6 }); // 20 % slope toward the east
  const sv = makeWalker(w, 'survivor', CONFIG); const cr = makeWalker(w, 'creature', CONFIG);
  const a = 1 * 10 + 0; const b = 1 * 10 + 9;
  // Tobler at +-20 %: 0.50 up, 0.71 down -> up takes about 1.4 x as long
  assert.ok(sv.travelTime(a, b) > sv.travelTime(b, a) * 1.35);
  const deep = new Float32Array(w.n).fill(66); // 66 cm, §15
  const fs = sv.travelTime(b, a) / sv.travelTime(b, a, { snow: deep });
  const fc = cr.travelTime(b, a) / cr.travelTime(b, a, { snow: deep });
  assert.ok(Math.abs(fs - 1 / (1 + 66 / 25)) < 0.01, `survivor f_snow ${fs}`);       // ~0.27 (§15)
  assert.ok(Math.abs(fc - (1 / (1 + 66 / 25)) ** 0.3) < 0.01, `creature f_snow ${fc}`);
});

test('d_T: kinds have their own graphs: the creature crosses a thicket the survivor must go around', () => {
  const rows = ['====t====', '====t====', '====t====', '========='];
  const w = makeTestWorld(rows);
  const sv = makeWalker(w, 'survivor', CONFIG); const cr = makeWalker(w, 'creature', CONFIG);
  const a = 0; const b = 8;
  assert.ok(sv.route(a, b).cells.every((k) => w.cover[k] !== COVER.THICKET));
  assert.ok(cr.travelTime(a, b) < sv.travelTime(a, b) * 0.75, 'straight through vs around');
  assert.equal(makeWalker(makeTestWorld(['==~~==']), 'survivor', CONFIG).travelTime(0, 5), Infinity, 'water is impassable');
});

test('d_T: no cutting a blocked corner', () => {
  const w = makeTestWorld(['=#', '#=']);
  assert.equal(makeWalker(w, 'survivor', CONFIG).travelTime(0, 3), Infinity);
});

test('d_A: walls and trunks muffle; falling snow absorbs; symmetric without wind', () => {
  const open = makeTestWorld(['..........']); const wall = makeTestWorld(['....#.....'], { wallH: 3 });
  const trees = makeTestWorld(['..........'], { trees: [{ x: 15, y: 1.5, h: 12, trunk: 0.4 }] });
  const dE = acoustic(open, CONFIG, 0, 9);
  assert.ok(Math.abs(dE - 27) < 1e-6);
  assert.ok(acoustic(wall, CONFIG, 0, 9) > dE + 15, 'a 3 m wall adds about 3 m x 6');
  assert.ok(Math.abs(acoustic(trees, CONFIG, 0, 9) - (dE + CONFIG.muffling.trunk)) < 1e-6);
  const calmSnow = { windMs: 0, windToDeg: 0, snowRateCmH: 2, gustKt: 0 };
  assert.ok(Math.abs(acoustic(open, CONFIG, 0, 9, calmSnow) - dE * 1.1) < 1e-6, 'm_snow = 0.5 x 2 x 27 / 10');
  assert.equal(acoustic(open, CONFIG, 0, 9, calmSnow), acoustic(open, CONFIG, 9, 0, calmSnow));
});

test('§15 item 1: in the north wind, the creature to the south hears the survivors before they hear it', () => {
  // survivors just west of Azalea Pond, the creature 30 m south of them
  const az = world.places.find((p) => p.id === 'azalea-pond');
  const s = world.cellOf(az.x - 20, az.y); const c = world.cellOf(az.x - 20, az.y - 30);
  assert.ok(at19.windFromDeg >= 350 || at19.windFromDeg <= 20);
  const sToC = M.acoustic(s, c, at19); const cToS = M.acoustic(c, s, at19);
  assert.ok(sToC < cToS, `survivors -> creature ${sToC.toFixed(1)} m < creature -> survivors ${cToS.toFixed(1)} m`);
  // gusts of 21-22 kt mask sound: thresholds drop by about 43 %
  assert.ok(Math.abs(hearingThreshold(CONFIG, 45, at19) - 45 * (1 - 0.02 * at19.gustKt)) < 1e-9);
});

test('axioms on the real place: d_E a metric; d_A asymmetric only with wind; d_T asymmetric; d_V a pseudometric', () => {
  const calm = { ...at19, windMs: 0 };
  const E = checkAxioms(M.euclidean, near, { triples: 200 });
  assert.equal(E.asymmetric + E.triangle + E.negative + E.selfNonZero, 0);
  const Acalm = checkAxioms((a, b) => M.acoustic(a, b, calm), near, { triples: 120 });
  assert.equal(Acalm.asymmetric, 0, 'no wind: symmetric');
  const Awind = checkAxioms((a, b) => M.acoustic(a, b, { ...at19, windMs: 8 }), near, { triples: 120 });
  assert.ok(Awind.asymmetric > 100 && Awind.maxAsymmetry > 0.2, `wind: ${Awind.asymmetric} asymmetric, max ${Awind.maxAsymmetry.toFixed(2)}`);
  const T = checkAxioms((a, b) => M.travel('survivor', a, b), near, { triples: 60 });
  assert.ok(T.asymmetric > 30, `d_T asymmetric in ${T.asymmetric} of 60`);
  assert.equal(T.triangle, 0, 'shortest times obey the triangle inequality');
  const V = checkAxioms(M.perceptual, near, { triples: 200 });
  assert.equal(V.asymmetric + V.triangle + V.negative + V.selfNonZero, 0);
});

test('d_V: the Ramble makes far places look alike (the mechanism of getting lost, §6.4)', () => {
  // some woodland cells over 100 m apart look more alike than two neighbouring cells usually do
  const woods = survivorCells.filter((k) => world.cover[k] === COVER.WOODLAND && world.fp.rowOf[k] >= 0);
  const adj = []; for (const k of woods.slice(0, 2000)) if (world.fp.rowOf[k + 1] >= 0 && world.cover[k + 1] === COVER.WOODLAND) adj.push(M.perceptual(k, k + 1));
  adj.sort((a, b) => a - b); const typicalNeighbours = adj[adj.length >> 1];
  let alike = 0; let tried = 0;
  for (let q = 0; q < 3000; q++) {
    const a = woods[(q * 7919) % woods.length]; const b = woods[(q * 104729 + 13) % woods.length];
    if (M.euclidean(a, b) < 100) continue; tried++;
    if (M.perceptual(a, b) < typicalNeighbours) alike++;
  }
  assert.ok(alike / tried > 0.005, `${alike} of ${tried} far pairs look more alike than neighbours (${typicalNeighbours.toFixed(1)} m)`);
});
