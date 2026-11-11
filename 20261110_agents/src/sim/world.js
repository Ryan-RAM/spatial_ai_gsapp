// The ground truth: buildings rasterised onto the planning grid, land and water, and the rule
// layer (lanes, altitude bands, no-fly zones, heliports, rooftop pads, band signs). Agents never
// read this directly; they only learn what their vision cone shows them (perception.js).

import { FT } from './config.js';
import { makeFrame, pointInPoly, polyBounds, polyArea, polyCentroid, closestOnSegment } from './geo.js';
import { makePlaceholder } from './placeholder.js';
import { buildDroneNet } from './streets.js';

// Feature kinds that can be discovered by looking at a cell.
export const F = { LANE: 1, NFZ: 2, HELIPORT: 3, PAD: 4, SIGN: 5, CORRIDOR: 6 };
export const TYPE_BIT = { drone: 1, tour: 2, medical: 4 };

// data = { source, buildings: [{ top, base, name, p: [x0, y0, ...] }], land: [{ name, p }] }
// in local metres (see geo.js). `loadData` in ../ui/main.js and tests/run_sim.mjs make it.
export function buildWorld(config, data = null) {
  const frame = makeFrame(config.site);
  if (!data) data = makePlaceholder(config, frame);
  const cs = config.site.cellSize;
  const W = Math.ceil(frame.width / cs), H = Math.ceil(frame.height / cs), N = W * H;
  const cellOf = (x, y) => {
    const i = Math.floor(x / cs), j = Math.floor(y / cs);
    return i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i;
  };
  const cx = (c) => ((c % W) + 0.5) * cs;
  const cy = (c) => (Math.floor(c / W) + 0.5) * cs;

  const world = { config, frame, data, source: data.source, W, H, N, cs, cellOf, cx, cy };

  // ---- land / water ----------------------------------------------------------------------
  const land = new Uint8Array(N);
  for (const l of data.land) {
    const [x0, y0, x1, y1] = polyBounds(l.p);
    for (let j = Math.max(0, Math.floor(y0 / cs)); j <= Math.min(H - 1, Math.floor(y1 / cs)); j++) {
      for (let i = Math.max(0, Math.floor(x0 / cs)); i <= Math.min(W - 1, Math.floor(x1 / cs)); i++) {
        if (pointInPoly((i + 0.5) * cs, (j + 0.5) * cs, l.p)) land[j * W + i] = 1;
      }
    }
  }
  world.land = land;
  world.landPolys = data.land;

  // ---- buildings and structures -> height raster (top of the tallest thing in the cell, m MSL)
  const height = new Float32Array(N);
  const tallestIn = new Int32Array(N).fill(-1);
  const mark = (c, top, bi) => { if (c >= 0 && top > height[c]) { height[c] = top; tallestIn[c] = bi; } };
  data.buildings.forEach((b, bi) => {
    const [x0, y0, x1, y1] = polyBounds(b.p);
    let hit = false;
    for (let j = Math.max(0, Math.floor(y0 / cs)); j <= Math.min(H - 1, Math.floor(y1 / cs)); j++) {
      for (let i = Math.max(0, Math.floor(x0 / cs)); i <= Math.min(W - 1, Math.floor(x1 / cs)); i++) {
        if (pointInPoly((i + 0.5) * cs, (j + 0.5) * cs, b.p)) { mark(j * W + i, b.top, bi); hit = true; }
      }
    }
    // A footprint smaller than a cell still occupies the cell it stands in (a conservative grid).
    if (!hit) { const [mx, my] = polyCentroid(b.p); mark(cellOf(mx, my), b.top, bi); }
  });
  world.structures = config.structures.map((s) => {
    const [x, y] = frame.toXY(s.lat, s.lon);
    const top = s.heightFt * FT;
    mark(cellOf(x, y), top, -1);
    return { ...s, x, y, top };
  });
  world.height = height;
  world.tallestIn = tallestIn;

  // ---- lanes: centreline gates every laneNodeSpacing m, and the cells each lane covers -----
  const laneDirX = new Float32Array(N), laneDirY = new Float32Array(N);
  const laneOf = new Int8Array(N).fill(-1);
  world.lanes = [];
  world.laneNodes = [];
  const features = new Map(); // cell -> [{ kind, id }]
  const addFeature = (c, kind, id) => { if (c < 0) return; let a = features.get(c); if (!a) features.set(c, (a = [])); if (!a.some((f) => f.kind === kind && f.id === id)) a.push({ kind, id }); };
  config.lanes.filter((l) => l.enabled).forEach((l) => {
    const li = world.lanes.length;
    const pts = l.pts.map(([la, lo]) => frame.toXY(la, lo));
    const lane = { ...l, index: li, xy: pts, nodes: [] };
    world.lanes.push(lane);
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
      const n = Math.max(1, Math.round(len / config.laneNodeSpacing));
      for (let s = 0; s < n; s++) {
        const t = s / n;
        const node = { id: world.laneNodes.length, lane: li, x: ax + (bx - ax) * t, y: ay + (by - ay) * t, ux, uy, cells: [] };
        world.laneNodes.push(node); lane.nodes.push(node.id);
        addFeature(cellOf(node.x, node.y), F.LANE, node.id);
      }
      // cells within width/2 of this segment
      const r = l.width / 2;
      const [x0, y0, x1, y1] = [Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.max(ax, bx) + r, Math.max(ay, by) + r];
      for (let j = Math.max(0, Math.floor(y0 / cs)); j <= Math.min(H - 1, Math.floor(y1 / cs)); j++) {
        for (let i = Math.max(0, Math.floor(x0 / cs)); i <= Math.min(W - 1, Math.floor(x1 / cs)); i++) {
          const px = (i + 0.5) * cs, py = (j + 0.5) * cs;
          const [qx, qy] = closestOnSegment(px, py, ax, ay, bx, by);
          if (Math.hypot(px - qx, py - qy) <= r) { const c = j * W + i; laneDirX[c] = ux; laneDirY[c] = uy; laneOf[c] = li; }
        }
      }
    }
  });
  // Each lane cell belongs to its nearest gate; seeing a gate reveals those cells.
  const laneNodeOf = new Int32Array(N).fill(-1);
  for (let c = 0; c < N; c++) {
    if (laneOf[c] < 0) continue;
    let best = -1, bd = Infinity;
    for (const id of world.lanes[laneOf[c]].nodes) {
      const n = world.laneNodes[id]; const d = (n.x - cx(c)) ** 2 + (n.y - cy(c)) ** 2;
      if (d < bd) { bd = d; best = id; }
    }
    laneNodeOf[c] = best; world.laneNodes[best].cells.push(c);
  }
  Object.assign(world, { laneDirX, laneDirY, laneOf, laneNodeOf });

  // ---- no-fly zones ------------------------------------------------------------------------
  const nfzMask = new Uint8Array(N); // bit per agent type (TYPE_BIT) for which the cell is closed
  world.noFly = config.noFly.map((z, id) => {
    const [x, y] = frame.toXY(z.lat, z.lon);
    const bits = z.applies.reduce((m, t) => m | TYPE_BIT[t], 0);
    const nz = { ...z, id, x, y, floorM: z.floor * FT, ceilM: z.ceiling * FT, bits, cells: [] };
    const r = z.radius + cs * 0.5;
    for (let j = Math.max(0, Math.floor((y - r) / cs)); j <= Math.min(H - 1, Math.floor((y + r) / cs)); j++) {
      for (let i = Math.max(0, Math.floor((x - r) / cs)); i <= Math.min(W - 1, Math.floor((x + r) / cs)); i++) {
        const d = Math.hypot((i + 0.5) * cs - x, (j + 0.5) * cs - y);
        const c = j * W + i;
        if (d <= r) { nfzMask[c] |= bits; nz.cells.push(c); }
        if (Math.abs(d - z.radius) < cs * 0.75) addFeature(c, F.NFZ, id); // the boundary can be seen
      }
    }
    return nz;
  });
  world.nfzMask = nfzMask;
  world.inNoFly = (type, x, y, z) => world.noFly.some((n) => (n.bits & TYPE_BIT[type]) && z >= n.floorM && z <= n.ceilM && Math.hypot(x - n.x, y - n.y) < n.radius);

  // ---- heliports ---------------------------------------------------------------------------
  world.heliports = config.heliports.map((h, id) => {
    const [x, y] = frame.toXY(h.lat, h.lon);
    const hp = { ...h, index: id, x, y, z: h.elevationFt * FT, kind: 'heliport' };
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) addFeature(cellOf(x + di * cs, y + dj * cs), F.HELIPORT, id);
    return hp;
  });
  world.heliportById = Object.fromEntries(world.heliports.map((h) => [h.id, h]));

  // ---- rooftop drone pads: spread out by farthest-point sampling ---------------------------
  const dp = config.dronePads;
  const cands = [];
  data.buildings.forEach((b, bi) => {
    if (b.top < dp.minRoofFt * FT || b.top > dp.maxRoofFt * FT) return;
    if (polyArea(b.p) < dp.minFootprint) return;
    const [x, y] = polyCentroid(b.p);
    const c = cellOf(x, y);
    if (c < 0 || !land[c] || nfzMask[c]) return;
    if (height[c] > b.top + 1) return; // something taller shares the cell
    cands.push({ bi, x, y, z: b.top, c, manhattan: /manhattan/i.test(landNameAt(data.land, x, y)) });
  });
  const pads = [];
  // the six hubs are fixed places (config.droneNet.hubs); their roof is the hub pad
  for (const h of config.droneNet.hubs) {
    const [x, y] = frame.toXY(h.lat, h.lon); const c = cellOf(x, y);
    pads.push({ bi: tallestIn[c], x, y, z: Math.max(10, height[c] || config.droneNet.hubRoofFt * FT), c, name: h.name });
  }
  const pickSpread = (pool, k) => {
    if (!pool.length) return;
    if (!pads.length) { // start next to the middle of the site
      const mx = frame.width / 2, my = frame.height / 2;
      pool.sort((a, b) => Math.hypot(a.x - mx, a.y - my) - Math.hypot(b.x - mx, b.y - my));
      pads.push(pool[0]);
    }
    while (pads.length < k) {
      let best = null, bd = -1;
      for (const p of pool) {
        const d = Math.min(...pads.map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
        if (d > bd) { bd = d; best = p; }
      }
      if (!best || bd < dp.minSpacing) break;
      pads.push(best);
    }
  };
  pickSpread(cands.filter((c) => c.manhattan), dp.count);
  world.pads = pads.map((p, id) => {
    const pad = { id, x: p.x, y: p.y, z: p.z, cell: p.c, hub: id < dp.hubs, name: p.name, capacity: id < dp.hubs ? dp.hubCapacity : dp.capacity, kind: 'pad', building: p.bi };
    addFeature(p.c, F.PAD, id);
    return pad;
  });

  // ---- band signs: at the non-hub pads, heliports, every 4th lane gate and on a grid over land ---------
  const signs = [];
  const addSign = (x, y, z) => { const c = cellOf(x, y); if (c < 0) return; signs.push({ id: signs.length, x, y, z, cell: c }); addFeature(c, F.SIGN, signs.length - 1); };
  world.pads.forEach((p) => { if (!p.hub) addSign(p.x, p.y, p.z); }); // hubs have none: drones start ignorant
  world.heliports.forEach((h) => addSign(h.x, h.y, h.z));
  world.laneNodes.forEach((n, k) => { if (k % 4 === 0) addSign(n.x, n.y, 0); });
  const gs = config.bandSigns.gridSpacing;
  for (let y = gs / 2; y < frame.height; y += gs) for (let x = gs / 2; x < frame.width; x += gs) {
    const c = cellOf(x, y); if (c >= 0 && land[c]) addSign(x, y, height[c]);
  }
  world.signs = signs;
  world.features = features;

  // ---- the drone network: streets and the express corridors between hubs (streets.js) ------
  world.net = buildDroneNet(world);
  for (const cor of world.net.corridors) { // corridor signs every signEvery m along it (none on the hub roofs)
    const n = Math.max(2, Math.round(cor.len / config.droneNet.signEvery));
    for (let s = 1; s < n; s++) addFeature(cellOf(cor.x1 + ((cor.x2 - cor.x1) * s) / n, cor.y1 + ((cor.y2 - cor.y1) * s) / n), F.CORRIDOR, cor.id);
  }

  // ---- visual references for helicopters: towers, bridges, islands, rivers, the park ------
  const refs = [];
  const addRef = (kind, name, x, y, z) => refs.push({ id: refs.length, kind, name, x, y, z });
  const byHeight = data.buildings.map((b, bi) => ({ b, bi })).filter((o) => o.b.top > 180).sort((a, b) => b.b.top - a.b.top);
  for (const { b } of byHeight) {
    const [x, y] = polyCentroid(b.p);
    if (refs.some((r) => Math.hypot(r.x - x, r.y - y) < 450)) continue;
    addRef('tower', b.name || `${Math.round(b.top / FT)} ft tower`, x, y, b.top);
    if (refs.length >= 28) break;
  }
  const bridges = {};
  for (const s of world.structures) { const k = s.name.split(',')[0]; (bridges[k] ||= []).push(s); }
  for (const [name, ss] of Object.entries(bridges)) addRef('bridge', name, ss.reduce((a, s) => a + s.x, 0) / ss.length, ss.reduce((a, s) => a + s.y, 0) / ss.length, Math.max(...ss.map((s) => s.top)));
  for (const l of data.land) {
    if (/island/i.test(l.name)) { const [x, y] = polyCentroid(l.p); addRef('island', l.name, x, y, 10); }
  }
  for (const lane of world.lanes) { // a river reference every ~1 km along each lane
    const river = /hudson/i.test(lane.name) ? 'the Hudson' : /east river/i.test(lane.name) ? 'the East River' : /park/i.test(lane.name) ? 'Central Park' : 'the Upper Bay';
    lane.nodes.forEach((id, k) => { if (k % 8 === 4) { const n = world.laneNodes[id]; addRef(river === 'Central Park' ? 'park' : 'river', river, n.x, n.y, 0); } });
  }
  world.heliports.forEach((h) => addRef('heliport', h.id, h.x, h.y, h.z));
  world.refs = refs;

  world.bandOf = (type) => bandAltitudes(config, type);
  world.landNameAt = (x, y) => landNameAt(data.land, x, y);
  return world;
}

function landNameAt(land, x, y) {
  for (const l of land) if (pointInPoly(x, y, l.p)) return l.name;
  return '';
}

// Altitude limits (m) of an agent type's band, from the config in feet.
export function bandAltitudes(config, type) {
  const b = config.bands;
  if (type === 'drone') return { floor: b.drone.transition[0] * FT, ceiling: b.drone.ceiling * FT, east: b.drone.eastbound * FT, west: b.drone.westbound * FT, tol: b.drone.tolerance * FT };
  const h = b.heli[type];
  return { floor: h.floor * FT, ceiling: h.ceiling * FT, cruise: h.cruise * FT, step: b.heli.sublayerStep * FT };
}

// The drone band for a true course (deg): magnetic course 000-179 flies the eastbound level.
export function droneBandFor(config, trueCourseDeg) {
  const mag = (((trueCourseDeg - config.site.magneticDeclination) % 360) + 360) % 360;
  return mag < 180 ? config.bands.drone.eastbound * FT : config.bands.drone.westbound * FT;
}
