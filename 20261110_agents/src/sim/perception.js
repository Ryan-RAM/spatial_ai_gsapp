// The vision cone. Each sensing step casts rays across the agent's horizontal opening angle over
// the height raster. A ray reveals every cell it crosses (land or water, and the height of what
// stands there) and stops at the first building taller than the agent's eye, so a tower hides
// what is behind it. Rule-layer features (lane gates, no-fly boundaries, pads, heliports, band
// signs) are learned when a ray crosses their cell. Other agents are seen when they are inside
// the cone (horizontal and vertical angle, range) with a clear 3D line of sight.

import { F } from './world.js';
import { wrapAngle } from './geo.js';

export function coneOf(agent) { return agent.spec.cone; }

export function inCone(agent, x, y, z, cone = coneOf(agent), rangeFactor = 1) {
  const dx = x - agent.x, dy = y - agent.y, dz = z - agent.z;
  const d = Math.hypot(dx, dy);
  if (Math.hypot(d, dz) > cone.range * rangeFactor) return false;
  if (d < 1) return true;
  const half = (cone.horizontal * Math.PI) / 360;
  if (Math.abs(wrapAngle(Math.atan2(dy, dx) - agent.heading)) > half) return false;
  const elev = Math.atan2(dz, d);
  return Math.abs(elev) <= (cone.vertical * Math.PI) / 180;
}

// Is the straight 3D line between two points clear of buildings (on the raster)?
export function lineOfSight(world, ax, ay, az, bx, by, bz) {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(d / (world.cs * 0.5)));
  for (let s = 1; s < n; s++) {
    const t = s / n;
    const c = world.cellOf(ax + (bx - ax) * t, ay + (by - ay) * t);
    if (c >= 0 && world.height[c] > az + (bz - az) * t) return false;
  }
  return true;
}

// Returns the list of events this look produced (new obstacle on the plan, features learned...).
export function sense(agent, sim) {
  const world = sim.world; const k = agent.knowledge; const cone = coneOf(agent);
  const out = { blockedNew: [], learned: [] };
  const half = (cone.horizontal * Math.PI) / 360;
  const nRays = Math.min(61, Math.max(9, Math.ceil((2 * half * cone.range) / world.cs) + 1));
  const step = world.cs * 0.5;
  const steps = Math.ceil(cone.range / step);
  const eye = agent.z + 3;
  for (let r = 0; r < nRays; r++) {
    const a = agent.heading - half + (2 * half * r) / (nRays - 1);
    const ux = Math.cos(a), uy = Math.sin(a);
    let last = -2;
    for (let s = 0; s <= steps; s++) {
      const c = world.cellOf(agent.x + ux * step * s, agent.y + uy * step * s);
      if (c < 0) break;
      if (c === last) continue;
      last = c;
      const top = world.height[c];
      const before = k.knownHeight(c);
      k.see(c, top, world.land[c]);
      if (top > before + 2 && agent.isBlockingHeight(top)) out.blockedNew.push(c);
      if (agent.type === 'drone') { const es = world.net?.cellEdges.get(c); if (es) for (const e of es) k.edges.add(e); }
      const fs = world.features.get(c);
      if (fs) for (const f of fs) learnFeature(agent, sim, { ...f, cell: c }, out);
      if (top > eye) break; // the building hides what is behind it
    }
  }
  // Helicopter crews also pick out tall towers and bridges far away as references.
  if (agent.type !== 'drone') {
    for (const ref of world.refs) {
      if (k.refs.has(ref.id)) continue;
      const far = ref.kind === 'tower' || ref.kind === 'bridge';
      const z = Math.max(ref.z * 0.8, 5);
      if (!inCone(agent, ref.x, ref.y, Math.min(z, agent.z), cone, far ? sim.config.heli.refRangeFactor : 1)) continue;
      if (far || lineOfSight(world, agent.x, agent.y, agent.z, ref.x, ref.y, z)) { k.refs.add(ref.id); out.learned.push({ kind: 'ref', ref }); }
    }
  }
  // Other agents.
  const seen = [];
  for (const o of sim.neighbours(agent.x, agent.y, cone.range)) {
    if (o === agent || !o.active) continue;
    if (!inCone(agent, o.x, o.y, o.z, cone)) continue;
    if (!lineOfSight(world, agent.x, agent.y, agent.z, o.x, o.y, o.z)) continue;
    seen.push(o);
    k.agents.set(o.id, { x: o.x, y: o.y, z: o.z, t: sim.time, type: o.type });
  }
  agent.visible = seen;
  return out;
}

function learnFeature(agent, sim, f, out) {
  const world = sim.world; const k = agent.knowledge;
  if (f.kind === F.LANE) {
    const node = world.laneNodes[f.id];
    if (k.learnLaneNode(node)) out.learned.push({ kind: 'lane', node });
  } else if (f.kind === F.NFZ) {
    const z = world.noFly[f.id];
    if (k.learnNoFly(z)) out.learned.push({ kind: 'nfz', zone: z });
  } else if (f.kind === F.HELIPORT) {
    if (!k.heliports.has(f.id)) { k.heliports.add(f.id); out.learned.push({ kind: 'heliport', heliport: world.heliports[f.id] }); }
  } else if (f.kind === F.PAD) {
    if (!k.pads.has(f.id)) { k.pads.add(f.id); out.learned.push({ kind: 'pad', pad: world.pads[f.id] }); }
  } else if (f.kind === F.CORRIDOR) {
    if (agent.type === 'drone' && !k.corridors.has(f.id)) {
      k.corridors.add(f.id);
      const c = f.cell;
      out.learned.push({ kind: 'corridor', corridor: world.net.corridors[f.id], at: { x: world.cx(c), y: world.cy(c) } });
    }
  } else if (f.kind === F.SIGN) {
    if (!k.bandRule) { k.bandRule = true; out.learned.push({ kind: 'band', sign: world.signs[f.id] }); }
  }
}
