// The 2D map (ROADMAP M5.3): the same simulation state as the 3D view, drawn from above on a
// canvas. The ground cover is drawn once into an offscreen image; each frame only the layers on
// top are drawn. Every layer can be switched on and off. A click reports the point in the frames
// of §5: W (metres), P (path edge, metres along, offset), N (named place), and E (relative to the
// followed agent).

import { PALETTE, hex } from './palette.js';
import { pointOnEdge } from '../sim/interventions.js';

export const LAYERS = {
  cover: 'Ground cover', paths: 'Paths', snow: 'Snow depth', light: 'Light', plan: 'Interventions',
  knowledge: 'What the agent knows', tracks: 'Tracks', landmarks: 'Landmarks', routes: 'Planned vs walked', cones: 'Vision cones',
};
const COVER_RGB = [[26, 30, 46], [190, 196, 214], [150, 150, 170], [120, 136, 168], [58, 72, 104], [36, 48, 74], [96, 98, 118], [28, 40, 72], [52, 54, 72]];

export function makeMap2D(canvas, world, frames) {
  const ctx = canvas.getContext('2d');
  const on = { cover: true, paths: true, snow: false, light: true, plan: true, knowledge: false, tracks: true, landmarks: true, routes: true, cones: true };
  // the base image: one pixel per cell
  const base = document.createElement('canvas'); base.width = world.W; base.height = world.H;
  {
    const b = base.getContext('2d'); const img = b.createImageData(world.W, world.H);
    for (let k = 0; k < world.n; k++) { const c = COVER_RGB[world.cover[k]]; const shade = 0.75 + 0.25 * (world.openness[k] / 255); img.data.set([c[0] * shade, c[1] * shade, c[2] * shade, 255], k * 4); }
    b.putImageData(img, 0, 0);
  }
  const over = document.createElement('canvas'); over.width = world.W; over.height = world.H; const octx = over.getContext('2d');
  let scale = 1; let ox = 0; let oy = 0;
  const toPx = (x, y) => [ox + ((x - world.minX) / world.s) * scale, oy + ((world.maxY - y) / world.s) * scale];
  const toW = (px, py) => [world.minX + ((px - ox) / scale) * world.s, world.maxY - ((py - oy) / scale) * world.s];
  let picked = null; let lastState = null; let followId = 0;

  function resize(w, h) {
    canvas.width = w; canvas.height = h;
    scale = Math.min(w / world.W, h / world.H); ox = (w - world.W * scale) / 2; oy = (h - world.H * scale) / 2;
  }

  function cellOverlay(state, agent) {
    // per-cell layers drawn into a W x H image, scaled up with the base
    const img = octx.createImageData(world.W, world.H); const d = img.data; let any = false;
    for (let k = 0; k < world.n; k++) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      if (on.snow) { const v = Math.min(1, state.snow.depth[k] / 120); r = 230; g = 238; b = 255; a = 160 * v; }
      if (on.light && state.layers.light[k]) { r = 242; g = 166; b = 90; a = 110; }
      if (on.plan && state.layers.plowed[k]) { r = 210; g = 220; b = 240; a = 200; }
      if (on.plan && state.layers.closed[k]) { r = 200; g = 70; b = 80; a = 220; }
      if (on.knowledge && agent && !agent.k.seen[k]) { r = 5; g = 6; b = 12; a = 200; }  // unknown to the agent: dark
      if (a) { d.set([r, g, b, a], k * 4); any = true; }
    }
    if (any) { octx.putImageData(img, 0, 0); ctx.drawImage(over, ox, oy, world.W * scale, world.H * scale); }
  }

  function draw(state) {
    lastState = state;
    const W = canvas.width; const H = canvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = hex(PALETTE.sky); ctx.fillRect(0, 0, W, H);
    if (on.cover) ctx.drawImage(base, ox, oy, world.W * scale, world.H * scale);
    const agent = state.agents.find((a) => a.id === followId) ?? state.agents[0];
    cellOverlay(state, agent);
    const line = (pts, color, width = 1, dash = []) => { if (pts.length < 2) return; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath(); pts.forEach(([x, y], q) => { const [px, py] = toPx(x, y); q ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); ctx.setLineDash([]); };
    const dot = (x, y, r, color) => { const [px, py] = toPx(x, y); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); };
    if (on.paths) for (const e of world.paths.edges) line(e.pts, e.bridge ? '#c9b8ff' : 'rgba(225,230,245,0.55)', Math.max(1, scale * 0.5));
    if (on.paths) for (const e of world.paths.exits) { const [px, py] = toPx(e.x, e.y); ctx.fillStyle = '#e8f0ff'; ctx.font = `${Math.max(10, scale * 4)}px system-ui`; ctx.textAlign = px > W - 50 ? 'right' : 'left'; ctx.fillText(e.id, px + (px > W - 50 ? -6 : 4), py - 4); ctx.textAlign = 'left'; dot(e.x, e.y, Math.max(3, scale * 1.5), '#e8f0ff'); }
    if (on.plan) {
      for (const l of state.layers.plan.lamps) { const [x, y] = pointOnEdge(world, l.edge, l.s); dot(x, y, Math.max(3, scale * 1.4), hex(PALETTE.warm)); }
      for (const nd of state.layers.plan.shelters) { const n = world.paths.nodes[nd]; const [px, py] = toPx(n.x, n.y); const r = Math.max(5, scale * 2.5); ctx.fillStyle = hex(PALETTE.warm); ctx.fillRect(px - r, py - r, 2 * r, 2 * r); }
      for (const sg of state.layers.plan.signs) { const [x, y] = pointOnEdge(world, sg.edge, sg.s); const [px, py] = toPx(x, y); const r = Math.max(4, scale * 2); ctx.fillStyle = '#e8f0ff'; ctx.beginPath(); ctx.moveTo(px, py - r); ctx.lineTo(px + r, py + r); ctx.lineTo(px - r, py + r); ctx.fill(); }
    }
    if (on.tracks) {
      const sn = state.snow;
      for (let k = 0; k < world.n; k++) { const t = sn.trackAt(k); if (t < 0) continue; const r = sn.readability(t); if (r < 0.05) continue; const tr = sn.track(t); const [x, y] = world.center(k); dot(x, y, Math.max(1, scale * 0.6), tr.kind ? `rgba(200,255,216,${r})` : `rgba(240,240,255,${0.8 * r})`); }
    }
    if (agent && on.routes) {
      line(agent.k.trail.map((c) => world.center(c)), 'rgba(160,190,255,0.9)', Math.max(1.5, scale * 0.6));                     // walked
      if (agent.route) line(agent.route.slice(agent.routeIdx).map((c) => world.center(c)), hex(PALETTE.warm), Math.max(1.5, scale * 0.6), [4, 3]); // planned
    }
    if (agent && on.landmarks) {
      const lasting = agent.k.landmarks.filter((l) => !['heard', 'sighting', 'catch'].includes(l.type));
      line(lasting.map((l) => [l.x, l.y]), 'rgba(255,255,255,0.35)', 1, [2, 3]);                                                 // the chain
      for (const l of agent.k.landmarks) dot(l.x, l.y, Math.max(2.5, scale), { dead_end: '#ff8a8a', junction: '#cfd8ff', heard: '#ffd29a', sighting: '#ff6b4a', exit: '#9fffc0' }[l.type] ?? '#ffffff');
    }
    const c = state.creatures[0];
    if (on.cones) for (const a of [...state.agents.filter((x) => !x.outcome), ...(c ? [c] : [])]) {
      const cone = a.kind === 'creature' ? a.memory.lastCone : a.k.lastCone; if (!cone) continue;
      ctx.fillStyle = a.kind === 'creature' ? 'rgba(200,255,216,0.16)' : 'rgba(242,166,90,0.22)';
      ctx.beginPath(); cone.forEach(([x, y], q) => { const [px, py] = toPx(x, y); q ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.closePath(); ctx.fill();
    }
    for (const a of state.agents) { if (a.outcome === 'escaped' || a.outcome === 'caught') continue; const [x, y] = world.center(a.cell); dot(x, y, Math.max(3.5, scale * 1.6), a.id === followId ? '#ffffff' : '#c8d2ee'); }
    if (c) { const [x, y] = world.center(c.cell); dot(x, y, Math.max(4.5, scale * 2), hex(PALETTE.eye)); dot(x, y, Math.max(2, scale), '#000000'); }
    if (picked) { const [px, py] = toPx(picked.x, picked.y); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.stroke(); }
  }

  // a click: the point in every frame of reference (§5)
  function pick(px, py) {
    const [x, y] = toW(px, py); const k = world.cellOf(x, y); if (k < 0) return null;
    const P = frames.toP(x, y); const N = frames.toN(x, y);
    const agent = lastState?.agents.find((a) => a.id === followId);
    const E = agent ? frames.toE({ x: world.center(agent.cell)[0], y: world.center(agent.cell)[1], heading: agent.heading ?? 0 }, x, y) : null;
    picked = {
      x, y, cell: k, i: k % world.W, j: Math.floor(k / world.W), z: world.groundAt(x, y), cover: world.legend[world.cover[k]],
      P: P ? { edge: P.edge, s: P.s, offset: P.offset, name: world.paths.edges[P.edge].name } : null,
      N: N ? { place: N.place, bearing: N.bearing, distance: N.distance, words: frames.describeN(x, y) } : null,
      E, snowCm: lastState ? lastState.snow.depth[k] : null,
    };
    return picked;
  }

  return { draw, resize, pick, on, setLayer: (name, v) => { on[name] = v; }, follow: (id) => { followId = id; }, toPx, toW };
}
