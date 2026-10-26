// Floor plans of the two levels, drawn on 2D canvases.

import { G, C, nodeXYL } from '../sim/world.js';

export function makePlans(groundCanvas, canopyCanvas) {
  let world = null;
  let rays = null;
  let palette = null;
  const backgrounds = [null, null];
  const sounds = [];

  function cellSize(canvas) {
    const w = canvas.clientWidth || 360;
    return w / world.W;
  }

  function fit(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cs = cellSize(canvas);
    const w = Math.round(cs * world.W * dpr);
    const h = Math.round(cs * world.H * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    canvas.style.aspectRatio = `${world.W} / ${world.H}`;
    return { cs: cs * dpr, dpr };
  }

  function drawBackground(level, canvas) {
    const { cs } = fit(canvas);
    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    const g = off.getContext('2d');
    const { W, H, ground, canopy } = world;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let fill = palette.planFree;
        let mark = null;
        if (level === 0) {
          switch (ground[i]) {
            case G.TREE: mark = palette.tree; break;
            case G.BUSH: fill = palette.bush; break;
            case G.ROCK: fill = palette.rock; break;
            case G.WALL: fill = palette.wall; break;
            case G.LADDER: fill = palette.ladder; break;
            default: break;
          }
        } else {
          switch (canopy[i]) {
            case C.AIR: fill = palette.planAir; break;
            case C.PLATFORM: fill = palette.platform; break;
            case C.BRIDGE: fill = palette.bridge; break;
            case C.FOLIAGE: fill = palette.foliage; break;
            case C.LADDER: fill = palette.ladder; break;
            default: break;
          }
        }
        g.fillStyle = fill;
        g.fillRect(x * cs, y * cs, cs + 0.5, cs + 0.5);
        if (mark) {
          g.fillStyle = mark;
          g.beginPath();
          g.arc((x + 0.5) * cs, (y + 0.5) * cs, cs * 0.42, 0, Math.PI * 2);
          g.fill();
        }
        if ((level === 0 && ground[i] === G.LADDER) || (level === 1 && canopy[i] === C.LADDER)) {
          g.strokeStyle = palette.planInk;
          g.lineWidth = Math.max(1, cs * 0.08);
          g.beginPath();
          g.moveTo((x + 0.3) * cs, (y + 0.15) * cs); g.lineTo((x + 0.3) * cs, (y + 0.85) * cs);
          g.moveTo((x + 0.7) * cs, (y + 0.15) * cs); g.lineTo((x + 0.7) * cs, (y + 0.85) * cs);
          for (const t of [0.35, 0.5, 0.65]) { g.moveTo((x + 0.3) * cs, (y + t) * cs); g.lineTo((x + 0.7) * cs, (y + t) * cs); }
          g.stroke();
        }
      }
    }
    // a light grid on walkable cells
    g.strokeStyle = palette.planGrid;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= W; x++) { g.moveTo(x * cs, 0); g.lineTo(x * cs, H * cs); }
    for (let y = 0; y <= H; y++) { g.moveTo(0, y * cs); g.lineTo(W * cs, y * cs); }
    g.stroke();
    backgrounds[level] = off;
  }

  function setMap(newWorld, newRays, newPalette) {
    world = newWorld;
    rays = newRays;
    palette = newPalette;
    sounds.length = 0;
    drawBackground(0, groundCanvas);
    drawBackground(1, canopyCanvas);
  }

  function addSounds(game, now) {
    for (const s of game.sounds) if (s.heard) sounds.push({ node: s.node, who: s.who, born: now });
  }

  function drawAgent(g, cs, agent, color, level, showCone) {
    const { x, y, level: l } = nodeXYL(world, agent.node);
    const cx = (x + 0.5) * cs;
    const cy = (y + 0.5) * cs;
    const own = l === level;
    if (own && showCone) {
      // horizontal slice of the vision cone, clipped by the cached rays
      const i0 = world.nodeIndex[agent.node] * rays.R;
      const pts = [];
      rays.dirs.forEach((d, r) => {
        if (d.el !== 0) return;
        const a = Math.atan2(Math.sin(d.az - agent.facing), Math.cos(d.az - agent.facing));
        if (Math.abs(a) > (world.config.coneHorizontalDeg / 2) * Math.PI / 180 + 1e-9) return;
        const len = rays.lengths[i0 + r];
        pts.push({ a, px: cx + d.dx * len * cs, py: cy + d.dy * len * cs });
      });
      pts.sort((p, q) => p.a - q.a);
      g.fillStyle = color;
      g.globalAlpha = 0.22;
      g.beginPath();
      g.moveTo(cx, cy);
      for (const p of pts) g.lineTo(p.px, p.py);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
    }
    g.save();
    g.translate(cx, cy);
    g.rotate(agent.facing);
    g.globalAlpha = own ? 1 : 0.35;
    g.fillStyle = color;
    g.strokeStyle = palette.planInk;
    g.lineWidth = Math.max(1, cs * 0.08);
    g.beginPath();
    g.moveTo(cs * 0.62, 0);
    g.lineTo(-cs * 0.4, cs * 0.38);
    g.lineTo(-cs * 0.22, 0);
    g.lineTo(-cs * 0.4, -cs * 0.38);
    g.closePath();
    if (own) g.fill(); else g.setLineDash([cs * 0.15, cs * 0.12]);
    g.stroke();
    g.restore();
  }

  function draw(game, now, showCone) {
    if (!world || !game) return;
    [groundCanvas, canopyCanvas].forEach((canvas, level) => {
      const { cs, dpr } = fit(canvas);
      if (backgrounds[level].width !== canvas.width) drawBackground(level, canvas);
      const g = canvas.getContext('2d');
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.drawImage(backgrounds[level], 0, 0);
      for (const s of sounds) {
        const { x, y, level: l } = nodeXYL(world, s.node);
        if (l !== level) continue;
        const age = (now - s.born) / 1400;
        if (age >= 1) continue;
        g.strokeStyle = s.who === 'police' ? palette.police : palette.thief;
        g.globalAlpha = 1 - age;
        g.lineWidth = 2 * dpr;
        g.beginPath();
        g.arc((x + 0.5) * cs, (y + 0.5) * cs, cs * (0.4 + age * 4), 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
      drawAgent(g, cs, game.police, palette.police, level, showCone);
      drawAgent(g, cs, game.thief, palette.thief, level, showCone);
    });
    for (let i = sounds.length - 1; i >= 0; i--) if (now - sounds[i].born > 1400) sounds.splice(i, 1);
  }

  return { setMap, addSounds, draw, redrawBackgrounds: (p) => { palette = p; if (world) { drawBackground(0, groundCanvas); drawBackground(1, canopyCanvas); } } };
}
