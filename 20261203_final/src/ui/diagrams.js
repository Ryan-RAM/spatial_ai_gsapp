// The diagrams of the deck (ROADMAP M8.1, semantic model §14): one figure per requirement, drawn
// from the simulation itself (the same world, storm, rounds and renderers as the main page).
// `tools/export-diagrams.cjs` screenshots every <figure> into docs/diagrams/ at 2x.

import { CONFIG } from '../sim/config.js';
import { loadWorldFromUrl, loadFingerprintsWith } from '../sim/load.js';
import { makeStorm, localSeconds } from '../sim/storm.js';
import { makeRound, agentBrains, wakeCell, nightsOf, evaluationSuite } from '../sim/round.js';
import { newMemory, mapTheWoods } from '../sim/creature.js';
import { applyPlan, emptyPlan, pointOnEdge } from '../sim/interventions.js';
import { makeFrames, compass8 } from '../sim/frames.js';
import { makeMetrics, checkAxioms } from '../sim/metrics.js';
import { walkerFor } from '../sim/paths.js';
import { makeOccupancy, advance } from '../sim/movement.js';
import { sightRange } from '../sim/perception.js';
import { presets } from '../sim/presets.js';
import { evaluatePlan } from '../sim/evaluate.js';
import { makeMap2D } from '../render/map2d.js';
import { drawWeather } from '../render/weatherPanel.js';
import { PALETTE, hex } from '../render/palette.js';

const $ = (id) => document.getElementById(id);
const base = new URL('../../data/baked/', import.meta.url);
const world = await loadWorldFromUrl(base);
await loadFingerprintsWith(world, async (f) => (await fetch(new URL(f, base))).json(), async (f) => new Uint8Array(await (await fetch(new URL(f, base))).arrayBuffer()));
const record = await (await fetch(new URL('storm-2016-01.json', base))).json();
const storm = makeStorm(record);
const frames = makeFrames(world);
const night = nightsOf(evaluationSuite(CONFIG))[0];
const PRESETS = presets(world, CONFIG);
const planB = PRESETS.find((p) => p.id === 'plan-b').plan;

function duskMemory(layers) {
  const mem = newMemory(world, CONFIG);
  const mm = mapTheWoods(world, CONFIG, { memory: mem, startCell: wakeCell(world, CONFIG, night.seed, night.zone), ticks: CONFIG.creature.mappingTicks, layers, weather: storm.at(localSeconds(CONFIG.creature.mappingStart)) });
  mem.lastCell = mm.endCell; return mem;
}
function round({ plan = emptyPlan(), start = night.rounds[0].start, r = night.rounds[0], ticks = 0, memory = null } = {}) {
  const layers = applyPlan(world, CONFIG, plan);
  const rd = makeRound(world, storm, { start, zone: r.zone, seed: r.seed, brains: agentBrains, creatureMemory: memory ?? duskMemory(layers), plan, layers });
  for (let q = 0; q < ticks && !rd.state.done; q++) rd.step();
  return rd;
}
// a map on a canvas, zoomed to a box around (cx, cy) of half-width r metres (or the whole map)
function mapOn(id, { layers = {}, view = null, follow = 0 } = {}) {
  const c = $(id); const k = 2; const m = makeMap2D(c, world, frames);
  m.resize(c.clientWidth * k, c.clientHeight * k);
  for (const name of Object.keys(m.on)) m.on[name] = layers[name] ?? false;
  if (view) { const asp = c.clientWidth / c.clientHeight; m.setView({ x0: view.x - view.r * asp, x1: view.x + view.r * asp, y0: view.y - view.r, y1: view.y + view.r }); }
  m.follow(follow); return m;
}
const at = (cell) => world.center(cell);
function label(m, x, y, text, { color = '#ffffff', dx = 8, dy = -8, size = 22, align = 'left' } = {}) {
  const [px, py] = m.toPx(x, y); const g = m.ctx; size *= 1.7; dx *= 1.7; dy *= 1.7; g.font = `${size}px system-ui`; g.textAlign = align;
  g.lineWidth = 5; g.strokeStyle = 'rgba(5,7,13,0.85)'; g.strokeText(text, px + dx, py + dy); g.fillStyle = color; g.fillText(text, px + dx, py + dy); g.textAlign = 'left';
}
function line(m, pts, color, width = 3, dash = []) {
  const g = m.ctx; g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); g.beginPath();
  pts.forEach(([x, y], q) => { const [px, py] = m.toPx(x, y); q ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke(); g.setLineDash([]);
}
function dot(m, x, y, r, color) { const [px, py] = m.toPx(x, y); const g = m.ctx; g.fillStyle = color; g.beginPath(); g.arc(px, py, r, 0, 2 * Math.PI); g.fill(); }
function circle(m, x, y, rM, color, width = 2) { const [px, py] = m.toPx(x, y); const g = m.ctx; g.strokeStyle = color; g.lineWidth = width; g.beginPath(); g.arc(px, py, (rM / world.s) * m.scale, 0, 2 * Math.PI); g.stroke(); }
function cells(m, test, rgba) {
  const g = m.ctx; const w = (1 / 1) * m.scale; g.fillStyle = rgba;
  for (let k = 0; k < world.n; k++) if (test(k)) { const [x, y] = at(k); const [px, py] = m.toPx(x - world.s / 2, y + world.s / 2); g.fillRect(px, py, w + 0.5, w + 0.5); }
}
function table(id, head, rows) {
  $(id).innerHTML = `<thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody>`;
}
const noAgents = (s) => ({ ...s, agents: [], creatures: [] });
const done = []; const mark = (id) => { done.push(id); $('progress').textContent = `${done.length} of ${document.querySelectorAll('figure[data-d] canvas').length && 12} figures drawn`; };
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------- 01 the baseline
{
  const rd = round(); const m = mapOn('c01', { layers: { cover: true, paths: true } });
  m.draw(noAgents(rd.state));
  for (const p of world.places) if (p.kind !== 'drive') { dot(m, p.x, p.y, 4, '#e8f0ff'); label(m, p.x, p.y, p.name, { size: 16, dy: -6 }); }
  mark('01');
}
await tick();

// one round, played to the middle: most figures read from it
const R = round({ ticks: 260 }); const S = R.state;
const sv = S.agents.find((a) => !a.outcome) ?? S.agents[0]; const cr = S.creatures[0];
const [sx, sy] = at(sv.cell);

// ---------------------------------------------------------------- 02 three frames, one occupant
{
  const m = mapOn('c02', { layers: { cover: true, paths: true }, view: { x: sx, y: sy, r: 55 }, follow: sv.id });
  m.draw(noAgents(S));
  const P = frames.toP(sx, sy); const N = frames.toN(sx, sy); const place = world.places.find((p) => p.id === N.place);
  if (P) { const e = world.paths.edges[P.edge]; line(m, e.pts, '#9fc3ff', 6); const [px, py] = pointOnEdge(world, P.edge, P.s); dot(m, px, py, 6, '#9fc3ff'); line(m, [[px, py], [sx, sy]], '#9fc3ff', 2, [4, 4]); line(m, [e.pts[0], e.pts[0]], '#9fc3ff'); dot(m, e.pts[0][0], e.pts[0][1], 6, '#9fc3ff'); label(m, e.pts[0][0], e.pts[0][1], 's = 0', { color: '#9fc3ff', size: 18 }); }
  if (place) { line(m, [[place.x, place.y], [sx, sy]], hex(PALETTE.warm), 3, [8, 6]); dot(m, place.x, place.y, 7, hex(PALETTE.warm)); label(m, place.x, place.y, place.name, { color: hex(PALETTE.warm) }); }
  const h = sv.heading ?? 0; const r = 14; const [ux, uy] = [Math.sin((h * Math.PI) / 180), Math.cos((h * Math.PI) / 180)];
  line(m, [[sx, sy], [sx + ux * r, sy + uy * r]], '#c8ffd8', 4); label(m, sx + ux * r, sy + uy * r, 'E: ahead = 0°', { color: '#c8ffd8', size: 18 });
  dot(m, sx, sy, 8, '#ffffff');
  table('t02', ['Frame', 'The same survivor'], [
    ['W world, metres east / north of KNYC', `(${sx.toFixed(1)}, ${sy.toFixed(1)}) m, cell ${sv.cell} (i ${sv.cell % world.W}, j ${Math.floor(sv.cell / world.W)})`],
    ['P on a path: edge, metres along, offset', P ? `edge ${P.edge} ${world.paths.edges[P.edge].name ? `(${world.paths.edges[P.edge].name})` : ''}, s = ${P.s.toFixed(1)} m, offset ${P.offset.toFixed(1)} m` : '—'],
    ['N named place: bearing and distance', `${frames.describeN(sx, sy)} (bearing ${Math.round(N.bearing)}°)`],
    ['E egocentric (relative to its heading)', `heading ${Math.round(h)}° (${compass8(h)}); the creature is at ${(() => { const e = frames.toE({ x: sx, y: sy, heading: h }, ...at(cr.cell)); return `${Math.round(e.bearing)}°, ${Math.round(e.distance)} m`; })()}`],
  ]);
  mark('02');
}
await tick();

// ---------------------------------------------------------------- 03 four distances + axioms
{
  const D = makeMetrics(world, CONFIG); const w = storm.at(S.t);
  const a = sv.cell; const b = cr.cell; const [bx, by] = at(b);
  const dE = D.euclidean(a, b); const dA = D.acoustic(a, b, w); const dTsv = D.travel('survivor', a, b, { snow: S.snow.depth }); const dTcr = D.travel('creature', b, a, { snow: S.snow.depth }); const dV = D.perceptual(a, b);
  const r = Math.max(30, dE * 0.75);
  const m = mapOn('c03', { layers: { cover: true, paths: true }, view: { x: (sx + bx) / 2, y: (sy + by) / 2, r } });
  m.draw(noAgents(S));
  line(m, [[sx, sy], [bx, by]], '#ffffff', 3, [6, 5]);
  const rt = walkerFor(world, 'survivor', CONFIG).route(a, b, { snow: S.snow.depth }); if (rt) line(m, rt.cells.map(at), hex(PALETTE.warm), 4);
  const rc = walkerFor(world, 'creature', CONFIG).route(b, a, { snow: S.snow.depth }); if (rc) line(m, rc.cells.map(at), '#c8ffd8', 3, [3, 4]);
  dot(m, sx, sy, 9, '#ffffff'); label(m, sx, sy, 'survivor'); dot(m, bx, by, 9, hex(PALETTE.eye)); label(m, bx, by, 'creature', { color: hex(PALETTE.eye) });
  table('t03a', ['Distance', 'Survivor ↔ creature', 'What it measures'], [
    ['d_E Euclidean', `${dE.toFixed(1)} m`, 'straight line in W'],
    ['d_A acoustic', `${dA.toFixed(1)} m`, `as far as it sounds: + muffling by trunks, rocks, buildings, snow, and wind (${w.windMs.toFixed(1)} m/s from ${Math.round(w.windFromDeg)}°)`],
    ['d_T travel time', `survivor → creature ${dTsv.toFixed(0)} s; creature → survivor ${dTcr.toFixed(0)} s`, 'Tobler slope, snow depth, cover; each kind its own walk graph (orange: survivor, green dashed: creature)'],
    ['d_V perceptual', `${dV.toFixed(1)} m`, `how different the two places look: RMS difference of their ${world.fp.rays}-ray visibility fingerprints (how far one sees in each direction)`],
  ]);
  // the axioms on random path cells (the same checker as the tests)
  const pathCells = []; for (let k = 0; k < world.n; k++) if (world.cover[k] === 1 || world.cover[k] === 2) pathCells.push(k);
  const rows = [];
  for (const [name, d, n] of [['d_E', D.euclidean, 300], ['d_A', (p, q) => D.acoustic(p, q, w), 300], ['d_T (survivor)', (p, q) => D.travel('survivor', p, q), 60], ['d_V', D.perceptual, 300]]) {
    const x = checkAxioms(d, pathCells, { triples: n });
    rows.push([name, n, x.negative ? '✗' : '✓', x.selfNonZero ? '✗' : '✓', x.asymmetric ? `✗ ${x.asymmetric}/${n} (max ${(100 * x.maxAsymmetry).toFixed(0)} %)` : '✓', x.triangle ? `✗ ${x.triangle}/${n}` : '✓', x.zeroApart ? `${x.zeroApart} pairs at 0` : '—']);
    await tick();
  }
  table('t03b', ['Distance', 'Triples', 'd ≥ 0', 'd(a,a) = 0', 'Symmetric', 'Triangle', 'Distinct ≠ 0'], rows);
  mark('03');
}
await tick();

// ---------------------------------------------------------------- 04 own map vs true map
{
  const mt = mapOn('c04a', { layers: { cover: true, paths: true } }); mt.draw(noAgents(S)); label(mt, world.minX + 10, world.maxY - 10, 'The true map', { dx: 0, dy: 18 });
  const ms = mapOn('c04b', { layers: { cover: true, paths: true, knowledge: true }, follow: sv.id }); ms.draw({ ...S, creatures: [] , agents: [sv] });
  label(ms, world.minX + 10, world.maxY - 10, `Survivor ${sv.id + 1} after ${Math.round(S.tick * CONFIG.tickSeconds / 60)} min`, { dx: 0, dy: 18 });
  const mc = mapOn('c04c', { layers: { cover: true, paths: true } }); mc.draw(noAgents(S));
  cells(mc, (k) => !cr.memory.seen[k], 'rgba(5,6,12,0.82)');
  label(mc, world.minX + 10, world.maxY - 10, 'The creature, after mapping at dusk', { dx: 0, dy: 18 });
  const cov = (k) => { let n = 0; let t = 0; for (let c = 0; c < world.n; c++) if (world.cover[c]) { t++; if (k.seen[c]) n++; } return `${n.toLocaleString('en')} cells (${((100 * n) / t).toFixed(1)} %)`; };
  $('n04').textContent = `Dark = not known to that agent. The survivor knows ${cov(sv.k)} of the park, the creature ${cov(cr.memory)}: what it saw while mapping at dusk and since. Each plans only on what it knows (unknown cells cost a guess).`;
  mark('04');
}
await tick();

// ---------------------------------------------------------------- 05 landmarks and a dead end avoided
{
  const L = cr.memory.landmarks; const de = L.filter((l) => l.type === 'dead_end');
  const svDE = sv.k.landmarks.filter((l) => l.type === 'dead_end');
  const focus = svDE[0] ?? de[0] ?? { x: sx, y: sy };
  const m = mapOn('c05', { layers: { cover: true, paths: true, landmarks: true, routes: true }, view: { x: focus.x, y: focus.y, r: 70 }, follow: sv.id });
  m.draw({ ...S, creatures: [] });
  for (const l of de) { dot(m, l.x, l.y, 8, '#ff8a8a'); }
  for (const l of [...svDE, ...de].slice(0, 6)) label(m, l.x, l.y, 'dead end', { color: '#ff8a8a', size: 16 });
  const kinds = {}; for (const l of [...L, ...sv.k.landmarks]) kinds[l.type] = (kinds[l.type] ?? 0) + 1;
  $('n05').textContent = `Landmarks remembered (creature + survivor): ${Object.entries(kinds).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(', ')}. The white dotted line is the survivor's landmark chain; a remembered dead end adds 10 000 s to every cell within 6 m of it, so the planned route (dashed orange) never turns in.`;
  mark('05');
}
await tick();

// ---------------------------------------------------------------- 06 metrics (empty plan vs Plan B)
{
  const rows = [];
  for (const [name, plan] of [['Empty plan', emptyPlan()], ['Plan B (preset)', planB]]) {
    const m = evaluatePlan(world, storm, plan, CONFIG).metrics; const pct = (v) => `${Math.round(100 * v)} %`;
    rows.push([name, pct(m.escapeRate), pct(m.catchRate), pct(m.collapseRate), pct(m.lostRate), m.meanLowestWarmth.toFixed(0), m.meanTimesSeen.toFixed(1), m.F.toFixed(3), m.Fprime.toFixed(3), Math.round(m.cost)]);
    await tick();
  }
  table('t06', ['Plan', 'Escaped', 'Caught', 'Taken by the cold', 'Lost', 'Lowest warmth (mean)', 'Times seen (mean)', 'F (survivors)', 'F′ (creature)', 'Cost'], rows);
  mark('06');
}
await tick();

// ---------------------------------------------------------------- 07 planned vs walked
{
  const R2 = round({ ticks: 420, memory: cr.memory }); const a = R2.state.agents.find((x) => !x.outcome && x.route) ?? R2.state.agents[0];
  const [ax, ay] = at(a.cell);
  const m = mapOn('c07', { layers: { cover: true, paths: true, routes: true, tracks: true }, view: { x: ax, y: ay, r: 80 }, follow: a.id });
  m.draw({ ...R2.state, creatures: [] }); label(m, ax, ay, `survivor ${a.id + 1}`);
  $('n07').textContent = `Blue: the cells walked so far (with drift: a survivor without a fix walks off its intended bearing). Dashed orange: the route it plans now, on its own map. They part where its map was wrong, where it heard the creature, or where the snow was deeper than it believed.`;
  mark('07');
}
await tick();

// ---------------------------------------------------------------- 08 vision shrinking with visibility
{
  // the clearest and the thickest moment of the evaluation window
  let best = localSeconds(CONFIG.window.start); let worst = best;
  for (let t = best; t <= localSeconds(CONFIG.window.end) - 1800; t += 600) { const v = storm.at(t).visibilityM; if (v > storm.at(best).visibilityM) best = t; if (v < storm.at(worst).visibilityM) worst = t; }
  [best, worst].forEach((t, q) => {
    const start = new Date(Date.UTC(2016, 0, 1) + t * 1000).toISOString().slice(0, 16);
    const Rv = round({ start, ticks: 20, memory: cr.memory }); const a = Rv.state.agents.find((x) => !x.outcome) ?? Rv.state.agents[0]; const [ax, ay] = at(a.cell); const w = storm.at(Rv.state.t);
    const rs = sightRange(CONFIG, 'survivor', w, false); const rc = sightRange(CONFIG, 'creature', w, false); const r = 40;
    const m = mapOn(q ? 'c08b' : 'c08a', { layers: { cover: true, paths: true, cones: true, light: true }, view: { x: ax, y: ay, r }, follow: a.id });
    m.draw({ ...Rv.state, creatures: [] });
    circle(m, ax, ay, rs, hex(PALETTE.warm), 3); circle(m, ax, ay, rc, '#c8ffd8', 3);
    const [lx, ly] = m.toW(16, 16);
    label(m, lx, ly, `${w.label.replace("T", " ")}: visibility ${Math.round(w.visibilityM)} m`, { dx: 0, dy: 18 });
    label(m, lx, ly, `survivor sees ${Math.round(rs)} m (orange ring), creature ${Math.round(rc)} m (green ring)`, { dx: 0, dy: 40, size: 16 });
  });
  mark('08');
}
await tick();

// ---------------------------------------------------------------- 09 two survivors on a narrow bridge
{
  const e = world.paths.edges.find((x) => x.name === 'Oak Bridge') ?? world.paths.edges.find((x) => x.bridge);
  const walker = walkerFor(world, 'survivor', CONFIG); const occ = makeOccupancy(world);
  const ends = [e.pts[0], e.pts[e.pts.length - 1]].map(([x, y]) => world.cellOf(x, y));
  // each starts a few cells before its end of the bridge and walks to the far side
  const beyond = (c, away) => { const [x, y] = at(c); const [ox, oy] = at(away); const d = Math.hypot(x - ox, y - oy); return world.cellOf(x + ((x - ox) / d) * 9, y + ((y - oy) / d) * 9); };
  const A = { id: 0, kind: 'survivor', cell: beyond(ends[0], ends[1]), routeIdx: 0 }; const B = { id: 1, kind: 'survivor', cell: beyond(ends[1], ends[0]), routeIdx: 0 };
  const goal = { 0: beyond(ends[1], ends[0]), 1: beyond(ends[0], ends[1]) };
  for (const ag of [A, B]) { occ.put(ag.id, ag.cell); ag.route = walker.route(ag.cell, goal[ag.id]).cells; ag.trail = [ag.cell]; ag.waits = []; }
  const log = [];
  for (let t = 0; t < 60; t++) {
    for (const ag of [A, B]) {
      if (ag.needsPlan) { // M1: after 3 s, plan again around the occupied cell
        const other = ag === A ? B : A; const extra = new Float32Array(world.n); extra[other.cell] = 1e4;
        const r = walker.route(ag.cell, goal[ag.id], { extra }); ag.route = r ? r.cells : [ag.cell]; ag.routeIdx = 0; ag.needsPlan = false; log.push(`t = ${t * CONFIG.tickSeconds} s: survivor ${ag.id === 0 ? 'A' : 'B'} has waited 3 s and plans again`);
      }
      const before = ag.waited ?? 0; advance(ag, { world, walker, occupancy: occ, snow: null, dt: CONFIG.tickSeconds, config: CONFIG, t, sounds: [] });
      if ((ag.waited ?? 0) > before && before === 0) { ag.waits.push(ag.cell); log.push(`t = ${t * CONFIG.tickSeconds} s: survivor ${ag.id === 0 ? 'A' : 'B'} finds the next cell taken and waits`); }
      if (ag.trail.at(-1) !== ag.cell) ag.trail.push(ag.cell);
    }
  }
  const [mx, my] = e.pts[Math.floor(e.pts.length / 2)];
  const m = mapOn('c09', { layers: { cover: true, paths: true }, view: { x: mx, y: my, r: 26 } });
  m.draw(noAgents(S));
  cells(m, (k) => walker.passable(k), 'rgba(160,190,255,0.10)');
  line(m, A.trail.map(at), '#9fc3ff', 5); line(m, B.trail.map(at), hex(PALETTE.warm), 5);
  for (const [ag, col, nm] of [[A, '#9fc3ff', 'A'], [B, hex(PALETTE.warm), 'B']]) { const [x0, y0] = at(ag.trail[0]); dot(m, x0, y0, 7, col); label(m, x0, y0, `${nm} starts`, { color: col, size: 18 }); for (const c of ag.waits) { const [x, y] = at(c); circle(m, x, y, 2.5, '#ff8a8a', 3); label(m, x, y, `${nm} waits`, { color: '#ff8a8a', size: 18, dy: 22 }); } }
  label(m, mx, my, e.name ?? 'bridge', { dy: -30, size: 20 });
  $('n09').textContent = `${e.name ?? 'A bridge'}, ${Math.round(e.len)} m, with water on both sides: one agent per cell (rule M1). ${log.join('. ')}.`;
  mark('09');
}
await tick();

// ---------------------------------------------------------------- 10 snow depth, 17:00 vs 23:00
{
  for (const [id, start] of [['c10a', '2016-01-23T17:00'], ['c10b', '2016-01-23T23:00']]) {
    const Rs = round({ start, ticks: 1, memory: cr.memory }); const m = mapOn(id, { layers: { cover: true, paths: true, snow: true } });
    m.draw(noAgents(Rs.state)); let mx = 0; let sum = 0; let n = 0; for (let k = 0; k < world.n; k++) if (world.cover[k] && world.cover[k] !== 7) { mx = Math.max(mx, Rs.state.snow.depth[k]); sum += Rs.state.snow.depth[k]; n++; }
    label(m, world.minX + 10, world.maxY - 10, `${start.slice(11)}: mean ${Math.round(sum / n)} cm, drifts to ${Math.round(mx)} cm`, { dx: 0, dy: 18 });
  }
  mark('10');
}
await tick();

// ---------------------------------------------------------------- 11 obstacles
{
  const arch = PRESETS.find((p) => p.plan.closed.length)?.plan ?? planB; const layers = applyPlan(world, CONFIG, arch);
  const m = mapOn('c11', { layers: { cover: true, paths: true } }); m.draw(noAgents({ ...S, layers }));
  cells(m, (k) => world.cover[k] === 7, 'rgba(70,110,190,0.85)');                // water
  cells(m, (k) => world.cover[k] === 6, 'rgba(170,170,190,0.9)');                // rock
  cells(m, (k) => world.cover[k] === 8, 'rgba(240,240,255,0.95)');               // structures
  cells(m, (k) => world.cover[k] === 5, 'rgba(60,120,70,0.75)');                 // thicket
  cells(m, (k) => layers.closed[k], 'rgba(220,60,70,0.95)');
  const T = world.trees; for (let q = 0; q < T.count; q++) { const x = T.data[q * 6]; const y = T.data[q * 6 + 1]; dot(m, x, y, Math.max(1.2, T.data[q * 6 + 5] * m.scale / world.s * 2), '#05070d'); }
  $('n11').innerHTML = '<span class="sw" style="background:#4670be"></span>water (impassable) <span class="sw" style="background:#aaaabe"></span>rock outcrops <span class="sw" style="background:#f0f0ff"></span>structures <span class="sw" style="background:#3c7846"></span>thickets (creature only) <span class="sw" style="background:#dc3c46"></span>closed paths (a plan) <span class="sw" style="background:#05070d"></span>tree trunks, ' + T.count + ' from LiDAR. All of them block sight and muffle sound; water, rock and structures also block walking.';
  mark('11');
}
await tick();

// ---------------------------------------------------------------- 15 data pipeline: the weather panel
{
  drawWeather($('c15'), record, { t0: localSeconds(CONFIG.window.start), t1: localSeconds(CONFIG.window.end), now: localSeconds('2016-01-23T23:00') });
  mark('15');
}
document.body.dataset.ready = '1';
