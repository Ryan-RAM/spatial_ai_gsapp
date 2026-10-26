// Wires the simulation to the page: game loop, controls, 3D view, plans, chart and panels.

import { CONFIG } from '../sim/config.js';
import { makeContext } from '../sim/context.js';
import { newGame, stepGame } from '../sim/game.js';
import { checkAxioms } from '../sim/metrics.js';
import { makePlans } from '../render/plans2d.js';
import { makeChart } from './chart.js';
import { makePanels } from './panels.js';

const $ = (id) => document.getElementById(id);
const SPEEDS = { slow: 650, medium: 300, fast: 90 };
const RESTART_MS = 2000;

function readPalette() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light';
  return {
    police: v('--police'), thief: v('--thief'), euclidean: v('--eu'), path: v('--path'), perceptual: v('--perc'),
    sky: v('--sky'), ground: v('--ground'), tree: v('--tree'), trunk: v('--trunk'), bush: v('--bush'), rock: v('--rock'),
    wall: v('--wall'), platform: v('--platform'), bridge: v('--bridge'), foliage: v('--foliage'), ladder: v('--ladder'),
    planFree: v('--plan-free'), planAir: v('--plan-air'), planGrid: v('--plan-grid'), planInk: v('--plan-ink'),
    grid: v('--grid'), muted: v('--muted'),
    fogDensity: dark ? 0.022 : 0.024,
    light: dark ? 2.4 : 1.1,
  };
}

const state = {
  ctx: null, game: null, seed: CONFIG.seed, round: 0,
  score: { police: 0, thief: 0 },
  paused: false, speed: 'medium', lastStep: 0, restartAt: null,
  showCones: true,
};

let palette = readPalette();
const panels = makePanels();
const plans = makePlans($('plan-ground'), $('plan-canopy'));
const chart = makeChart($('chart'), $('chart-tip'));
chart.setPalette(palette);
let scene = null;

function loadMap(seed) {
  state.seed = seed;
  state.ctx = makeContext(CONFIG, seed);
  state.round = 0;
  $('map-seed').textContent = `Map seed ${seed}`;
  plans.setMap(state.ctx.world, state.ctx.rays, palette);
  scene?.buildMap(state.ctx.world, state.ctx.rays);
  document.querySelector('#axioms tbody').innerHTML = '<tr><td colspan="6">Computing&hellip;</td></tr>';
  setTimeout(() => {
    const ctx = state.ctx;
    const results = checkAxioms(ctx.world, ctx.rays, ctx.metrics);
    results.typicalPerceptual = ctx.perceptualQ(0.5);
    if (ctx === state.ctx) panels.axioms(results);
  }, 50);
  startRound();
}

function startRound() {
  state.round++;
  state.game = newGame(state.ctx, state.round);
  state.restartAt = null;
  $('banner').hidden = true;
  panels.resetHint();
  panels.roundMarker(`Round ${state.round} begins. The thief starts ${state.game.distances.path.toFixed(0)} cells (path) from the police.`);
  scene?.resetAgents();
  afterStep(performance.now());
}

function afterStep(now) {
  const g = state.game;
  scene?.onStep(g, now, SPEEDS[state.speed]);
  plans.addSounds(g, now);
  panels.status(g, state.score);
  panels.distances(g);
  const fresh = g.events.slice(g.shownEvents ?? 0);
  g.shownEvents = g.events.length;
  panels.addEvents(fresh);
  chart.update(g.history, CONFIG);
}

function endRound(now) {
  const g = state.game;
  state.score[g.winner]++;
  const banner = $('banner');
  banner.style.setProperty('--c', g.winner === 'police' ? palette.police : palette.thief);
  banner.innerHTML = g.winner === 'police'
    ? `Police wins<small>Spotted the thief at step ${g.step}, ${g.distances.euclidean.toFixed(1)} cells away.</small>`
    : `Thief wins<small>Unseen for all ${CONFIG.maxSteps} steps.</small>`;
  banner.hidden = false;
  panels.status(g, state.score);
  state.restartAt = now + RESTART_MS;
}

function loop(now) {
  const g = state.game;
  if (!state.paused) {
    if (g.over) {
      if (state.restartAt === null) endRound(now);
      else if (now >= state.restartAt) startRound();
    } else if (now - state.lastStep >= SPEEDS[state.speed]) {
      state.lastStep = now;
      stepGame(g);
      afterStep(now);
    }
  }
  scene?.frame(now);
  plans.draw(state.game, now, state.showCones);
  requestAnimationFrame(loop);
}

// ---- controls -----------------------------------------------------------
$('btn-pause').addEventListener('click', () => {
  state.paused = !state.paused;
  $('btn-pause').textContent = state.paused ? 'Resume' : 'Pause';
  if (!state.paused && state.restartAt !== null) state.restartAt = performance.now() + RESTART_MS;
});
document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
  state.speed = b.dataset.speed;
  document.querySelectorAll('[data-speed]').forEach((o) => o.classList.toggle('on', o === b));
}));
$('btn-next').addEventListener('click', () => {
  panels.roundMarker(`Round ${state.round} skipped.`);
  startRound();
});
$('btn-map').addEventListener('click', () => {
  panels.roundMarker('New map.');
  loadMap(Math.floor(Math.random() * 1e9));
});
$('btn-top').addEventListener('click', () => {
  if (!scene) return;
  const on = !scene.isTopView();
  scene.setTopView(on);
  $('btn-top').setAttribute('aria-pressed', String(on));
});
$('tg-cones').addEventListener('change', (e) => { state.showCones = e.target.checked; scene?.setOption('cones', e.target.checked); });
$('tg-omni').addEventListener('change', (e) => scene?.setOption('omni', e.target.checked));
$('tg-lines').addEventListener('change', (e) => scene?.setOption('lines', e.target.checked));
$('tg-canopy').addEventListener('change', (e) => scene?.setOption('canopy', e.target.checked));

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  palette = readPalette();
  chart.setPalette(palette);
  plans.redrawBackgrounds(palette);
  if (scene) { scene.setPalette(palette); scene.buildMap(state.ctx.world, state.ctx.rays); }
});

// ---- start ------------------------------------------------------------------
// The 3D view is loaded separately so the rest of the page still runs if the CDN is unreachable.
async function start() {
  try {
    const { makeScene3D } = await import('../render/scene3d.js');
    scene = makeScene3D($('viewer'), palette);
  } catch (err) {
    console.error(err);
    $('viewer-fallback').hidden = false;
  }
  loadMap(CONFIG.seed);
  requestAnimationFrame(loop);
}
start();
