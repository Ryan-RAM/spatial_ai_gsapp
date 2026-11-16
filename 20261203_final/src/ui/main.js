// Page entry (M5.2): loads the baked world and the storm, lets the creature map the woods at dusk,
// then plays a round live in the 3D view. The simulation steps on the main thread here (one round
// is ~60 ms of work for 900 ticks); the evaluation of many rounds goes to Web Workers in M6.
// Controls are minimal; the interface proper is M5.4.

import { CONFIG } from '../sim/config.js';
import { loadWorldFromUrl } from '../sim/load.js';
import { makeStorm, localSeconds } from '../sim/storm.js';
import { makeRound, agentBrains, wakeCell, nightsOf, evaluationSuite } from '../sim/round.js';
import { newMemory, mapTheWoods, CREATURE_STATES } from '../sim/creature.js';
import { SURVIVOR_STATES } from '../sim/survivor.js';
import { applyPlan, emptyPlan } from '../sim/interventions.js';
import { makeFrames } from '../sim/frames.js';
import { makeScene3D } from '../render/scene3d.js';
import { makeMap2D, LAYERS } from '../render/map2d.js';

const $ = (id) => document.getElementById(id);
const status = $('status');

const base = new URL('../../data/baked/', import.meta.url);
const world = await loadWorldFromUrl(base);
const storm = makeStorm(await (await fetch(new URL('storm-2016-01.json', base))).json());
const frames = makeFrames(world);
const night = nightsOf(evaluationSuite(CONFIG))[0];
const plan = emptyPlan(); const layers = applyPlan(world, CONFIG, plan);

// the creature maps the woods at dusk, once per night; its memory carries over to every round
const memory = newMemory(world, CONFIG);
const m = mapTheWoods(world, CONFIG, { memory, startCell: wakeCell(world, CONFIG, night.seed, night.zone), ticks: CONFIG.creature.mappingTicks, layers, weather: storm.at(localSeconds(CONFIG.creature.mappingStart)) });
memory.lastCell = m.endCell;

const view = makeScene3D($('view'), world);
const map = makeMap2D($('map'), world, frames);
let roundIdx = 0; let round = null;
function startRound() {
  const r = night.rounds[roundIdx % night.rounds.length];
  round = makeRound(world, storm, { start: r.start, zone: r.zone, seed: r.seed, brains: agentBrains, creatureMemory: memory, plan, layers });
  round.step(); // first look, first plan
}
startRound();

// time: `speed` storm seconds per real second
let speed = 30; let playing = true; let acc = 0; let last = performance.now();
const SPEEDS = [2, 10, 30, 120];
function stepSim(n) {
  for (let q = 0; q < n && !round.state.done; q++) {
    for (const a of [...round.state.agents, ...round.state.creatures]) a.prevCell = a.cell;
    round.step();
  }
}
function fmtTime(t) { return new Date(Date.UTC(2016, 0, 1) + t * 1000).toISOString().slice(11, 16); }
function hud() {
  const s = round.state; const w = s.weather;
  const lines = s.agents.map((a) => `Survivor ${a.id + 1}: ${a.outcome ?? SURVIVOR_STATES[a.state] ?? a.state ?? '…'} · warmth ${Math.round(a.warmth)} · ${frames.describeN(...world.center(a.cell))}`);
  const c = s.creatures[0]; if (c) lines.push(`Creature: ${CREATURE_STATES[c.state] ?? c.state}`);
  $('clock').textContent = `${fmtTime(s.t)} · ${w ? `${w.tempC.toFixed(0)} °C · wind ${Math.round(w.windFromDeg)}° ${w.windMs.toFixed(1)} m/s · visibility ${Math.round(w.visibilityM)} m · ${w.cumSnowCm.toFixed(0)} cm` : ''}`;
  $('agents').textContent = lines.join('\n');
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing && !round.state.done) {
    acc += (dt * speed) / CONFIG.tickSeconds;
    const n = Math.floor(acc); acc -= n; if (n) stepSim(n);
  }
  view.update(round.state, playing ? acc : 0, now / 1000);
  view.render();
  if (frame.count % 3 === 0) map.draw(round.state); // the map: 20 frames a second is plenty
  if ((frame.count = (frame.count ?? 0) + 1) % 6 === 0) hud();
  if (round.state.done && playing) { $('next').hidden = false; }
  requestAnimationFrame(frame);
}

function resize() { const el = $('view'); view.resize(el.clientWidth, el.clientHeight); const m = $('map'); map.resize(m.clientWidth * (devicePixelRatio || 1), m.clientHeight * (devicePixelRatio || 1)); map.draw(round.state); }
$('play').addEventListener('click', () => { playing = !playing; $('play').textContent = playing ? 'Pause' : 'Play'; });
$('speed').addEventListener('click', () => { speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; $('speed').textContent = `${speed}×`; });
$('camera').addEventListener('change', (e) => view.setCamera(e.target.value));
let followId = 0;
$('followSel').addEventListener('change', (e) => { followId = +e.target.value; view.follow(followId); map.follow(followId); });
// map layers and picking
for (const [name, label] of Object.entries(LAYERS)) {
  const l = document.createElement('label'); const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = map.on[name];
  cb.addEventListener('change', () => { map.setLayer(name, cb.checked); map.draw(round.state); }); l.append(cb, ` ${label}`); $('layers').append(l);
}
const fmt = (v, d = 1) => (v == null ? '—' : v.toFixed(d));
$('map').addEventListener('click', (e) => {
  const r = e.target.getBoundingClientRect(); const k = devicePixelRatio || 1;
  const p = map.pick((e.clientX - r.left) * k, (e.clientY - r.top) * k); if (!p) return;
  $('pick').innerHTML = `<dl><dt>W</dt><dd>${fmt(p.x)} m E, ${fmt(p.y)} m N · cell (${p.i}, ${p.j}) · z ${fmt(p.z)} m · ${p.cover} · snow ${fmt(p.snowCm, 0)} cm</dd>`
    + `<dt>P</dt><dd>${p.P ? `edge ${p.P.edge}${p.P.name ? ` (${p.P.name})` : ''}, ${fmt(p.P.s)} m along, ${fmt(Math.abs(p.P.offset))} m to the ${p.P.offset >= 0 ? "left" : "right"}` : '—'}</dd>`
    + `<dt>N</dt><dd>${p.N ? p.N.words : '—'}</dd>`
    + `<dt>E</dt><dd>${p.E ? `${fmt(p.E.distance)} m, ${fmt(Math.abs(p.E.bearing), 0)}° ${p.E.bearing >= 0 ? 'right' : 'left'} of Survivor ${followId + 1}\u2019s heading` : '—'}</dd></dl>`;
  map.draw(round.state);
});
$('next').addEventListener('click', () => { roundIdx++; startRound(); $('next').hidden = true; });
addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); $('play').click(); } });
status.hidden = true; $('app').hidden = false;
// size the canvas only once it is visible (a hidden canvas measures 0 x 0)
addEventListener('resize', resize); resize();
hud(); requestAnimationFrame(frame);
window.__app = { world, view, get round() { return round; }, stepSim, setSpeed: (s) => { speed = s; }, pause: () => { playing = false; } };
