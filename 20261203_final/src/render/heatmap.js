// A generated environment at a glance (ROADMAP M8.4): the plan on the map, where the survivors
// walked (pale) and where the creature went (green), and how each survivor's night ended:
// escaped (triangle), caught (cross), taken by the cold (ring), still lost (dot).
import { pointOnEdge } from '../sim/interventions.js';
import { decodePlan } from '../sim/presets.js';
import { PALETTE, hex } from './palette.js';

export function drawHeat(canvas, world, env) {
  const k = devicePixelRatio || 1; canvas.width = canvas.clientWidth * k; canvas.height = canvas.clientHeight * k;
  const g = canvas.getContext('2d'); const W = canvas.width; const H = canvas.height;
  const sc = Math.min(W / world.W, H / world.H); const ox = (W - world.W * sc) / 2; const oy = (H - world.H * sc) / 2;
  const px = (x, y) => [ox + ((x - world.minX) / world.s) * sc, oy + ((world.maxY - y) / world.s) * sc];
  const cell = (c) => [ox + (c % world.W) * sc, oy + Math.floor(c / world.W) * sc];
  g.fillStyle = '#0b1020'; g.fillRect(0, 0, W, H);
  for (let c = 0; c < world.n; c++) if (world.cover[c]) { const v = world.cover[c]; g.fillStyle = v === 7 ? '#101a30' : v === 1 || v === 2 ? '#3a4260' : v === 3 ? '#1f2740' : '#171d33'; const [x, y] = cell(c); g.fillRect(x, y, sc + 0.5, sc + 0.5); }
  const plan = decodePlan(env.plan);
  const edge = (e, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); world.paths.edges[e].pts.forEach(([x, y], q) => { const [a, b] = px(x, y); q ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); };
  for (const e of plan.plowed) edge(e, '#dfe6f3', Math.max(2, sc * 1.2));
  for (const e of plan.closed) edge(e, '#e0505a', Math.max(2, sc * 1.2));
  const heat = (flat, rgb, cap) => { let mx = 1; for (let q = 1; q < flat.length; q += 2) mx = Math.max(mx, flat[q]); for (let q = 0; q < flat.length; q += 2) { const a = Math.min(1, 0.25 + Math.log1p(flat[q + 1]) / Math.log1p(mx)) * cap; const [x, y] = cell(flat[q]); g.fillStyle = `rgba(${rgb},${a})`; g.fillRect(x - sc * 0.3, y - sc * 0.3, sc * 1.6, sc * 1.6); } };
  heat(env.heat.creature, '120,230,150', 0.55); heat(env.heat.survivor, '210,225,255', 0.8);
  for (const l of plan.lamps) { const [x, y] = px(...pointOnEdge(world, l.edge, l.s)); g.fillStyle = hex(PALETTE.warm); g.beginPath(); g.arc(x, y, Math.max(3, sc * 1.3), 0, 7); g.fill(); }
  for (const nd of plan.shelters) { const n = world.paths.nodes[nd]; const [x, y] = px(n.x, n.y); const r = Math.max(5, sc * 2.4); g.fillStyle = hex(PALETTE.warm); g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  for (const s of plan.signs) { const [x, y] = px(...pointOnEdge(world, s.edge, s.s)); const r = Math.max(4, sc * 1.8); g.fillStyle = '#e8f0ff'; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y + r); g.lineTo(x - r, y + r); g.fill(); }
  const r = Math.max(4, sc * 1.8); g.lineWidth = Math.max(2, sc * 0.6);
  for (const [c, o] of env.heat.ends) {
    const [x0, y0] = cell(c); const x = x0 + sc / 2; const y = y0 + sc / 2;
    if (o === 'e') { g.fillStyle = '#9fffc0'; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y + r); g.lineTo(x - r, y + r); g.closePath(); g.fill(); }
    else if (o === 'c') { g.strokeStyle = '#ff6b6b'; g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke(); }
    else if (o === 'l') { g.fillStyle = '#c8d2ee'; g.beginPath(); g.arc(x, y, r * 0.5, 0, 7); g.fill(); }
    else { g.strokeStyle = '#7fb2ff'; g.beginPath(); g.arc(x, y, r * 0.8, 0, 7); g.stroke(); }
  }
}
