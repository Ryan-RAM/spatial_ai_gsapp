// Floor plans of the two levels, drawn on 2D canvases.

import { G, C, nodeXYL } from '../sim/world.js';

export function makePlans(groundCanvas, canopyCanvas) {
  let world = null;
  let rays = null;
  let palette = null;
  let exits = [];
  const backgrounds = [null, null];
  const sounds = [];
  const flashes = [];   // completed movements (up, down, around, past), drawn for a moment
  const FLASH_MS = 2600;

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
    // exits: a lit cell with an arrow pointing out of the map
    if (level === 0) {
      const OUT = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
      for (const e of exits) {
        const x = e.node % W;
        const y = Math.floor(e.node / W);
        const [dx, dy] = OUT[e.side];
        g.fillStyle = palette.exit;
        g.fillRect(x * cs, y * cs, cs, cs);
        g.fillRect((x + dx) * cs, (y + dy) * cs, cs, cs);
        g.fillStyle = palette.planInk;
        g.beginPath();
        const cx = (x + 0.5 + dx * 0.5) * cs;
        const cy = (y + 0.5 + dy * 0.5) * cs;
        g.moveTo(cx + dx * cs * 0.45, cy + dy * cs * 0.45);
        g.lineTo(cx - dy * cs * 0.3 - dx * cs * 0.1, cy + dx * cs * 0.3 - dy * cs * 0.1);
        g.lineTo(cx + dy * cs * 0.3 - dx * cs * 0.1, cy - dx * cs * 0.3 - dy * cs * 0.1);
        g.closePath();
        g.fill();
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

  function setMap(newWorld, newRays, newPalette, newExits = []) {
    world = newWorld;
    rays = newRays;
    palette = newPalette;
    exits = newExits;
    sounds.length = 0;
    flashes.length = 0;
    drawBackground(0, groundCanvas);
    drawBackground(1, canopyCanvas);
  }

  function addSounds(game, now) {
    for (const s of game.sounds) if (s.heard) sounds.push({ node: s.node, who: s.who, born: now });
    for (const m of game.relations.movement) {
      if (m.kind === 'up' || m.kind === 'down' || m.kind === 'around' || m.kind === 'past') flashes.push({ ...m, born: now });
    }
  }

  const colorOf = (who) => ({ police: palette.police, thief: palette.thief, owl: palette.owl }[who] ?? palette.planInk);
  const centre = (n, cs) => { const { x, y, level } = nodeXYL(world, n); return { x: (x + 0.5) * cs, y: (y + 0.5) * cs, level }; };

  // A small owl: round body, two ear tufts, two eyes that light up while it watches the thief.
  function drawOwl(g, cs, owl, level) {
    const c = centre(owl.node, cs);
    if (c.level !== level) return;
    const r = cs * 0.42;
    g.save();
    g.translate(c.x, c.y);
    if (owl.watching) {
      g.strokeStyle = palette.owl;
      g.lineWidth = Math.max(1.5, cs * 0.12);
      g.setLineDash([cs * 0.2, cs * 0.14]);
      g.strokeRect(-cs * 1.5, -cs * 1.5, cs * 3, cs * 3);
      g.setLineDash([]);
    }
    g.fillStyle = palette.owl;
    g.strokeStyle = palette.planInk;
    g.lineWidth = Math.max(1, cs * 0.07);
    g.beginPath();
    g.moveTo(-r * 0.85, -r * 0.55); g.lineTo(-r * 0.55, -r * 1.15); g.lineTo(-r * 0.2, -r * 0.75);
    g.lineTo(r * 0.2, -r * 0.75); g.lineTo(r * 0.55, -r * 1.15); g.lineTo(r * 0.85, -r * 0.55);
    g.arc(0, 0, r, -0.6, Math.PI + 0.6);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = owl.watching ? palette.rel : palette.planFree;
    for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * r * 0.38, -r * 0.2, r * 0.27, 0, Math.PI * 2); g.fill(); g.stroke(); }
    g.restore();
  }

  function label(g, cs, x, y, text, color) {
    g.font = `700 ${Math.round(cs * 0.62)}px system-ui, sans-serif`;
    const w = g.measureText(text).width + cs * 0.4;
    const h = cs * 0.85;
    g.save();
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    g.fill();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x, y + cs * 0.03);
    g.restore();
  }

  function arrow(g, cs, a, b, color, dashed) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    const ux = dx / len;
    const uy = dy / len;
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = Math.max(1.5, cs * 0.14);
    g.setLineDash(dashed ? [cs * 0.18, cs * 0.14] : []);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x - ux * cs * 0.35, b.y - uy * cs * 0.35);
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    g.moveTo(b.x, b.y);
    g.lineTo(b.x - ux * cs * 0.5 - uy * cs * 0.3, b.y - uy * cs * 0.5 + ux * cs * 0.3);
    g.lineTo(b.x - ux * cs * 0.5 + uy * cs * 0.3, b.y - uy * cs * 0.5 - ux * cs * 0.3);
    g.closePath();
    g.fill();
  }

  // Position relations that hold right now, drawn on the plan of each level.
  function drawRelations(g, cs, game, level, now) {
    const rel = game.relations;
    const pulse = 0.6 + 0.4 * Math.sin(now / 220);
    for (const r of rel.position) {
      if (r.kind === 'above') {
        // both plans: a double ring at each agent's column, the label says which way
        for (const who of [r.upper, r.lower]) {
          const c = centre(game[who].node, cs);
          g.strokeStyle = colorOf(who);
          g.lineWidth = Math.max(1.5, cs * 0.12);
          for (const k of [0.75, 1.05]) { g.beginPath(); g.arc(c.x, c.y, cs * k, 0, Math.PI * 2); g.stroke(); }
          if (c.level === level) label(g, cs, c.x, c.y - cs * 1.6, who === r.upper ? '\u25B2 ABOVE' : '\u25BC BELOW', colorOf(who));
        }
      } else if (r.kind === 'behind') {
        // the rear half of the observer's view, filled while someone stands in it
        const o = game[r.of];
        const c = centre(o.node, cs);
        if (c.level !== level) continue;
        const R = world.config.visionRange * cs;
        g.fillStyle = colorOf(r.who);
        g.globalAlpha = 0.13 + 0.07 * pulse;
        g.beginPath();
        g.moveTo(c.x, c.y);
        g.arc(c.x, c.y, R, o.facing + Math.PI / 2, o.facing + Math.PI * 1.5);
        g.closePath();
        g.fill();
        g.globalAlpha = 1;
        g.strokeStyle = colorOf(r.who);
        g.lineWidth = Math.max(1, cs * 0.08);
        g.setLineDash([cs * 0.25, cs * 0.2]);
        g.stroke();
        g.setLineDash([]);
        const t = centre(game[r.who].node, cs);
        if (t.level === level) label(g, cs, t.x, t.y + cs * 1.4, 'BEHIND', colorOf(r.who));
      } else if (r.kind === 'adjacent') {
        // one outline around both cells: nothing occupiable between them
        const a = nodeXYL(world, game[r.a].node);
        const b = nodeXYL(world, r.node);
        if (a.level !== level && b.level !== level) continue;
        const x0 = Math.min(a.x, b.x);
        const y0 = Math.min(a.y, b.y);
        const x1 = Math.max(a.x, b.x) + 1;
        const y1 = Math.max(a.y, b.y) + 1;
        g.strokeStyle = palette.rel;
        g.lineWidth = Math.max(2, cs * 0.18);
        g.beginPath();
        g.roundRect(x0 * cs - 2, y0 * cs - 2, (x1 - x0) * cs + 4, (y1 - y0) * cs + 4, cs * 0.3);
        g.stroke();
      } else if (r.kind === 'between') {
        // the line from the thief to what it wants, crossed out where the officer stands
        const a = centre(game.thief.node, cs);
        const b = centre(r.node, cs);
        const m = centre(game.police.node, cs);
        if (m.level !== level && a.level !== level) continue;
        g.strokeStyle = palette.police;
        g.globalAlpha = 0.85;
        g.lineWidth = Math.max(1.5, cs * 0.12);
        g.setLineDash([cs * 0.35, cs * 0.25]);
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        g.setLineDash([]);
        g.globalAlpha = 1;
        if (m.level === level) {
          const k = cs * 0.55;
          g.lineWidth = Math.max(2, cs * 0.2);
          g.beginPath();
          g.moveTo(m.x - k, m.y - k); g.lineTo(m.x + k, m.y + k);
          g.moveTo(m.x + k, m.y - k); g.lineTo(m.x - k, m.y + k);
          g.stroke();
          label(g, cs, m.x, m.y - cs * 1.5, r.b === 'exit' ? 'CUT OFF' : 'IN THE WAY', palette.police);
        }
      } else if (r.kind === 'among') {
        // a dotted 3 by 3 frame: the agent is surrounded by solid cover
        const c = nodeXYL(world, game[r.who].node);
        if (c.level !== level) continue;
        g.strokeStyle = colorOf(r.who);
        g.lineWidth = Math.max(1, cs * 0.09);
        g.setLineDash([cs * 0.08, cs * 0.16]);
        g.strokeRect((c.x - 1) * cs, (c.y - 1) * cs, cs * 3, cs * 3);
        g.setLineDash([]);
      }
    }
    // toward / away: the step just taken, solid when closing in, dashed when opening up
    for (const m of rel.movement) {
      if (m.kind !== 'toward' && m.kind !== 'away') continue;
      const a = centre(m.from, cs);
      const b = centre(m.to, cs);
      if (a.level !== level || b.level !== level) continue;
      arrow(g, cs, a, b, colorOf(m.who), m.kind === 'away');
    }
    // completed movements, fading out
    for (const f of flashes) {
      const age = (now - f.born) / FLASH_MS;
      if (age >= 1) continue;
      g.globalAlpha = 1 - age * age;
      if (f.kind === 'up' || f.kind === 'down') {
        const c = centre(f.node, cs);
        const lift = (f.kind === 'up' ? -1 : 1) * age * cs * 1.2;
        label(g, cs, c.x, c.y - cs * 1.4 + lift, f.kind === 'up' ? '\u2191 UP' : '\u2193 DOWN', colorOf(f.who));
      } else if (f.kind === 'around') {
        const pts = f.trail.map((n) => centre(n, cs)).filter((p) => p.level === level);
        if (pts.length > 1) {
          g.strokeStyle = colorOf(f.who);
          g.lineWidth = Math.max(2, cs * 0.22);
          g.lineJoin = 'round';
          g.beginPath();
          pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
          g.stroke();
          arrow(g, cs, pts[pts.length - 2], pts[pts.length - 1], colorOf(f.who), false);
        }
        const c = centre(f.center, cs);
        if (c.level === level) label(g, cs, c.x, c.y + cs * 1.5, 'AROUND', colorOf(f.who));
      } else if (f.kind === 'past') {
        const c = centre(f.node, cs);
        if (c.level === level) {
          g.strokeStyle = palette.thief;
          g.lineWidth = Math.max(2, cs * 0.16);
          g.beginPath(); g.arc(c.x, c.y, cs * (0.6 + age * 1.5), 0, Math.PI * 2); g.stroke();
          label(g, cs, c.x, c.y - cs * 1.5, '\u00BB PAST', palette.thief);
        }
      }
      g.globalAlpha = 1;
    }
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

  function draw(game, now, showCone, showRelations = true) {
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
        g.strokeStyle = colorOf(s.who);
        g.globalAlpha = 1 - age;
        g.lineWidth = 2 * dpr;
        g.beginPath();
        g.arc((x + 0.5) * cs, (y + 0.5) * cs, cs * (0.4 + age * 4), 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
      // the diamond on its cell, or above the thief once stolen
      const dn = game.diamond.carried ? game.thief.node : game.diamond.home;
      const dp = nodeXYL(world, dn);
      if (dp.level === level) {
        const r = cs * (game.diamond.carried ? 0.32 : 0.45);
        const cx = (dp.x + 0.5) * cs + (game.diamond.carried ? cs * 0.55 : 0);
        const cy = (dp.y + 0.5) * cs - (game.diamond.carried ? cs * 0.55 : 0);
        g.fillStyle = palette.diamond;
        g.strokeStyle = palette.planInk;
        g.lineWidth = Math.max(1, cs * 0.07);
        g.beginPath();
        g.moveTo(cx, cy - r * 1.25); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r * 1.25); g.lineTo(cx - r, cy);
        g.closePath();
        g.fill();
        g.stroke();
      }
      for (const o of game.owls) drawOwl(g, cs, o, level);
      if (showRelations) drawRelations(g, cs, game, level, now);
      drawAgent(g, cs, game.police, palette.police, level, showCone);
      drawAgent(g, cs, game.thief, palette.thief, level, showCone);
    });
    for (let i = sounds.length - 1; i >= 0; i--) if (now - sounds[i].born > 1400) sounds.splice(i, 1);
    for (let i = flashes.length - 1; i >= 0; i--) if (now - flashes[i].born > FLASH_MS) flashes.splice(i, 1);
  }

  return { setMap, addSounds, draw, redrawBackgrounds: (p) => { palette = p; if (world) { drawBackground(0, groundCanvas); drawBackground(1, canopyCanvas); } } };
}
