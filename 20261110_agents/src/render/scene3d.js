// three.js view. Reads the simulation, never changes it.
// Simulation frame: x east, y north, z up (metres). three.js: X = x, Y = z * verticalExaggeration, Z = -y.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FT } from '../sim/config.js';
import { K } from '../sim/knowledge.js';

import { LANDMARK_GROUPS } from './groups.js';
export { LANDMARK_GROUPS };
const groupOf = Object.fromEntries(LANDMARK_GROUPS.flatMap((g) => g.types.map((t) => [t, g])));

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export function makeScene3D(container, palette) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.sky);
  scene.fog = new THREE.Fog(palette.sky, 9000, 30000);
  const camera = new THREE.PerspectiveCamera(45, 1, 5, 80000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495; controls.screenSpacePanning = false;
  scene.add(new THREE.HemisphereLight(0xcfd9ee, 0x1a2030, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(-6000, 9000, 4000); scene.add(sun);

  const root = new THREE.Group(); scene.add(root);
  const layers = {};
  let world = null, sim = null, ve = 1;
  const V = (x, y, z) => new THREE.Vector3(x, z * ve, -y);

  function clearGroup(g) { if (!g) return; g.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); }); g.parent?.remove(g); }

  // ---------------------------------------------------------------- static world
  function buildWorld(w, verticalExaggeration) {
    world = w; ve = verticalExaggeration;
    for (const k of Object.keys(layers)) { clearGroup(layers[k]); delete layers[k]; }
    const W = w.frame.width, H = w.frame.height;
    // water and land
    const ground = new THREE.Group();
    const water = new THREE.Mesh(new THREE.PlaneGeometry(W * 3, H * 3), new THREE.MeshStandardMaterial({ color: palette.water, roughness: 0.6, metalness: 0.1 }));
    water.rotation.x = -Math.PI / 2; water.position.set(W / 2, -2, -H / 2); ground.add(water);
    const landMat = new THREE.MeshStandardMaterial({ color: palette.land, roughness: 1 });
    for (const l of w.landPolys) {
      const pts = []; for (let i = 0; i < l.p.length; i += 2) pts.push(new THREE.Vector2(l.p[i], l.p[i + 1]));
      const shape = new THREE.Shape(pts);
      const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, landMat); m.position.y = 0; ground.add(m);
    }
    layers.ground = ground; root.add(ground);
    layers.buildings = buildingMesh(w); root.add(layers.buildings);
    layers.rules = ruleLayer(w); root.add(layers.rules);
    layers.bands = bandLayer(w); root.add(layers.bands);
    layers.heat = heatLayer(w); root.add(layers.heat);
    layers.knowledge = new THREE.Group(); root.add(layers.knowledge);
    layers.collective = new THREE.Group(); root.add(layers.collective);
    // camera: look up Manhattan from the south-west, over the harbour
    camera.position.set(W * 0.18, 5200, -H * 0.02 + 2500);
    controls.target.set(W * 0.5, 0, -H * 0.5);
    controls.update();
  }

  function buildingMesh(w) {
    const pos = [], col = [];
    const cLow = new THREE.Color(palette.bLow), cHigh = new THREE.Color(palette.bHigh), c = new THREE.Color();
    const push = (x, y, z) => pos.push(x, z * ve, -y);
    for (const b of w.data.buildings) {
      const p = b.p; const n = p.length / 2;
      if (n < 3) continue;
      const t = Math.min(1, b.top / 300); c.copy(cLow).lerp(cHigh, Math.sqrt(t));
      const base = Math.max(0, b.base);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = p[2 * i], ay = p[2 * i + 1], bx = p[2 * j], by = p[2 * j + 1];
        push(ax, ay, base); push(bx, by, base); push(bx, by, b.top);
        push(ax, ay, base); push(bx, by, b.top); push(ax, ay, b.top);
        for (let k = 0; k < 6; k++) col.push(c.r * 0.78, c.g * 0.78, c.b * 0.78);
      }
      const contour = []; for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(p[2 * i], p[2 * i + 1]));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const [i0, i1, i2] of tris) {
        push(p[2 * i0], p[2 * i0 + 1], b.top); push(p[2 * i1], p[2 * i1 + 1], b.top); push(p[2 * i2], p[2 * i2 + 1], b.top);
        for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
      }
    }
    for (const s of w.structures) { // bridge towers
      const hw = s.w / 2, hd = s.d / 2;
      const q = [[s.x - hw, s.y - hd], [s.x + hw, s.y - hd], [s.x + hw, s.y + hd], [s.x - hw, s.y + hd]];
      for (let i = 0; i < 4; i++) { const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4]; push(ax, ay, 0); push(bx, by, 0); push(bx, by, s.top); push(ax, ay, 0); push(bx, by, s.top); push(ax, ay, s.top); for (let k = 0; k < 6; k++) col.push(0.55, 0.5, 0.45); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, transparent: true, opacity: 1 }));
    return m;
  }

  function ruleLayer(w) {
    const g = new THREE.Group();
    const lo = w.config.bands.heli.tour.floor * FT, hi = w.config.bands.classBFloor * FT;
    // lanes: translucent ribbons spanning both helicopter bands, with chevrons on top
    const laneMat = new THREE.MeshBasicMaterial({ color: palette.lane, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false });
    const chevMat = new THREE.MeshBasicMaterial({ color: palette.lane, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    for (const lane of w.lanes) {
      for (let i = 0; i < lane.xy.length - 1; i++) {
        const [ax, ay] = lane.xy[i], [bx, by] = lane.xy[i + 1];
        const len = Math.hypot(bx - ax, by - ay);
        const box = new THREE.Mesh(new THREE.BoxGeometry(len, (hi - lo) * ve, lane.width), laneMat);
        box.position.copy(V((ax + bx) / 2, (ay + by) / 2, (lo + hi) / 2));
        box.rotation.y = Math.atan2(by - ay, bx - ax);
        g.add(box);
      }
      lane.nodes.forEach((id, k) => {
        if (k % 3) return;
        const n = w.laneNodes[id];
        const ch = new THREE.Mesh(chevron(lane.width * 0.32), chevMat);
        ch.position.copy(V(n.x, n.y, hi + 4)); ch.rotation.y = Math.atan2(n.uy, n.ux);
        g.add(ch);
      });
    }
    // no-fly zones
    for (const z of w.noFly) {
      const allTypes = z.applies.length === 3;
      const mat = new THREE.MeshBasicMaterial({ color: allTypes ? palette.nfz : palette.nfzDrone, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
      const h = (z.ceilM - z.floorM) * ve;
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(z.radius, z.radius, h, 64, 1, true), mat);
      cyl.position.copy(V(z.x, z.y, (z.floorM + z.ceilM) / 2)); g.add(cyl);
      const ring = new THREE.Mesh(new THREE.RingGeometry(z.radius - 6, z.radius, 64), new THREE.MeshBasicMaterial({ color: allTypes ? palette.nfz : palette.nfzDrone, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.copy(V(z.x, z.y, z.ceilM)); g.add(ring);
    }
    // heliports and drone pads
    for (const h of w.heliports) g.add(padMarker(h.x, h.y, h.z + 2, 70, palette.heliport));
    for (const p of w.pads) g.add(padMarker(p.x, p.y, p.z + 1, p.hub ? 30 : 20, p.hub ? palette.hub : palette.pad));
    // band signs (posts)
    const postGeo = new THREE.CylinderGeometry(5, 5, 1, 6); postGeo.translate(0, 0.5, 0);
    const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshBasicMaterial({ color: palette.sign }), w.signs.length);
    w.signs.forEach((s, i) => { tmpS.set(1, 70 * ve, 1); tmpP.copy(V(s.x, s.y, s.z)); tmpM.compose(tmpP, tmpQ.identity(), tmpS); posts.setMatrixAt(i, tmpM); });
    g.add(posts);
    return g;
  }

  function bandLayer(w) {
    const g = new THREE.Group(); const cfg = w.config.bands;
    const Wd = w.frame.width, Hd = w.frame.height;
    const plane = (ft, color, op) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(Wd, Hd), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(Wd / 2, ft * FT * ve, -Hd / 2); g.add(m);
    };
    plane(cfg.drone.eastbound, palette.drone, 0.07); plane(cfg.drone.westbound, palette.drone, 0.07);
    plane(cfg.heli.tour.cruise, palette.tour, 0.05); plane(cfg.heli.medical.cruise, palette.medical, 0.05);
    plane(cfg.classBFloor, '#ffffff', 0.035);
    return g;
  }

  // heat map: a canvas texture draped just above the ground
  function heatLayer(w) {
    const canvas = document.createElement('canvas'); canvas.width = w.W; canvas.height = w.H;
    const tex = new THREE.CanvasTexture(canvas); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w.W * w.cs, w.H * w.cs), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set((w.W * w.cs) / 2, 3, -(w.H * w.cs) / 2);
    m.userData = { canvas, tex }; m.visible = false; m.renderOrder = 2;
    return m;
  }
  function paintHeat(values, { log = true, colorFn = heatColor } = {}) {
    const { canvas, tex } = layers.heat.userData;
    const ctx = canvas.getContext('2d'); const img = ctx.createImageData(world.W, world.H);
    // a light 3x3 blur so single 50 m cells read at city scale
    const W = world.W, H = world.H, src = values; values = new Float32Array(src.length);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const x = i + di, y = j + dj; if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const w = di || dj ? 0.5 : 1; s += src[y * W + x] * w; n += w;
      }
      values[j * W + i] = s / n;
    }
    let mx = 0; for (const v of src) if (v > mx) mx = v;
    for (let j = 0; j < world.H; j++) for (let i = 0; i < world.W; i++) {
      const v = values[j * world.W + i]; const o = ((world.H - 1 - j) * world.W + i) * 4;
      if (!(v > 0) || mx === 0) { img.data[o + 3] = 0; continue; }
      const t = log ? Math.log1p(v) / Math.log1p(mx) : v / mx;
      const [r, g, b, a] = colorFn(t);
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = a;
    }
    ctx.putImageData(img, 0, 0); tex.needsUpdate = true;
    return mx;
  }

  // ---------------------------------------------------------------- agents
  const MAXA = 1200;
  const droneGeo = (() => { const g = new THREE.BoxGeometry(1.2, 0.3, 1.2); return g; })();
  const heliGeo = (() => { const g = new THREE.CapsuleGeometry(1.6, 6, 4, 8); g.rotateZ(Math.PI / 2); return g; })();
  const rotorGeo = (() => { const g = new THREE.CylinderGeometry(6.5, 6.5, 0.2, 20); g.translate(0, 2.2, 0); return g; })();
  const droneMesh = new THREE.InstancedMesh(droneGeo, new THREE.MeshBasicMaterial({ color: palette.drone }), MAXA);
  const tourMesh = new THREE.InstancedMesh(heliGeo, new THREE.MeshBasicMaterial({ color: palette.tour }), 200);
  const medMesh = new THREE.InstancedMesh(heliGeo, new THREE.MeshBasicMaterial({ color: palette.medical }), 200);
  const rotorMesh = new THREE.InstancedMesh(rotorGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }), 400);
  const crossMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(3.4, 0.6, 3.4), new THREE.MeshBasicMaterial({ color: 0xffffff }), 200); // white roof patch: medical
  for (const m of [droneMesh, tourMesh, medMesh, rotorMesh, crossMesh]) { m.frustumCulled = false; m.count = 0; scene.add(m); }
  // vision cones: spherical sectors (apex at the agent, opening along +X), one shape per agent type
  const coneMat = new THREE.MeshBasicMaterial({ color: palette.cone, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
  const droneSpec = null;
  const coneGeos = {};
  const coneGeoFor = (spec) => {
    const key = `${spec.horizontal}/${spec.vertical}`;
    return coneGeos[key] ||= sectorGeometry((spec.horizontal * Math.PI) / 360, (spec.vertical * Math.PI) / 180);
  };
  const conesMesh = { drone: null, heli: null };
  const selCone = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: palette.selection, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide })); selCone.frustumCulled = false; scene.add(selCone);
  void droneSpec;
  const selRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 8, 40), new THREE.MeshBasicMaterial({ color: palette.selection })); selRing.rotation.x = Math.PI / 2; scene.add(selRing);
  const trailLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: palette.selection })); trailLine.frustumCulled = false; scene.add(trailLine);
  const planLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: palette.selection, dashSize: 40, gapSize: 30 })); planLine.frustumCulled = false; scene.add(planLine);

  const options = { buildings: true, rules: true, bands: false, cones: 'selected', trails: true, heat: 'none', mode: 'city', follow: false };
  let selected = null;

  function placeAgents(simRef) {
    sim = simRef;
    const sc = world.config.render.agentScale;
    let nd = 0, nt = 0, nm = 0, nr = 0, nc = 0, ncone = 0;
    for (const a of sim.agents) {
      if (!a.active) continue;
      tmpP.copy(V(a.x, a.y, a.z));
      tmpQ.setFromAxisAngle(UP, a.heading);
      if (a.type === 'drone') {
        const s = sc.drone; tmpS.set(s, s, s); tmpM.compose(tmpP, tmpQ, tmpS); droneMesh.setMatrixAt(nd++, tmpM);
      } else {
        const s = sc.heli; tmpS.set(s, s, s); tmpM.compose(tmpP, tmpQ, tmpS);
        (a.type === 'tour' ? tourMesh : medMesh).setMatrixAt(a.type === 'tour' ? nt++ : nm++, tmpM);
        rotorMesh.setMatrixAt(nr++, tmpM);
        if (a.type === 'medical') { tmpP.y += 5 * s; tmpM.compose(tmpP, tmpQ, tmpS); crossMesh.setMatrixAt(nc++, tmpM); }
      }
      if (options.cones === 'all' && a.airborne) {
        const key = a.type === 'drone' ? 'drone' : 'heli';
        if (!conesMesh[key]) { conesMesh[key] = new THREE.InstancedMesh(coneGeoFor(a.spec.cone), coneMat, MAXA); conesMesh[key].frustumCulled = false; scene.add(conesMesh[key]); conesMesh[key].userData.n = 0; }
        coneMatrix(a, tmpM); conesMesh[key].setMatrixAt(conesMesh[key].userData.n++, tmpM);
      }
    }
    for (const m of Object.values(conesMesh)) if (m) { m.count = m.userData.n; m.userData.n = 0; m.instanceMatrix.needsUpdate = true; m.visible = options.cones === 'all'; }
    droneMesh.count = nd; tourMesh.count = nt; medMesh.count = nm; rotorMesh.count = nr; crossMesh.count = nc; void ncone;
    for (const m of [droneMesh, tourMesh, medMesh, rotorMesh, crossMesh]) m.instanceMatrix.needsUpdate = true;

    // selection
    const a = selected;
    selCone.visible = selRing.visible = trailLine.visible = planLine.visible = !!(a && a.active);
    if (a && a.active) {
      if (selCone.userData.spec !== a.spec.cone) { selCone.geometry = coneGeoFor(a.spec.cone); selCone.userData.spec = a.spec.cone; }
      coneMatrix(a, tmpM); tmpM.decompose(selCone.position, selCone.quaternion, selCone.scale);
      selCone.visible = options.cones !== 'none' && options.mode !== 'collective';
      const r = a.type === 'drone' ? 45 : 140;
      selRing.position.copy(V(a.x, a.y, a.z)); selRing.scale.set(r, r, r);
      if (options.trails) setLine(trailLine, a.trail.concat([[a.x, a.y, a.z]]));
      else trailLine.visible = false;
      if (a.plan) { setLine(planLine, [[a.x, a.y, a.z], ...a.plan.pts.slice(a.plan.i).map(([x, y]) => [x, y, a.altTarget])]); planLine.computeLineDistances(); }
      if (options.follow) { const p = V(a.x, a.y, a.z); const d = p.clone().sub(controls.target); controls.target.add(d); camera.position.add(d); }
    }
  }
  function coneMatrix(a, out) {
    const r = a.spec.cone.range;
    tmpP.copy(V(a.x, a.y, a.z)); tmpQ.setFromAxisAngle(UP, a.heading); tmpS.set(r, r * ve, r);
    return out.compose(tmpP, tmpQ, tmpS);
  }
  function setLine(line, pts) {
    const arr = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => { const v = V(p[0], p[1], p[2]); arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; });
    line.geometry.dispose(); line.geometry = new THREE.BufferGeometry(); line.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  }

  // ---------------------------------------------------------------- one agent's knowledge
  function drawKnowledge(a) {
    clearGroup(layers.knowledge); layers.knowledge = new THREE.Group(); root.add(layers.knowledge);
    if (!a) return;
    const k = a.knowledge; const w = world; const g = layers.knowledge;
    // seen ground: land / water / lane cells / known no-fly cells
    const canvas = document.createElement('canvas'); canvas.width = w.W; canvas.height = w.H;
    const ctx = canvas.getContext('2d'); const img = ctx.createImageData(w.W, w.H);
    const cLand = hex(palette.kLand), cWater = hex(palette.kWater), cLane = hex(palette.lane), cNfz = hex(palette.nfz);
    for (let j = 0; j < w.H; j++) for (let i = 0; i < w.W; i++) {
      const c = j * w.W + i, f = k.flags[c], o = ((w.H - 1 - j) * w.W + i) * 4;
      if (!(f & K.SEEN) && !(f & (K.LANE | K.NFZ))) { img.data[o + 3] = 0; continue; }
      let col = (f & K.LAND) ? cLand : cWater, al = 200;
      if (f & K.NFZ && (w.nfzMask[c] & ({ drone: 1, tour: 2, medical: 4 })[a.type])) { col = cNfz; al = 150; }
      else if (f & K.LANE) { col = cLane; al = 170; }
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = al;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas); tex.magFilter = THREE.NearestFilter;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w.W * w.cs, w.H * w.cs), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    plane.rotation.x = -Math.PI / 2; plane.position.set((w.W * w.cs) / 2, 4, -(w.H * w.cs) / 2); g.add(plane);
    // known obstacles as blocks on the 50 m grid
    const cells = []; for (let c = 0; c < w.N; c++) if (k.height[c] > 2) cells.push(c);
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const blocked = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: palette.kBlock, roughness: 0.9 }), Math.max(1, cells.length));
    const zc = a.cruiseZ ? a.cruiseZ() : 0; const col = new THREE.Color();
    cells.forEach((c, i) => {
      const h = k.knownHeight(c);
      tmpP.copy(V(w.cx(c), w.cy(c), 0)); tmpS.set(w.cs * 0.92, Math.max(1, h * ve), w.cs * 0.92); tmpM.compose(tmpP, tmpQ.identity(), tmpS);
      blocked.setMatrixAt(i, tmpM);
      blocked.setColorAt(i, col.set(h > zc - a.spec.clearance ? palette.kBlockHot : palette.kBlock));
    });
    blocked.count = cells.length; g.add(blocked);
    // rule features it has seen
    for (const id of k.noFly) { const z = w.noFly[id]; const ring = new THREE.Mesh(new THREE.TorusGeometry(z.radius, 6, 6, 64), new THREE.MeshBasicMaterial({ color: palette.nfz })); ring.rotation.x = Math.PI / 2; ring.position.copy(V(z.x, z.y, a.z)); g.add(ring); }
    for (const id of k.heliports) { const h = w.heliports[id]; g.add(padMarker(h.x, h.y, h.z + 3, 80, palette.heliport)); }
    for (const id of k.pads) { const p = w.pads[id]; g.add(padMarker(p.x, p.y, p.z + 2, 28, palette.hub)); }
    if (a.type !== 'drone') { // its visual references, one label per name
      const named = new Set();
      for (const id of k.refs) {
        const r = w.refs[id];
        if (named.has(r.name) || (r.kind === 'tower' && /^\d+ ft tower$/.test(r.name) && r.z < 300)) continue;
        named.add(r.name);
        g.add(labelSprite(r.name, V(r.x, r.y, Math.max(r.z, 60) + 40), r.kind === 'tower' ? '#e8edf5' : '#9fd8ff'));
      }
    }
    // landmarks + how they are anchored
    const lmPts = [], lmCol = [], anchor = [];
    for (const lm of k.landmarks) {
      const gq = groupOf[lm.type]; const c3 = new THREE.Color(gq?.color ?? '#ffffff');
      const p = V(lm.x, lm.y, lm.z + 10); lmPts.push(p.x, p.y, p.z); lmCol.push(c3.r, c3.g, c3.b);
      let q = null;
      if (lm.rep.frame === 'home') q = V(a.home.x, a.home.y, a.home.z + 10);
      else if (lm.rep.frame === 'ref') { const r = w.refs[lm.rep.ref]; q = V(r.x, r.y, Math.max(r.z * 0.6, 20)); }
      else if (lm.rep.frame === 'start') q = V(a.start.x, a.start.y, a.start.z);
      if (q) anchor.push(p.x, p.y, p.z, q.x, q.y, q.z);
    }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(lmPts, 3)); pg.setAttribute('color', new THREE.Float32BufferAttribute(lmCol, 3));
    g.add(new THREE.Points(pg, new THREE.PointsMaterial({ size: 14, vertexColors: true, sizeAttenuation: false, depthTest: false })));
    const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.Float32BufferAttribute(anchor, 3));
    g.add(new THREE.LineSegments(ag, new THREE.LineBasicMaterial({ color: palette.anchor, transparent: true, opacity: 0.55, depthTest: false })));
    // the other agents it has met (last place it saw each)
    const seen = []; const seenCol = [];
    for (const [, s] of k.agents) { const p = V(s.x, s.y, s.z); seen.push(p.x, p.y, p.z); const c3 = new THREE.Color(s.type === 'drone' ? palette.drone : s.type === 'tour' ? palette.tour : palette.medical); seenCol.push(c3.r, c3.g, c3.b); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(seen, 3)); sg.setAttribute('color', new THREE.Float32BufferAttribute(seenCol, 3));
    g.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 6, vertexColors: true, sizeAttenuation: false, transparent: true, opacity: 0.8 })));
    // its whole trail
    const tl = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: palette.selection })); setLine(tl, a.trail); g.add(tl);
  }

  // ---------------------------------------------------------------- everyone together
  function drawCollective(s, show) {
    clearGroup(layers.collective); layers.collective = new THREE.Group(); root.add(layers.collective);
    const g = layers.collective;
    if (show.paths) {
      const P = s.paths; const cap = world.config.render.pathsMaxSegments; const n = Math.min(P.n, cap);
      const pos = new Float32Array(n * 6), col = new Float32Array(n * 6);
      const cols = [new THREE.Color(palette.drone), new THREE.Color(palette.tour), new THREE.Color(palette.medical)];
      for (let i = 0; i < n; i++) {
        const b = P.buf.subarray(i * 7, i * 7 + 7);
        pos.set([b[0], b[2] * ve, -b[1], b[3], b[5] * ve, -b[4]], i * 6);
        const c = cols[b[6]]; col.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
      }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending })));
    }
    if (show.hotspots) { // congestion landmarks in 3D, sized by how many agents were jammed
      const hs = s.hotspots;
      const geo = new THREE.SphereGeometry(1, 12, 8);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#c98500', transparent: true, opacity: 0.55, depthWrite: false }), Math.max(1, hs.length));
      hs.forEach((h, i) => { const r = (h.type === 'drone' ? 18 : 70) * Math.sqrt(h.count); tmpP.copy(V(h.x, h.y, h.z)); tmpS.set(r, r, r); tmpM.compose(tmpP, tmpQ.identity(), tmpS); mesh.setMatrixAt(i, tmpM); });
      mesh.count = hs.length; g.add(mesh);
    }
    if (show.landmarks) {
      const pts = [], col = [];
      for (const lm of s.allLandmarks()) { const gq = groupOf[lm.type]; if (show.groups && !show.groups.has(gq?.key)) continue; const c = new THREE.Color(gq?.color ?? '#fff'); const p = V(lm.x, lm.y, lm.z + 8); pts.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b); }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); pg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.add(new THREE.Points(pg, new THREE.PointsMaterial({ size: 5, vertexColors: true, sizeAttenuation: false, transparent: true, opacity: 0.9 })));
    }
  }

  // ---------------------------------------------------------------- helpers
  function padMarker(x, y, z, r, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.55, r, 24), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.copy(V(x, y, z)); return m;
  }
  function chevron(s) {
    const shape = new THREE.Shape([new THREE.Vector2(s, 0), new THREE.Vector2(-s * 0.6, s * 0.8), new THREE.Vector2(-s * 0.25, 0), new THREE.Vector2(-s * 0.6, -s * 0.8)]);
    const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); return g;
  }
  function labelSprite(text, pos, color) {
    const c = document.createElement('canvas'); const ctx = c.getContext('2d'); ctx.font = '600 26px Inter, system-ui, sans-serif';
    const w = Math.ceil(ctx.measureText(text).width) + 20; c.width = w; c.height = 40;
    ctx.font = '600 28px Inter, system-ui, sans-serif'; ctx.fillStyle = 'rgba(10,14,22,0.75)'; ctx.fillRect(0, 0, w, 40); ctx.fillStyle = color; ctx.fillText(text, 10, 29);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, sizeAttenuation: false }));
    sp.scale.set(w / 2400, 40 / 2400, 1); sp.position.copy(pos); sp.renderOrder = 5; return sp;
  }

  // picking: nearest agent to the click on screen
  const ndc = new THREE.Vector3();
  function pick(clientX, clientY) {
    if (!sim) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    let best = null, bd = 18 * 18;
    for (const a of sim.agents) {
      if (!a.active) continue;
      ndc.copy(V(a.x, a.y, a.z)).project(camera);
      if (ndc.z > 1) continue;
      const sx = (ndc.x + 1) / 2 * rect.width, sy = (1 - ndc.y) / 2 * rect.height;
      const d = (sx - mx) ** 2 + (sy - my) ** 2;
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  function applyVisibility() {
    const m = options.mode;
    layers.buildings.visible = options.buildings && m !== 'knowledge'; // the agent's map shows only what it knows
    layers.buildings.material.opacity = m === 'collective' ? 0.45 : 1;
    layers.buildings.material.depthWrite = m === 'city';
    layers.rules.visible = options.rules && m !== 'knowledge';
    layers.bands.visible = options.bands;
    layers.knowledge.visible = m === 'knowledge';
    layers.collective.visible = m === 'collective';
    layers.heat.visible = options.heat !== 'none' && m === 'collective';
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container); resize();

  return {
    buildWorld, placeAgents, drawKnowledge, drawCollective, paintHeat, pick, applyVisibility, options,
    select(a) { selected = a; },
    get selected() { return selected; },
    render() { controls.update(); renderer.render(scene, camera); },
    canvas: renderer.domElement, camera, controls,
    view(name) { // preset cameras for screenshots
      const W = world.frame.width, H = world.frame.height;
      const presets = {
        overview: [[W * 0.18, 5200, 2500], [W * 0.5, 0, -H * 0.5]],
        top: [[W * 0.5, 15500, -H * 0.5 + 10], [W * 0.5, 0, -H * 0.5]],
        midtown: [[W * 0.35, 1800, -H * 0.42], [W * 0.62, 100, -H * 0.62]],
        downtown: [[W * 0.32, 1500, -H * 0.02], [W * 0.45, 50, -H * 0.2]],
      };
      if (name === 'agent' && selected) { // frame the part of the city the selected agent knows
        const k = selected.knowledge; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let c = 0; c < world.N; c++) if (k.flags[c] & K.SEEN) { const x = world.cx(c), y = world.cy(c); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x0 < Infinity) {
          const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.max(900, x1 - x0, y1 - y0);
          presets.agent = [[cx - r * 0.25, r * 0.9, -cy + r * 0.95], [cx, 0, -cy]];
        }
      }
      const [p, t] = presets[name] || presets.overview;
      camera.position.set(...p); controls.target.set(...t); controls.update();
    },
  };
}

// Unit spherical sector: azimuth +/- h, elevation +/- v, apex at the origin, axis +X.
function sectorGeometry(h, v, na = 20, ne = 6) {
  const pos = [];
  const P = (az, el) => [Math.cos(el) * Math.cos(az), Math.sin(el), -Math.cos(el) * Math.sin(az)];
  for (let i = 0; i < na; i++) for (let j = 0; j < ne; j++) {
    const a0 = -h + (2 * h * i) / na, a1 = -h + (2 * h * (i + 1)) / na, e0 = -v + (2 * v * j) / ne, e1 = -v + (2 * v * (j + 1)) / ne;
    pos.push(...P(a0, e0), ...P(a1, e0), ...P(a1, e1), ...P(a0, e0), ...P(a1, e1), ...P(a0, e1));
  }
  for (let i = 0; i < na; i++) { // top and bottom fans
    const a0 = -h + (2 * h * i) / na, a1 = -h + (2 * h * (i + 1)) / na;
    pos.push(0, 0, 0, ...P(a0, v), ...P(a1, v), 0, 0, 0, ...P(a1, -v), ...P(a0, -v));
  }
  for (let j = 0; j < ne; j++) { // side walls
    const e0 = -v + (2 * v * j) / ne, e1 = -v + (2 * v * (j + 1)) / ne;
    pos.push(0, 0, 0, ...P(-h, e1), ...P(-h, e0), 0, 0, 0, ...P(h, e0), ...P(h, e1));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

export function heatColor(t) { // single hue (amber), light = more, alpha grows with the value
  const lo = [150, 80, 10], hi = [255, 226, 160];
  return [lo[0] + (hi[0] - lo[0]) * t, lo[1] + (hi[1] - lo[1]) * t, lo[2] + (hi[2] - lo[2]) * t, 110 + 145 * t];
}
const hex = (h) => { const c = new THREE.Color(h); return [c.r * 255, c.g * 255, c.b * 255]; };
