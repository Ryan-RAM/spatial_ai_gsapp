// The environment designer (semantic model §11.5-11.6, ROADMAP M6.3-M6.6).
//   manual    from the parent plan, two children by mutation, run side by side live on the same
//             round (same start time and seed) and scored on the whole suite; pick one, repeat
//   automatic a (1+1) evolution strategy (or 1+lambda): mutate the best, evaluate on the suite,
//             keep the child if it scores at least as well; `epochs` = environments generated
// Every plan tried goes into the lineage tree; the automatic run draws the fitness curve.
// Scoring runs in the Web Worker pool; the side-by-side rounds run on the main thread.

import { CONFIG } from '../sim/config.js';
import { emptyPlan, applyPlan, planCost } from '../sim/interventions.js';
import { mutate } from '../sim/mutate.js';
import { makeRng } from '../sim/rng.js';
import { makeRound, agentBrains } from '../sim/round.js';
import { aggregate } from '../sim/score.js';
import { makeMap2D } from '../render/map2d.js';
import { renderLineage } from '../render/lineage.js';
import { drawCurve } from '../render/curve.js';

const $ = (id) => document.getElementById(id);

export function makeDesigner({ world, storm, frames, night, pool, nightFor, watchPlan, getStart }) {
  let perspective = CONFIG.perspective;
  const cfg = () => ({ ...CONFIG, perspective });
  const rng = makeRng(CONFIG.seed ^ 0x5eed);
  const nodes = []; let current = null; let nextId = 0;
  const score = (n) => (n.metrics ? aggregate(n.nights, cfg(), { world, plan: n.plan }).fitness : null);
  function addNode(plan, parent, mode, label) { const n = { id: nextId++, parent, plan, mode, label, metrics: null, nights: null, score: null, kept: null }; nodes.push(n); return n; }
  async function evaluate(n) {
    const p = await pool(); const r = await p.evaluate(n.plan, cfg());
    n.nights = r.nights; n.metrics = r.metrics; n.score = score(n); return n;
  }
  const fmt = (m) => (m ? `F ${m.F.toFixed(3)} · F′ ${m.Fprime.toFixed(3)} · escaped ${Math.round(100 * m.escapeRate)} % · caught ${Math.round(100 * m.catchRate)} % · cold ${Math.round(100 * m.collapseRate)} % · cost ${Math.round(m.cost)}` : 'scoring on 24 rounds…');

  function redraw() {
    renderLineage($('lineage'), world, nodes, { current: current?.id, onPick: (n) => { current = n; status(`Back to plan #${n.id}. Make two variations of it, or watch it.`); redraw(); } });
    drawCurve($('curve'), history, { key: perspective === 'creature' ? 'Fprime' : 'fitness' });
    $('parentInfo').textContent = current ? `Parent: plan #${current.id} — ${current.label} — ${fmt(current.metrics)}` : '';
  }
  const status = (t) => { $('designStatus').textContent = t; };

  // ---------------------------------------------------------------- manual mode
  const sides = ['A', 'B'].map((s) => ({ s, map: makeMap2D($(`map${s}`), world, frames), round: null, node: null }));
  let manualAnim = null;
  async function makeVariations() {
    if (!current) return;
    status('Making two variations and scoring each on the 24 rounds…');
    for (const side of sides) {
      const m = mutate(world, CONFIG, current.plan, rng);
      side.node = addNode(m.plan, current.id, 'manual', m.diff.text);
      $(`diff${side.s}`).textContent = `${m.diff.text} (cost ${m.diff.cost >= 0 ? '+' : ''}${Math.round(m.diff.cost)})`;
      $(`score${side.s}`).textContent = fmt(null);
      const layers = applyPlan(world, CONFIG, m.plan);
      side.round = makeRound(world, storm, { start: getStart(), zone: night.zone, seed: night.rounds[0].seed, brains: agentBrains, creatureMemory: nightFor(layers), plan: m.plan, layers });
      const c = $(`map${side.s}`); const k = devicePixelRatio || 1; side.map.resize(c.clientWidth * k, c.clientHeight * k);
    }
    $('pickA').disabled = $('pickB').disabled = false; redraw();
    cancelAnimationFrame(manualAnim);
    const tick = () => { for (const side of sides) { for (let q = 0; q < 3 && !side.round.state.done; q++) side.round.step(); side.map.draw(side.round.state); } if (sides.some((x) => !x.round.state.done)) manualAnim = requestAnimationFrame(tick); else outcomeLines(); };
    manualAnim = requestAnimationFrame(tick);
    await Promise.all(sides.map(async (side) => { await evaluate(side.node); $(`score${side.s}`).textContent = fmt(side.node.metrics); }));
    status('Watch both rounds, compare the scores, and choose one.'); redraw();
  }
  function outcomeLines() {
    for (const side of sides) $(`live${side.s}`).textContent = `This round: ${side.round.state.agents.map((a) => a.outcome).join(', ')}`;
  }
  function pick(s) {
    const chosen = sides.find((x) => x.s === s).node; const other = sides.find((x) => x.s !== s).node;
    chosen.kept = true; other.kept = false; current = chosen;
    $('pickA').disabled = $('pickB').disabled = true;
    status(`Plan #${chosen.id} is the new parent. Make two more variations.`); redraw();
  }

  // ---------------------------------------------------------------- automatic mode
  const history = []; let running = false; let paused = false; let stopReq = false;
  async function runAuto() {
    if (running) { paused = !paused; $('autoStart').textContent = paused ? 'Resume' : 'Pause'; return; }
    running = true; paused = false; stopReq = false; $('autoStart').textContent = 'Pause'; $('autoStop').disabled = false;
    const epochs = Math.max(1, +$('epochs').value || CONFIG.epochs); const lambda = Math.max(1, Math.min(4, +$('lambda').value || 1));
    let best = current;
    if (!best.metrics) await evaluate(best);
    if (!history.length) history.push({ epoch: 0, metrics: { ...best.metrics, fitness: best.score }, kept: true, id: best.id });
    for (let e = history.length; e <= epochs && !stopReq; e++) {
      while (paused && !stopReq) await new Promise((r) => setTimeout(r, 200));
      if (stopReq) break;
      const kids = [];
      for (let q = 0; q < lambda; q++) { const m = mutate(world, CONFIG, best.plan, rng); if (m) kids.push(addNode(m.plan, best.id, 'auto', m.diff.text)); }
      await Promise.all(kids.map(evaluate));
      const top = kids.reduce((a, b) => (b.score > a.score ? b : a));
      const keep = top.score >= best.score;
      for (const k of kids) k.kept = k === top && keep;
      if (keep) { best = top; current = top; }
      history.push({ epoch: e, metrics: { ...top.metrics, fitness: top.score }, kept: keep, id: top.id });
      status(`Epoch ${e} of ${epochs}: ${top.label} → ${top.score.toFixed(3)} (${keep ? 'kept' : 'dropped'}); best #${best.id} ${best.score.toFixed(3)}`);
      redraw();
    }
    running = false; $('autoStart').textContent = 'Start'; $('autoStop').disabled = true;
    status(`${stopReq ? 'Stopped' : 'Done'}: ${history.length - 1} environments generated and evaluated; best is plan #${best.id} (${best.score.toFixed(3)}).`);
  }

  function exportJson() {
    const out = { perspective, nodes: nodes.map(({ nights, ...n }) => n), history, current: current?.id, suite: 'semantic model §11.4, 24 rounds' };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'frostroot-lineage.json'; a.click(); URL.revokeObjectURL(a.href);
    return out;
  }

  // ---------------------------------------------------------------- wiring
  const root = addNode(emptyPlan(), null, 'start', 'the empty plan'); root.kept = true; current = root;
  evaluate(root).then(() => { status('The empty plan is scored. Make two variations, or start the automatic mode.'); redraw(); });
  $('vary').addEventListener('click', makeVariations);
  $('pickA').addEventListener('click', () => pick('A')); $('pickB').addEventListener('click', () => pick('B'));
  $('autoStart').addEventListener('click', runAuto); $('autoStop').addEventListener('click', () => { stopReq = true; paused = false; });
  $('export').addEventListener('click', exportJson);
  $('watch').addEventListener('click', () => { if (current) { watchPlan(current.plan); status(`Watching plan #${current.id} in the 3D view and the map above.`); } });
  $('perspective').addEventListener('change', (e) => { perspective = e.target.value; for (const n of nodes) n.score = score(n); for (const h of history) { const n = nodes.find((x) => x.id === h.id); if (n) h.metrics = { ...h.metrics, fitness: n.score }; } redraw(); });
  for (const t of document.querySelectorAll('[role=tab]')) t.addEventListener('click', () => { for (const u of document.querySelectorAll('[role=tab]')) { const sel = u === t; u.setAttribute('aria-selected', String(sel)); $(u.getAttribute('aria-controls')).hidden = !sel; } });
  redraw();
  return { nodes, history, get current() { return current; }, makeVariations, pick, runAuto, stop: () => { stopReq = true; }, exportJson, cost: (p) => planCost(world, CONFIG, p).total };
}
