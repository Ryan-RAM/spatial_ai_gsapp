// Wires the simulation to the page: data loading, the animation loop, view modes, selection,
// panels, screenshots and screen recording.
//
// URL parameters (handy for screenshots, see tools/capture.mjs):
//   ?warm=3600        simulate this many seconds before showing anything
//   &mode=collective  city | knowledge | collective
//   &view=top         overview | top | midtown | downtown | agent (frames the selected agent's map)
//   &heat=crowd       a value of the heat-map menu
//   &select=heli      drone | heli | medical: pick the agent of that type that knows the most
//   &cones=all  &bands=1  &paused=1  &speed=20

import { CONFIG } from '../sim/config.js';
import { buildWorld } from '../sim/world.js';
import { makeSim } from '../sim/sim.js';
import { makeFrame } from '../sim/geo.js';
import { parseData } from '../sim/data.js';
import { LANDMARK_TYPES } from '../sim/knowledge.js';
import { makePanels } from './panels.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);

function readPalette() {
  const css = getComputedStyle(document.documentElement);
  const v = (n) => css.getPropertyValue(n).trim();
  return {
    sky: v('--sky'), water: v('--water'), land: v('--land'), bLow: v('--b-low'), bHigh: v('--b-high'),
    drone: v('--drone'), tour: v('--tour'), medical: v('--medical'), lane: v('--lane'), nfz: v('--nfz'), nfzDrone: v('--nfz-drone'),
    heliport: v('--heliport'), hub: v('--hub'), pad: v('--pad'), sign: v('--sign'), cone: v('--cone'), selection: v('--selection'), anchor: v('--anchor'),
    kLand: v('--k-land'), kWater: v('--k-water'), kBlock: v('--k-block'), kBlockHot: v('--k-block-hot'),
  };
}

async function loadData() {
  if (!CONFIG.data.useRealData) return null; // the simulated Manhattan, built in the browser
  const frame = makeFrame(CONFIG.site);
  try {
    const [b, l] = await Promise.all([fetch(CONFIG.data.buildings), fetch(CONFIG.data.land)]);
    if (b.ok && l.ok) return parseData(await b.json(), await l.json(), frame);
  } catch (e) { console.warn('No processed data, using the placeholder city.', e); }
  if (!CONFIG.data.usePlaceholderIfMissing) throw new Error('data/processed/ is missing; run data/scripts/');
  return null; // buildWorld makes the placeholder
}

const state = { world: null, sim: null, scene: null, playing: qs.get('paused') !== '1', speed: Number(qs.get('speed') || 20), mode: qs.get('mode') || 'city', heat: qs.get('heat') || 'landmarks', lastDraw: 0, lastPanel: 0, knowledgeFor: null };
const panels = makePanels();
const palette = readPalette();

async function start() {
  const data = await loadData();
  state.world = buildWorld(CONFIG, data);
  $('source').textContent = state.world.source.startsWith('simulated') ? 'Simulated, simplified Manhattan' : 'NYC Open Data buildings';
  try {
    const { makeScene3D } = await import('../render/scene3d.js');
    state.scene = makeScene3D($('scene'), palette);
    state.scene.buildWorld(state.world, CONFIG.render.verticalExaggeration);
  } catch (e) {
    console.error(e); $('viewer-fallback').hidden = false;
  }
  newSim();
  const warm = Number(qs.get('warm') ?? CONFIG.sim.warmUpSeconds);
  if (warm > 0) { $('loading').textContent = `Simulating the first ${Math.round(warm / 60)} minutes…`; await warmUp(warm); }
  $('loading').hidden = true;
  applyParams();
  wire();
  if (!qs.get('mode') && !window.__LOWSKY_NO_TOUR) tourStep(0);
  panels.legend(state.mode, palette);
  requestAnimationFrame(loop);
  window.__app = { state, CONFIG, ready: true, setMode, selectBest, redraw: () => redrawOverlays(true), apply };
}

// Used by tools/capture.mjs: set a view in one go.
function apply({ mode, view, heat, select: who, cones, bands, follow } = {}, fromTour = false) {
  const sc = state.scene;
  if (!fromTour) { // a view set by hand is not one of the steps
    for (const b of document.querySelectorAll('#tour [data-step]')) b.setAttribute('aria-pressed', 'false');
    $('tour-caption').textContent = 'Pick a step to present. The simulation keeps running in the background; use Fast-forward to let the agents learn more.';
  }
  if (heat) { state.heat = heat; $('sel-heat').value = heat; }
  if (cones && sc) { sc.options.cones = cones; $('sel-cones').value = cones; }
  if (bands !== undefined && sc) { sc.options.bands = !!bands; $('tg-bands').checked = !!bands; }
  if (follow !== undefined && sc) { sc.options.follow = !!follow; $('tg-follow').checked = !!follow; }
  if (who) selectBest(who);
  if (mode) setMode(mode);
  if (view && sc) sc.view(view);
  redrawOverlays(true);
  panels.agent(state.sim, sc?.selected); panels.performance(state.sim); panels.log(state.sim);
}

function newSim() {
  state.sim = makeSim(state.world);
  state.scene?.select(null);
  state.knowledgeFor = null;
  panels.reset();
}

function warmUp(seconds) {
  return new Promise((resolve) => {
    const target = state.sim.time + seconds;
    const chunk = () => {
      const t0 = performance.now();
      while (state.sim.time < target && performance.now() - t0 < 60) state.sim.step();
      $('loading').textContent = `Simulating: ${Math.round(state.sim.time / 60)} of ${Math.round(target / 60)} minutes…`;
      if (state.sim.time < target) setTimeout(chunk, 0); else resolve();
    };
    chunk();
  });
}

function applyParams() {
  const sc = state.scene; if (!sc) return;
  if (qs.get('cones')) { sc.options.cones = qs.get('cones'); $('sel-cones').value = qs.get('cones'); }
  if (qs.get('bands') === '1') { sc.options.bands = true; $('tg-bands').checked = true; }
  if (qs.get('heat')) $('sel-heat').value = state.heat;
  $('speed').value = String(state.speed);
  if (!state.playing) $('btn-play').textContent = 'Play';
  if (qs.get('select')) selectBest(qs.get('select'));
  setMode(state.mode);
  if (qs.get('view')) sc.view(qs.get('view'));
}

function selectBest(kind) {
  const pool = state.sim.agents.filter((a) => (kind === 'heli' ? a.type !== 'drone' : kind === 'drone' ? a.type === 'drone' : a.type === kind) && a.active);
  pool.sort((a, b) => b.knowledge.seenCount + b.knowledge.landmarks.length * 50 - (a.knowledge.seenCount + a.knowledge.landmarks.length * 50));
  select(pool[0] || null);
}

function select(a) {
  state.scene?.select(a);
  state.knowledgeFor = null;
  panels.agent(state.sim, a);
  redrawOverlays(true);
}

function setMode(m) {
  state.mode = m;
  for (const b of document.querySelectorAll('#modes button')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
  if (state.scene) { state.scene.options.mode = m; state.scene.options.heat = state.heat; }
  if (m === 'knowledge' && !state.scene?.selected) selectBest('drone');
  redrawOverlays(true);
  panels.legend(m, palette, state.heat);
}

function heatValues() {
  const s = state.sim;
  switch (state.heat) {
    case 'landmarks': return s.landmarkHeat(LANDMARK_TYPES.filter((t) => t !== 'home'));
    case 'congestion': return s.landmarkHeat(['congestion', 'hold']);
    case 'crowd': return s.heat.crowd;
    case 'drone': return s.heat.drone;
    case 'heli': return s.heat.heli;
    case 'knowledge': return s.knowledgeOverlap();
    default: return null;
  }
}

function redrawOverlays(force = false) {
  const sc = state.scene; if (!sc) return;
  sc.options.heat = state.heat;
  if (state.mode === 'knowledge') sc.drawKnowledge(sc.selected);
  if (state.mode === 'collective') {
    sc.drawCollective(state.sim, { paths: $('tg-paths').checked, hotspots: $('tg-hotspots').checked, landmarks: $('tg-lms').checked });
    const v = heatValues();
    if (v) { const mx = sc.paintHeat(v, { log: state.heat !== 'knowledge' }); panels.heatNote(state.heat, mx); } else panels.heatNote('none', 0);
  }
  sc.applyVisibility();
  if (force) state.lastDraw = performance.now();
}

let lastFrame = performance.now(), fpsAcc = 0, fpsN = 0;
function loop(now) {
  const dtReal = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  if (state.playing) {
    let steps = (dtReal * state.speed) / CONFIG.sim.dt + (state.carry || 0);
    const n = Math.floor(steps); state.carry = steps - n;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { state.sim.step(); if (performance.now() - t0 > 40) { state.carry = 0; break; } }
  }
  const sc = state.scene;
  if (sc) {
    sc.placeAgents(state.sim);
    const period = state.mode === 'collective' ? 3000 : 1500;
    if (state.mode !== 'city' && now - state.lastDraw > period && state.playing) redrawOverlays(true);
    sc.render();
  }
  if (now - state.lastPanel > 500) {
    state.lastPanel = now;
    panels.clock(state.sim);
    panels.agent(state.sim, sc?.selected);
    panels.log(state.sim);
    if (now - (state.lastStats || 0) > 2000) { state.lastStats = now; panels.performance(state.sim); }
  }
  fpsAcc += dtReal; fpsN++;
  if (fpsAcc > 1) { $('perf').textContent = `${Math.round(fpsN / fpsAcc)} fps`; fpsAcc = 0; fpsN = 0; }
  requestAnimationFrame(loop);
}

function wire() {
  const sc = state.scene;
  $('btn-play').onclick = () => { state.playing = !state.playing; $('btn-play').textContent = state.playing ? 'Pause' : 'Play'; };
  $('speed').onchange = (e) => { state.speed = Number(e.target.value); };
  $('btn-reset').onclick = () => { newSim(); redrawOverlays(true); };
  $('btn-ff').onclick = async () => {
    const b = $('btn-ff'); if (b.disabled) return; b.disabled = true;
    const target = state.sim.time + 1800;
    await new Promise((resolve) => {
      const chunk = () => {
        const t0 = performance.now();
        while (state.sim.time < target && performance.now() - t0 < 30) state.sim.step();
        b.textContent = `Fast-forwarding… ${Math.round((1 - (target - state.sim.time) / 1800) * 100)}%`;
        if (state.sim.time < target) requestAnimationFrame(chunk); else resolve();
      };
      chunk();
    });
    b.disabled = false; b.textContent = 'Fast-forward 30 min';
    redrawOverlays(true); panels.performance(state.sim);
  };
  for (const b of document.querySelectorAll('#tour [data-step]')) b.onclick = () => tourStep(Number(b.dataset.step));
  for (const b of document.querySelectorAll('#modes button')) b.onclick = () => apply({ mode: b.dataset.mode });
  const cycle = (pred) => {
    const list = state.sim.agents.filter((a) => a.active && pred(a));
    if (!list.length) return;
    const cur = sc?.selected; const i = cur ? list.indexOf(cur) : -1;
    select(list[(i + 1) % list.length]);
  };
  $('btn-next-drone').onclick = () => cycle((a) => a.type === 'drone' && a.airborne);
  $('btn-next-heli').onclick = () => cycle((a) => a.type !== 'drone');
  if (!sc) return;
  $('tg-follow').onchange = (e) => { sc.options.follow = e.target.checked; };
  $('tg-buildings').onchange = (e) => { sc.options.buildings = e.target.checked; sc.applyVisibility(); };
  $('tg-rules').onchange = (e) => { sc.options.rules = e.target.checked; sc.applyVisibility(); };
  $('tg-bands').onchange = (e) => { sc.options.bands = e.target.checked; sc.applyVisibility(); };
  $('tg-trails').onchange = (e) => { sc.options.trails = e.target.checked; };
  $('sel-cones').onchange = (e) => { sc.options.cones = e.target.value; sc.applyVisibility(); };
  for (const id of ['tg-paths', 'tg-hotspots', 'tg-lms']) $(id).onchange = () => redrawOverlays(true);
  $('sel-heat').onchange = (e) => { state.heat = e.target.value; if (state.mode !== 'collective') setMode('collective'); else { redrawOverlays(true); panels.legend(state.mode, palette, state.heat); } };
  let down = null;
  sc.canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  sc.canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const a = sc.pick(e.clientX, e.clientY); if (a) select(a);
  });
  $('btn-shot').onclick = () => {
    sc.render();
    sc.canvas.toBlob((b) => download(b, `low-sky-${state.mode}-${Math.round(state.sim.time)}s.png`));
  };
  $('btn-rec').onclick = () => record(sc.canvas, 20);
}

// Presentation steps: each sets a view and says what to look at.
const TOUR = [
  { opts: { mode: 'city', view: 'overview', select: 'heli', cones: 'selected', bands: false },
    text: '<b>The rule layer we designed.</b> A one-way loop: north up the Hudson on the Manhattan shore (as the real SFRA asks), east over Central Park, south down the East River, west round the Battery. No-fly zones: red for everyone (UN), violet for drones only (heliports, Statue of Liberty, a substation). Yellow rings are heliports, cyan rings rooftop drone pads, white posts band signs. No agent knows any of this when it starts.' },
  { opts: { mode: 'city', view: 'midtown', cones: 'all', bands: true },
    text: '<b>Limited vision.</b> Every agent sees only its cone: a drone 70° and 180 m, a helicopter 140° and 1,200 m. A tower hides what is behind it. The flat planes are the altitude bands: drones at 200 ft (eastbound) and 300 ft (westbound), tours at 800 ft, medical flights at 1,100 ft.' },
  { opts: { mode: 'knowledge', select: 'drone', view: 'agent', cones: 'selected', bands: false },
    text: '<b>What one drone knows.</b> Only the cells it has seen. Red blocks are buildings too tall for its band. Its landmarks (dots) are remembered relative to home: the white lines run back to its hub. Green squares are its customers, and it reuses the breadcrumb route to a customer it has served before.' },
  { opts: { mode: 'knowledge', select: 'heli', view: 'overview', cones: 'selected' },
    text: '<b>What one helicopter crew knows.</b> A wide cone maps much more. Light blue is the part of the loop it has found. Its landmarks are anchored to things it can see: towers, bridges, the river. The labels are those visual references.' },
  { opts: { mode: 'collective', view: 'overview', heat: 'none' },
    text: '<b>Everyone together: all paths in 3D.</b> Blue drone paths fan out from the six hubs at their two band levels; orange tours and green medical flights follow the river loop.' },
  { opts: { mode: 'collective', view: 'top', heat: 'landmarks' },
    text: '<b>Landmark heat map.</b> Where agents left landmarks: lane entries and exits, band switches, landing sites, no-fly boundaries, congestion and holding points.' },
  { opts: { mode: 'collective', view: 'top', heat: 'crowd' },
    text: '<b>Where the rules jam.</b> Nothing was scripted as congested. This map is ground truth (no agent sees it): the jams form round the drone hubs, where many drones share one take-off and landing column, and on the heliport approaches.' },
  { opts: { mode: 'collective', view: 'top', heat: 'knowledge' },
    text: '<b>Shared knowledge.</b> How many agents know each 50 m cell. The rivers and the loop are known to almost everyone; the middle of Manhattan only to the drones that fly there.' },
];

function tourStep(i) {
  const t = TOUR[i]; if (!t) return;
  apply(t.opts, true);
  for (const b of document.querySelectorAll('#tour [data-step]')) b.setAttribute('aria-pressed', String(Number(b.dataset.step) === i));
  $('tour-caption').innerHTML = t.text;
}

function record(canvas, seconds) {
  if (!canvas.captureStream || typeof MediaRecorder === 'undefined') { alert('This browser cannot record the canvas.'); return; }
  const btn = $('btn-rec');
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: mime, videoBitsPerSecond: 8e6 });
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = () => { download(new Blob(chunks, { type: mime }), `low-sky-${state.mode}.${mime.includes('mp4') ? 'mp4' : 'webm'}`); btn.classList.remove('rec'); btn.textContent = 'Record 20 s'; };
  rec.start(); btn.classList.add('rec');
  let left = seconds; btn.textContent = `Recording ${left}s`;
  const t = setInterval(() => { left--; btn.textContent = `Recording ${left}s`; if (left <= 0) { clearInterval(t); rec.stop(); } }, 1000);
}

function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

start().catch((e) => { console.error(e); $('loading').textContent = `Could not start: ${e.message}`; });
