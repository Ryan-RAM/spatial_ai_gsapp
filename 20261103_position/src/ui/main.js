// Wires the game to the page: keyboard and touch input, the tick loop, the 3D view, the minimap,
// the HUD and the start and end screens.

import { CONFIG } from '../sim/config.js';
import { makeContext } from '../sim/context.js';
import { newRun, stepRun } from '../sim/escape.js';
import { makePlans } from '../render/plans2d.js';
import { makePanels } from './panels.js';

const $ = (id) => document.getElementById(id);
const TICK = CONFIG.game.tickMs;

function readPalette() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return {
    player: v('--player'), creature: v('--creature'), creatureBody: v('--creature-body'), crow: v('--crow'),
    caseGlow: v('--case'), hidden: v('--hidden'), rel: v('--rel'), door: v('--door'), cross: v('--cross'), hospital: v('--hospital'),
    sky: v('--sky'), snow: v('--snow'), tree: v('--tree'), trunk: v('--trunk'), bush: v('--bush'), rock: v('--rock'),
    wall: v('--wall'), platform: v('--platform'), bridge: v('--bridge'), foliage: v('--foliage'), ladder: v('--ladder'),
    planFree: v('--plan-free'), planAir: v('--plan-air'), planGrid: v('--plan-grid'), planInk: v('--plan-ink'),
    exit: v('--door'),
  };
}

const DIFF_NOTE = {
  easy: '3 bullets, a slower creature.',
  normal: '2 bullets. About one run in two is a win.',
  hard: '1 bullet, and the creature is everywhere.',
};

const state = {
  ctx: null, game: null, seed: CONFIG.seed, round: 0, difficulty: 'normal',
  started: false, paused: false, acc: 0, last: 0, showRelations: true,
  queued: { shoot: false, climb: false },
};
const keys = new Set();
const touch = { dx: 0, dy: 0, run: false };

const palette = readPalette();
const panels = makePanels();
const plans = makePlans($('plan-ground'), $('plan-canopy'));
let scene = null;

function loadMap(seed) {
  state.seed = seed;
  state.ctx = makeContext(CONFIG, seed);
  plans.setMap(state.ctx.world, state.ctx.rays, palette, state.ctx.exits);
  scene?.buildMap(state.ctx.world, state.ctx.rays, state.ctx.exits);
}

function newGame() {
  state.round++;
  state.game = newRun(state.ctx, { difficulty: state.difficulty, round: state.round });
  panels.reset();
  scene?.reset();
  scene?.onTick(state.game, performance.now(), TICK);
  scene?.snapCamera();
  panels.update(state.game);
  state.acc = 0;
}

function input() {
  const k = (...names) => names.some((n) => keys.has(n));
  let dx = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
  let dy = (k('KeyS', 'ArrowDown') ? 1 : 0) - (k('KeyW', 'ArrowUp') ? 1 : 0);
  if (!dx && !dy) { dx = touch.dx; dy = touch.dy; }
  const out = { dx, dy, run: k('ShiftLeft', 'ShiftRight') || touch.run, shoot: state.queued.shoot, climb: state.queued.climb };
  state.queued.shoot = false;
  state.queued.climb = false;
  return out;
}

function tick(now) {
  const g = state.game;
  stepRun(g, input());
  scene?.onTick(g, now, TICK);
  plans.addSounds(g, now);
  panels.update(g);
  if (g.over) showEnd(g);
}

function showEnd(g) {
  state.started = false;
  const win = g.result === 'win';
  $('end-card').className = `card ${win ? 'win' : 'lose'}`;
  $('end-zh').textContent = win ? '你拯救了世界' : '你被它融合了';
  $('end-title').textContent = win ? 'You saved the world' : 'You became part of it';
  $('end-text').textContent = win
    ? 'The vaccine reached the hospital in time.'
    : (g.step >= CONFIG.game.maxTicks ? 'The night ran out. At dawn the roots found you.' : 'The roots closed around you before you reached the hospital.');
  const secs = Math.round((g.step * TICK) / 1000);
  $('end-stats').innerHTML = `<span><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b>time</span>`
    + `<span><b>${g.player.shots}</b>shots</span><span><b>${g.player.carrying ? 'yes' : 'no'}</b>had the case</span>`;
  setTimeout(() => { $('screen-end').hidden = false; $('btn-again').focus(); }, win ? 300 : 900);
}

function start() {
  $('screen-start').hidden = true;
  $('screen-end').hidden = true;
  newGame();
  state.started = true;
  state.paused = false;
  $('btn-pause').textContent = 'Pause';
  $('viewer').focus();
}

function loop(now) {
  const dt = Math.min(250, now - (state.last || now));
  state.last = now;
  if (state.started && !state.paused && state.game && !state.game.over) {
    state.acc += dt;
    while (state.acc >= TICK && !state.game.over) { state.acc -= TICK; tick(now); }
  }
  scene?.frame(now);
  if (state.game) plans.draw(state.game, now, true, state.showRelations);
  requestAnimationFrame(loop);
}

// ---- input -----------------------------------------------------------------------
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyQ', 'KeyM', 'KeyP']);
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement && e.code === 'Space' && !state.started) return;
  if (!GAME_KEYS.has(e.code)) return;
  if (state.started) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Space') state.queued.shoot = true;
  if (e.code === 'KeyE' || e.code === 'KeyQ') state.queued.climb = true;
  if (e.code === 'KeyM') toggleMap();
  if (e.code === 'KeyP') togglePause();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

document.querySelectorAll('#touch [data-dir]').forEach((b) => {
  const [dx, dy] = b.dataset.dir.split(',').map(Number);
  const on = (e) => { e.preventDefault(); touch.dx = dx; touch.dy = dy; };
  const off = (e) => { e.preventDefault(); if (touch.dx === dx && touch.dy === dy) { touch.dx = 0; touch.dy = 0; } };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off);
  b.addEventListener('pointercancel', off);
});
document.querySelector('#touch [data-act="run"]').addEventListener('pointerdown', (e) => { e.preventDefault(); touch.run = !touch.run; e.currentTarget.classList.toggle('on', touch.run); e.currentTarget.style.background = touch.run ? 'rgba(111,208,255,0.6)' : ''; });
document.querySelector('#touch [data-act="shoot"]').addEventListener('pointerdown', (e) => { e.preventDefault(); state.queued.shoot = true; });
document.querySelector('#touch [data-act="climb"]').addEventListener('pointerdown', (e) => { e.preventDefault(); state.queued.climb = true; });

// ---- controls --------------------------------------------------------------------
function togglePause() {
  if (!state.started) return;
  state.paused = !state.paused;
  $('btn-pause').textContent = state.paused ? 'Resume' : 'Pause';
  if (state.paused) panels.toast('Paused. Press P to go on.');
}
function toggleMap() {
  if (!scene) return;
  const on = !scene.isMapView();
  scene.setMapView(on);
  $('btn-map').setAttribute('aria-pressed', String(on));
  $('btn-map').textContent = on ? 'Follow view' : 'Map view';
}
document.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => {
  state.difficulty = b.dataset.diff;
  document.querySelectorAll('[data-diff]').forEach((o) => o.classList.toggle('on', o === b));
  $('diff-note').textContent = DIFF_NOTE[state.difficulty];
}));
$('diff-note').textContent = DIFF_NOTE[state.difficulty];
$('btn-start').addEventListener('click', start);
$('btn-again').addEventListener('click', start);
$('btn-newmap').addEventListener('click', () => { loadMap(Math.floor(Math.random() * 1e9)); start(); });
$('btn-restart').addEventListener('click', start);
$('btn-pause').addEventListener('click', togglePause);
$('btn-map').addEventListener('click', toggleMap);
$('tg-rel').addEventListener('change', (e) => { state.showRelations = e.target.checked; scene?.setOption('relations', e.target.checked); });
$('tg-canopy').addEventListener('change', (e) => scene?.setOption('canopy', e.target.checked));
$('viewer').addEventListener('pointerdown', () => $('viewer').focus());

// ---- start -------------------------------------------------------------------------
// The 3D view is loaded separately so the minimap still runs if the CDN is unreachable.
async function boot() {
  try {
    const { makeScene3D } = await import('../render/scene3d.js');
    scene = makeScene3D($('viewer'), palette);
  } catch (err) {
    console.error(err);
    $('viewer-fallback').hidden = false;
  }
  loadMap(CONFIG.seed);
  newGame(); // shows the forest behind the start screen
  requestAnimationFrame(loop);
}
boot();
// For testing: open the page with ?debug to reach the game state from the console.
if (new URLSearchParams(location.search).has('debug')) window.__frostroot = { state, keys };
