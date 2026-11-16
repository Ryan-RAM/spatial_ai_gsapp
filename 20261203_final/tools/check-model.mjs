// Keeps semantic_model.md and src/sim/config.js in agreement (ROADMAP M8.6).
//   node tools/check-model.mjs           check: the §18 table and every number quoted in the text
//   node tools/check-model.mjs --write   rewrite the §18 table from config.js
// Exit code 1 on any mismatch, with the list of what differs.
import { readFileSync, writeFileSync } from 'node:fs';
import { CONFIG as C } from '../src/sim/config.js';

const file = new URL('../semantic_model.md', import.meta.url);
const text = readFileSync(file, 'utf8');
const n = (v) => String(v);
const fmt = (v) => (Array.isArray(v) ? v.join(' / ') : typeof v === 'object' ? JSON.stringify(v) : n(v));

// the parameter table (§18): [config path, meaning, model section]
export const PARAMS = [
  ['cellSize', 'grid cell, m', '§2'],
  ['studyArea.bboxM', 'study area in frame W, m', '§3.1'],
  ['exits', 'exits', '§3.1'],
  ['tickSeconds', 'storm seconds per tick', '§2'],
  ['window.start', 'evaluation window start (local)', '§4.2'],
  ['window.end', 'evaluation window end (local)', '§4.2'],
  ['stormTotalSnowIn', 'official storm total, in', '§4.1'],
  ['survivorsPerRound', 'survivors per round', '§7.6'],
  ['creaturesPerNight', 'creatures per night', '§7.6'],
  ['creature.sightRange', 'creature sight, m × vf', '§7.6'],
  ['creature.coneDeg', 'creature cone, °', '§7.6'],
  ['creature.hearing', 'creature hearing threshold, m of d_A', '§7.6'],
  ['creature.plowedSpeedFactor', 'creature on plowed paths, × speed', '§7.6'],
  ['creature.litCostFactor', 'creature cost of lit cells, ×', '§7.6'],
  ['creature.speed', 'creature v0, m/s', '§6.3'],
  ['creature.mappingTicks', 'dusk mapping, ticks', '§11.4'],
  ['creature.mappingStart', 'dusk mapping start', '§11.4'],
  ['creature.snowExponent', 'creature f_snow exponent', '§6.3'],
  ['survivor.sightRange', 'survivor flashlight, m × vf', '§7.6'],
  ['survivor.coneDeg', 'survivor cone, °', '§7.6'],
  ['survivor.hearing', 'survivor hearing threshold, m of d_A', '§7.6'],
  ['survivor.startWarmth', 'starting warmth', '§7.6'],
  ['survivor.warmthK', 'E1 k, per s', '§9 E1'],
  ['survivor.shelterGain', 'E2 warmth per s in a shelter', '§9 E2'],
  ['survivor.speed', 'survivor v0, m/s', '§6.3'],
  ['coverSpeed.survivor', 'f_cover survivor (outside, paved, dirt, lawn, woodland, thicket, rock, water, structure)', '§6.3'],
  ['coverSpeed.creature', 'f_cover creature (same order)', '§6.3'],
  ['snowHalfDepthCm', 'f_snow half depth, cm', '§6.3'],
  ['muffling.trunk', 'muffling per trunk, m', '§6.2'],
  ['muffling.crown', 'muffling per evergreen crown, m', '§6.2'],
  ['muffling.structurePerM', 'muffling per m of wall, m', '§6.2'],
  ['muffling.groundPerM', 'muffling per m of ground, m', '§6.2'],
  ['muffling.snowFactor', 'm_snow factor', '§6.2'],
  ['muffling.windMax', 'wind term w max', '§6.2'],
  ['walkQuietM', 'walking quieter by, m', '§9 M3'],
  ['hindranceCm', 'hindrance depth, cm', '§9 S2'],
  ['plowedCm', 'plowed depth, cm', '§9 S3'],
  ['trackFillCm', 'T2 fill depth, cm', '§9 T2'],
  ['trackWindCoef', 'T2 wind coefficient', '§9 T2'],
  ['gustMask', 'gust masking per kt', '§6.2'],
  ['roundTicks', 'ticks per round', '§7.9'],
  ['suite.startTimes', 'suite start times', '§11.4'],
  ['suite.spawnZones', 'suite spawn zones', '§11.4'],
  ['suite.seeds', 'suite seeds', '§11.4'],
  ['replanEveryTicks', 'replanning at most every, ticks', '§12'],
  ['perspective', 'default fitness perspective', '§11.2'],
  ['lambdaCost', 'λ_cost', '§11.2'],
  ['budget.plowedM', 'budget: plowed m', '§9 I1'],
  ['budget.lamps', 'budget: lamps', '§9 I1'],
  ['budget.shelters', 'budget: shelters', '§9 I1'],
  ['budget.signs', 'budget: signs', '§9 I1'],
  ['cost', 'costs', '§9 I1'],
  ['lampRadius', 'lamp radius, m', '§7.4'],
  ['shelterCapacity', 'shelter capacity', '§7.4'],
  ['epochs', 'default epochs', '§11.6'],
  ['childrenPerEpoch', 'default children per epoch', '§11.6'],
];
const get = (path) => path.split('.').reduce((o, k) => o?.[k], C);
export function table() {
  return ['| Parameter (`config.js`) | Value | Meaning | Where |', '|---|---|---|---|', ...PARAMS.map(([p, m, w]) => `| \`${p}\` | ${fmt(get(p))} | ${m} | ${w} |`)].join('\n');
}

// numbers quoted in the prose: [what, the text that must be in the model]
const W = C.studyArea.bboxM; const cols = Math.ceil((W.maxX - W.minX) / C.cellSize); const rows = Math.ceil((W.maxY - W.minY) / C.cellSize); // as world.js rounds up
export const QUOTES = [
  ['cell size', `grid cell = **${C.cellSize} m**`],
  ['tick', `1 tick = **${C.tickSeconds} s**`],
  ['grid', `**${cols} × ${rows} = ${(cols * rows).toLocaleString('en')} cells**`],
  ['bbox', `x −${-W.minX} … ${W.maxX} m, y −${-W.minY} … ${W.maxY} m`],
  ['exits', C.exits.join(', ')],
  ['storm total', `${C.stormTotalSnowIn} in`],
  ['window', `**Sat 23 Jan ${C.window.start.slice(11)} → Sun 24 Jan ${C.window.end.slice(11)}**`],
  ['creature sight', `sight cone ${C.creature.coneDeg}°, ${C.creature.sightRange} m × \`vf\``],
  ['creature hearing', `\`d_A ≤ ${C.creature.hearing} m\``],
  ['creature plowed', `(\`× ${C.creature.plowedSpeedFactor}\`)`],
  ['creature light', `lit cells cost ×${C.creature.litCostFactor}`],
  ['survivor sight', `flashlight cone ${C.survivor.coneDeg}°, ${C.survivor.sightRange} m × \`vf\``],
  ['survivor hearing', `\`d_A ≤ ${C.survivor.hearing} m\``],
  ['survivors per round', `**Survivor** (${C.survivorsPerRound} per round`],
  ['creatures per night', `**Creature** (${C.creaturesPerNight} per night`],
  ['start warmth', `${C.survivor.startWarmth[0]}–${C.survivor.startWarmth[1]}`],
  ['speeds', `${C.survivor.speed} m/s for a walking survivor`],
  ['creature speed', `${C.creature.speed} m/s for the creature`],
  ['f_snow', `\`f_snow = 1 / (1 + depth_cm / ${C.snowHalfDepthCm})\``],
  ['f_snow creature', `\`(…)^${C.creature.snowExponent}\``],
  ['f_cover', `paved path ${C.coverSpeed.survivor[1].toFixed(1)}, dirt path ${C.coverSpeed.survivor[2]}, lawn ${C.coverSpeed.survivor[3]}, woodland floor ${C.coverSpeed.survivor[4]}`],
  ['muffling', `+${C.muffling.trunk} m per trunk, +${C.muffling.crown} m per evergreen crown, +${C.muffling.structurePerM} m per metre`],
  ['m_snow', `\`m_snow = ${C.muffling.snowFactor} × snowRate`],
  ['wind w', `\`w = ${C.muffling.windMax} × min(windSpeed / 10 m/s, 1)\``],
  ['gust', `1 − ${C.gustMask} × gust_kt`],
  ['M3', `+${C.walkQuietM} m added to \`d_A\``],
  ['S2', `Snow above ${C.hindranceCm} cm`],
  ['S3', `hold ≤ ${C.plowedCm} cm`],
  ['T2', `\`readability = 1 − fill / ${C.trackFillCm} cm\``],
  ['T2 wind', `(1 + ${C.trackWindCoef} × openness × windFactor)`],
  ['E1 k', `\`k = ${C.survivor.warmthK}\``],
  ['E2', `warmth rises by ${C.survivor.shelterGain} per second`],
  ['round', `${C.roundTicks} ticks (${(C.roundTicks * C.tickSeconds) / 60} min of storm time)`],
  ['C3', `after ${C.roundTicks} ticks`],
  ['suite', `${C.suite.startTimes.length} start times (${C.suite.startTimes.join(', ')}) × ${C.suite.spawnZones} spawn zones × ${C.suite.seeds} seeds = ${C.suite.startTimes.length * C.suite.spawnZones * C.suite.seeds} rounds`],
  ['mapping', `from ${C.creature.mappingStart.slice(11)}, ${C.creature.mappingTicks} ticks`],
  ['replan', `at most every ${C.replanEveryTicks} ticks`],
  ['I1', `total plowed length ≤ ${C.budget.plowedM.toLocaleString('en')} m, lamps ≤ ${C.budget.lamps}, shelters ≤ ${C.budget.shelters}, signs ≤ ${C.budget.signs}`],
  ['lamp radius', `\`radius\` ${C.lampRadius} m`],
  ['shelter capacity', `capacity ${C.shelterCapacity}`],
];

const [b0, b1] = ['<!-- params:begin -->', '<!-- params:end -->'];
const i0 = text.indexOf(b0); const i1 = text.indexOf(b1);
if (i0 < 0 || i1 < i0) { console.error('semantic_model.md: the §18 markers are missing'); process.exit(1); }
const want = `${b0}\n${table()}\n${b1}`;
if (process.argv.includes('--write')) {
  writeFileSync(file, text.slice(0, i0) + want + text.slice(i1 + b1.length)); console.log('§18 table written');
} else {
  const errs = [];
  if (text.slice(i0, i1 + b1.length) !== want) errs.push('§18 table differs from config.js (run with --write)');
  for (const [what, q] of QUOTES) if (!text.includes(q)) errs.push(`${what}: the model should say "${q}"`);
  if (/\[DECIDE/.test(text)) errs.push('an open [DECIDE] is left');
  if (errs.length) { console.error(errs.map((e) => `✗ ${e}`).join('\n')); process.exit(1); }
  console.log(`semantic_model.md agrees with config.js: ${PARAMS.length} parameters, ${QUOTES.length} quoted numbers`);
}
