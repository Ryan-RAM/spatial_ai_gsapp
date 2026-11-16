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
import { makePool } from './pool.js';
import { makeDesigner } from './designer.js';
import { fetchTonight } from '../sim/tonight.js';
import { drawWeather, describeObservation } from '../render/weatherPanel.js';
import { drawHeat } from '../render/heatmap.js';
import { makeAudio } from './audio.js';
import { decodePlan } from '../sim/presets.js';

const $ = (id) => document.getElementById(id);
const status = $('status');

const base = new URL('../../data/baked/', import.meta.url);
const world = await loadWorldFromUrl(base);
const record2016 = await (await fetch(new URL('storm-2016-01.json', base))).json();
let record = record2016; let storm = makeStorm(record);
const frames = makeFrames(world);
const night = nightsOf(evaluationSuite(CONFIG))[0];
let plan = emptyPlan(); let layers = applyPlan(world, CONFIG, plan);

// the creature maps the woods at dusk, once per night; its memory carries over to every round
// a night for a plan: the creature maps that variant of the woods at dusk (§11.4)
function nightFor(planLayers) {
  const mem = newMemory(world, CONFIG);
  const mm = mapTheWoods(world, CONFIG, { memory: mem, startCell: wakeCell(world, CONFIG, night.seed, night.zone), ticks: CONFIG.creature.mappingTicks, layers: planLayers, weather: storm.at(localSeconds(CONFIG.creature.mappingStart)) });
  mem.lastCell = mm.endCell; return mem;
}
let memory = nightFor(layers);

const view = makeScene3D($('view'), world);
const map = makeMap2D($('map'), world, frames);
let roundIdx = 0; let round = null; let nextStart = null; const results = [];
function startRound() {
  const r = night.rounds[roundIdx % night.rounds.length];
  const start = nextStart ?? r.start;
  round = makeRound(world, storm, { start, zone: r.zone, seed: r.seed, brains: agentBrains, creatureMemory: memory, plan, layers });
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
// sound (M9.1): off until asked for; follows the survivor in view
const audio = makeAudio(); let heardSeen = -1;
function sound() {
  const s = round.state; const a = s.agents.find((x) => x.id === followId && !x.outcome); const c = s.creatures[0];
  let danger = 0; if (a && c) { const [ax, ay] = world.center(a.cell); const [cx, cy] = world.center(c.cell); danger = Math.max(0, 1 - Math.hypot(ax - cx, ay - cy) / 60); }
  audio.update(s.weather?.windMs ?? 0, danger);
  const heard = a ? Math.max(-1, ...a.k.threats.filter((t) => t.how === 'heard').map((t) => t.tick)) : -1; if (heard > heardSeen) audio.creak(); heardSeen = heard; // the tick it last heard the creature
}
function hud() {
  sound();
  const s = round.state; const w = s.weather;
  const lines = s.agents.map((a) => `Survivor ${a.id + 1}: ${a.outcome ?? SURVIVOR_STATES[a.state] ?? a.state ?? '…'} · warmth ${Math.round(a.warmth)} · ${frames.describeN(...world.center(a.cell))}`);
  const c = s.creatures[0]; if (c) lines.push(`Creature: ${CREATURE_STATES[c.state] ?? c.state}`);
  $('clock').textContent = `${fmtTime(s.t)} · ${w ? `${w.tempC.toFixed(0)} °C · wind ${Math.round(w.windFromDeg)}° ${w.windMs.toFixed(1)} m/s · visibility ${Math.round(w.visibilityM)} m · ${w.cumSnowCm.toFixed(0)} cm` : ''}`;
  $('agents').textContent = lines.join('\n');
}

// the 3D view is drawn only while it is on screen (the simulation keeps running)
let viewOnScreen = true;
new IntersectionObserver(([e]) => { viewOnScreen = e.isIntersecting; }).observe($('view'));
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing && !round.state.done) {
    acc += (dt * speed) / CONFIG.tickSeconds;
    const n = Math.floor(acc); acc -= n; if (n) stepSim(n);
  }
  if (viewOnScreen) { view.update(round.state, playing ? acc : 0, now / 1000); view.render(); } // no GPU work while scrolled away
  if (frame.count % 3 === 0) map.draw(round.state); // the map: 20 frames a second is plenty
  if ((frame.count = (frame.count ?? 0) + 1) % 6 === 0) hud();
  if (round.state.done && !round.counted) { round.counted = true; results.push(round.result()); $('next').hidden = false; metrics(); }
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
function showPick(px, py) {
  const p = map.pick(px, py); if (!p) return;
  $('pick').innerHTML = `<dl><dt>W</dt><dd>${fmt(p.x)} m E, ${fmt(p.y)} m N · cell (${p.i}, ${p.j}) · z ${fmt(p.z)} m · ${p.cover} · snow ${fmt(p.snowCm, 0)} cm</dd>`
    + `<dt>P</dt><dd>${p.P ? `edge ${p.P.edge}${p.P.name ? ` (${p.P.name})` : ''}, ${fmt(p.P.s)} m along, ${fmt(Math.abs(p.P.offset))} m to the ${p.P.offset >= 0 ? "left" : "right"}` : '—'}</dd>`
    + `<dt>N</dt><dd>${p.N ? p.N.words : '—'}</dd>`
    + `<dt>E</dt><dd>${p.E ? `${fmt(p.E.distance)} m, ${fmt(Math.abs(p.E.bearing), 0)}° ${p.E.bearing >= 0 ? 'right' : 'left'} of Survivor ${followId + 1}\u2019s heading` : '—'}</dd></dl>`;
  map.draw(round.state);
}
$('map').addEventListener('click', (e) => { const r = e.target.getBoundingClientRect(); const k = devicePixelRatio || 1; showPick((e.clientX - r.left) * k, (e.clientY - r.top) * k); });
// the keyboard (M9.2): arrows move the picked point 6 m (Shift: 30 m), starting at the followed survivor
let cursor = null;
$('map').addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 30 : 6; const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
  if (!d && e.key !== 'Enter') return; e.preventDefault();
  if (!cursor) { const a = round.state.agents.find((x) => x.id === followId) ?? round.state.agents[0]; cursor = world.center(a.cell); }
  if (d) cursor = [Math.min(world.maxX, Math.max(world.minX, cursor[0] + d[0])), Math.min(world.maxY, Math.max(world.minY, cursor[1] + d[1]))];
  showPick(...map.toPx(cursor[0], cursor[1]));
});
$('next').addEventListener('click', () => { roundIdx++; startRound(); $('next').hidden = true; });
addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); $('play').click(); } });
status.hidden = true; $('app').hidden = false;
// size the canvas only once it is visible (a hidden canvas measures 0 x 0)
addEventListener('resize', resize); resize();
hud(); requestAnimationFrame(frame);
let poolP = null; const pool = () => (poolP ??= makePool(world, { base }));
// watch another plan in the live views: a new night for it
function watchPlan(p) { plan = p; layers = applyPlan(world, CONFIG, plan); memory = nightFor(layers); results.length = 0; roundIdx = 0; startRound(); metrics(); $('next').hidden = true; }
const designer = makeDesigner({ world, storm, frames, night, pool, nightFor, watchPlan, getStart: () => nextStart ?? night.rounds[0].start });
window.__app = { world, view, pool, designer, watchPlan, get round() { return round; }, stepSim, setSpeed: (s) => { speed = s; }, pause: () => { playing = false; } };

// ---------------------------------------------------------------- the interface (M5.4)
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (prefersReduced) { speed = 10; $('speed').textContent = '10×'; }
const root = document.documentElement;
try { const t = localStorage.getItem('frostroot-theme'); if (t) root.dataset.theme = t; } catch { /* storage may be blocked */ }
$('sound').addEventListener('click', (e) => { const on = audio.toggle(); e.target.textContent = on ? 'Sound on' : 'Sound off'; e.target.setAttribute('aria-pressed', String(on)); });
view.setReducedMotion?.(prefersReduced);
$('theme').addEventListener('click', () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('frostroot-theme', root.dataset.theme); } catch { /* ignore */ }
  drawTimeline();
});
$('help').addEventListener('click', () => $('intro').showModal());
// when the guide closes, focus goes to the scene, so the keys work at once
$('intro').addEventListener('close', () => $('view').focus());
try { if (!localStorage.getItem('frostroot-intro')) { $('intro').showModal(); localStorage.setItem('frostroot-intro', '1'); } } catch { $('intro').showModal(); }

// the timeline: the storm over the evaluation window, hour by hour
let T0 = localSeconds(CONFIG.window.start); let T1 = localSeconds(CONFIG.window.end); let tonight = false;
const HOURS = CONFIG.suite.startTimes;
let tlSel = 0;
function drawTimeline() {
  const c = $('timeline'); const k = devicePixelRatio || 1; c.width = c.clientWidth * k; c.height = c.clientHeight * k;
  const g = c.getContext('2d'); const W = c.width; const H = c.height; const css = getComputedStyle(root);
  g.clearRect(0, 0, W, H);
  const x = (t) => ((t - T0) / (T1 - T0)) * W;
  for (let t = T0; t < T1; t += 3600) { // snowfall per hour, as bars
    const s = storm.at(t + 1800); const h = Math.min(1, s.snowRateCmH / 6) * (H - 18);
    g.fillStyle = css.getPropertyValue('--muted'); g.globalAlpha = 0.55; g.fillRect(x(t) + 2, H - 14 - h, x(t + 3600) - x(t) - 4, h); g.globalAlpha = 1;
  }
  g.strokeStyle = css.getPropertyValue('--fg'); g.lineWidth = 1.5 * k; g.beginPath(); // visibility, log scale
  for (let t = T0; t <= T1; t += 600) { const v = Math.log(storm.at(t).visibilityM / 300) / Math.log(16100 / 300); const y = (H - 14) * (1 - Math.max(0, Math.min(1, v))); t === T0 ? g.moveTo(x(t), y) : g.lineTo(x(t), y); }
  g.stroke();
  g.fillStyle = css.getPropertyValue('--muted'); g.font = `${11 * k}px system-ui`;
  if (!tonight) HOURS.forEach((h, q) => { const t = localSeconds(h < '12:00' ? `2016-01-24T${h}` : `2016-01-23T${h}`); g.fillText(h, x(t) + 3, H - 2); if (q === tlSel) { g.strokeStyle = css.getPropertyValue('--accent'); g.lineWidth = 2 * k; g.strokeRect(x(t) + 1, 1, x(t + 7200) - x(t) - 2, H - 16); } });
  if (round) { g.fillStyle = css.getPropertyValue('--accent'); g.fillRect(x(round.state.t) - k, 0, 2 * k, H - 14); }
}
function chooseHour(q) { if (tonight) return; tlSel = (q + HOURS.length) % HOURS.length; const h = HOURS[tlSel]; nextStart = h < '12:00' ? `2016-01-24T${h}` : `2016-01-23T${h}`; $('tlnext').textContent = h; drawTimeline(); }
$('timeline').addEventListener('click', (e) => { const r = e.target.getBoundingClientRect(); chooseHour(Math.floor(((e.clientX - r.left) / r.width) * HOURS.length)); });
$('timeline').addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { chooseHour(tlSel + 1); e.preventDefault(); } if (e.key === 'ArrowLeft') { chooseHour(tlSel - 1); e.preventDefault(); } });
setInterval(drawTimeline, 1000); drawTimeline();

// the metrics of the rounds played so far (§11.1)
function metrics() {
  const sv = results.flatMap((r) => r.survivors); const n = sv.length || 1; const pct = (o) => `${Math.round((100 * sv.filter((s) => s.outcome === o).length) / n)} %`;
  const items = [['Rounds', results.length], ['Escaped', pct('escaped')], ['Caught', pct('caught')], ['Taken by the cold', pct('collapsed')], ['Lost in the storm', pct('lost')],
    ['Lowest warmth (mean)', sv.length ? Math.round(sv.reduce((a, s) => a + s.minWarmth, 0) / sv.length) : '—'], ['Woods the creature knows', `${Math.min(100, Math.round((100 * memory.knownCount * 72) / world.horizon.rows.length))} %`]];
  $('metrics').innerHTML = items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}
metrics();

// keyboard
const CAMS = ['follow', 'overview', 'first'];
addEventListener('keydown', (e) => {
  if (e.target.closest && (e.target.closest('select, input') || e.target.closest('dialog[open]'))) return; // keys inside an open dialog or a field are theirs
  if (e.key === '+' || e.key === '=') $('speed').click();
  else if (e.key === '-') { speed = SPEEDS[(SPEEDS.indexOf(speed) + SPEEDS.length - 1) % SPEEDS.length]; $('speed').textContent = `${speed}×`; }
  else if (e.key === 'c' || e.key === 'C') { const sel = $('camera'); sel.value = CAMS[(CAMS.indexOf(sel.value) + 1) % CAMS.length]; sel.dispatchEvent(new Event('change')); }
  else if (e.key === '1' || e.key === '2') { const sel = $('followSel'); sel.value = String(+e.key - 1); sel.dispatchEvent(new Event('change')); }
  else if (e.key === 'k' || e.key === 'K') { const cb = [...document.querySelectorAll('#layers input')][Object.keys(LAYERS).indexOf('knowledge')]; cb.click(); }
  else if ((e.key === 'n' || e.key === 'N') && !$('next').hidden) $('next').click();
});

// ---------------------------------------------------------------- the data, and tonight (M7)
let hoverT = null;
function drawData() {
  const r = drawWeather($('weather'), record, { t0: T0, t1: T1, now: round?.state.t, hoverT });
  if (r) $('obs').textContent = describeObservation(r);
}
$('weather').addEventListener('mousemove', (e) => { const rc = e.target.getBoundingClientRect(); const left = 120; hoverT = T0 + ((e.clientX - rc.left - left) / (rc.width - left - 8)) * (T1 - T0); drawData(); });
$('weather').addEventListener('mouseleave', () => { hoverT = null; drawData(); });
setInterval(drawData, 1000); drawData();

$('weatherSel').addEventListener('change', async (e) => {
  if (e.target.value === 'tonight') {
    $('dataNote').textContent = 'Fetching tonight\u2019s observations at Central Park from the National Weather Service…';
    try {
      record = await fetchTonight(); tonight = true;
      storm = makeStorm(record);
      T1 = storm.end; T0 = Math.max(storm.start, T1 - 12 * 3600);
      nextStart = new Date(Date.UTC(2016, 0, 1) + (T1 - 30 * 60) * 1000).toISOString().slice(0, 16);
      $('tlwhat').textContent = 'The last 12 hours at Central Park'; $('tlnext').textContent = nextStart.slice(11);
      $('dataNote').textContent = `Tonight at Central Park: ${record.records.length} hourly observations from the NWS, the latest at ${record.records[record.records.length - 1].time.replace('T', ' ')}. Same paths, trees and terrain; this weather. Snow from precipitation at 10:1 (nothing to calibrate on).`;
    } catch (err) {
      e.target.value = '2016'; tonight = false; record = record2016; storm = makeStorm(record);
      $('dataNote').textContent = `Could not reach the National Weather Service (${err.message}); staying with January 2016.`;
    }
  } else {
    tonight = false; record = record2016; storm = makeStorm(record); T0 = localSeconds(CONFIG.window.start); T1 = localSeconds(CONFIG.window.end); nextStart = null;
    $('dataNote').textContent = dataNote2016; $('tlwhat').textContent = 'The night of 23–24 January 2016 at Central Park'; chooseHour(tlSel);
  }
  watchPlan(plan); drawTimeline(); drawData();
});
const dataNote2016 = 'The hourly record of Central Park (KNYC) for 23–24 January 2016, from the Iowa Environmental Mesonet archive, through our MCP server, baked into the page. Snow from precipitation at 11.85:1, calibrated so the storm totals the official 27.5 in (70 cm).';
$('dataNote').textContent = dataNote2016;

// ---------------------------------------------------------------- the gallery (M8.4)
{
  const [g, st] = await Promise.all([fetch(new URL('../gallery.json', base)).then((r) => r.json()), fetch(new URL('../gallery-stories.json', base)).then((r) => r.json())]);
  const byId = Object.fromEntries(g.environments.map((e) => [e.id, e])); const pct = (v) => `${Math.round(100 * v)} %`;
  const cards = [];
  for (const id of st.order) {
    const env = byId[id]; if (!env) continue; const m = env.metrics;
    const card = document.createElement('article'); card.className = 'gallery-card'; card.id = `g-${id}`;
    card.innerHTML = `<img alt="Map of ${env.title}: interventions, where survivors and the creature went, and how each night ended" width="488" height="430"><h3></h3><p class="nums"></p><p class="story"></p><button type="button">Load this environment</button>`;
    card.querySelector('h3').textContent = env.title; card.querySelector('button').setAttribute('aria-label', `Load the environment \u201c${env.title}\u201d`);
    card.querySelector('.nums').textContent = `F ${m.F.toFixed(3)} · escaped ${pct(m.escapeRate)} · caught ${pct(m.catchRate)} · cold ${pct(m.collapseRate)} · lost ${pct(m.lostRate)} · cost ${Math.round(m.cost)} — ${env.how}`;
    card.querySelector('.story').textContent = st.stories[id];
    card.querySelector('button').addEventListener('click', () => { const p = decodePlan(env.plan); watchPlan(p); designer.adopt(p, env.title); $('view').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('status').textContent = `Watching "${env.title}".`; });
    $('galleryList').append(card); cards.push([card, env]);
  }
  // drawn once into an image (static images are far cheaper to keep on screen than live canvases)
  const off = document.createElement('canvas'); off.setAttribute('aria-hidden', 'true'); off.style.cssText = 'position:absolute;left:-9999px;width:488px;height:430px'; document.body.append(off);
  // after the page is up, one map per idle slot (each takes a few ms)
  const idle = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 2000 }) : setTimeout(f, 50));
  let q = 0; const next = () => { if (q >= cards.length) { off.remove(); return; } const [card, env] = cards[q++]; drawHeat(off, world, env); card.querySelector('img').src = off.toDataURL('image/png'); idle(next); };
  idle(next);
}
