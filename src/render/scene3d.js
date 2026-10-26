// three.js view of the forest. Reads the simulation state, never changes it.
// Simulation coordinates: x east, y south, z up. three.js: X = x, Y = z (up), Z = y.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { G, C, nodeXYL } from '../sim/world.js';
import { eyePoint, inCone, segmentCrossings } from '../sim/los.js';

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpPos = new THREE.Vector3();

function instanced(geometry, material, cells, place) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, cells.length));
  mesh.count = cells.length;
  cells.forEach((c, i) => {
    place(c, tmpPos, tmpScale, tmpQuat);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    mesh.setMatrixAt(i, tmpMatrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

// Small deterministic jitter per cell so the forest does not look like a spreadsheet.
const jitter = (x, y, k) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

export function makeScene3D(container, palette) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 6;
  controls.maxDistance = 140;

  const hemi = new THREE.HemisphereLight(0xdfe8e4, 0x3b4a3a, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-20, 40, -10);
  scene.add(sun);

  let mapGroup = null;
  let canopyGroup = null;
  let world = null;
  let rays = null;
  let topView = false;
  let baseFog = 0.024;
  let fogScale = 1;
  const options = { cones: true, omni: true, lines: true, canopy: true };

  // ---- agents --------------------------------------------------------
  function makeAgent(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, fog: false });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.0, 16), mat);
    body.position.y = 0.5;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), mat);
    head.position.y = 1.25;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, fog: false }));
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(0.36, 1.25, 0);
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.5, 32), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: false }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.03;
    g.add(body, head, nose, marker);
    scene.add(g);
    return g;
  }
  const agents = {
    police: { mesh: makeAgent(palette.police), from: null, to: null, vis: null },
    thief: { mesh: makeAgent(palette.thief), from: null, to: null, vis: null },
  };

  // ---- vision geometry (rebuilt every frame from the cached rays) ----
  function makeVision(color) {
    const omniGeo = new THREE.BufferGeometry();
    omniGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 6), 3));
    const omni = new THREE.LineSegments(omniGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.13, fog: false, depthWrite: false }));
    const coneGeo = new THREE.BufferGeometry();
    coneGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 6), 3));
    const cone = new THREE.LineSegments(coneGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75, fog: false, depthWrite: false }));
    const fanGeo = new THREE.BufferGeometry();
    fanGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(80 * 9), 3));
    const fan = new THREE.Mesh(fanGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, fog: false, depthWrite: false }));
    for (const o of [omni, cone, fan]) { o.frustumCulled = false; scene.add(o); }
    return { omni, cone, fan };
  }
  agents.police.vis = makeVision(palette.police);
  agents.thief.vis = makeVision(palette.thief);

  function updateVision(agent, node, facing, offset) {
    const { omni, cone, fan } = agent.vis;
    omni.visible = options.omni;
    cone.visible = options.cones;
    fan.visible = options.cones;
    if (!options.omni && !options.cones) return;
    const [ex, ey, ez] = eyePoint(world, node);
    const ox = ex + offset[0];
    const oy = ey + offset[1];
    const oz = ez + offset[2];
    const i0 = world.nodeIndex[node] * rays.R;
    const op = omni.geometry.attributes.position.array;
    const cp = cone.geometry.attributes.position.array;
    const fp = fan.geometry.attributes.position.array;
    let no = 0;
    let nc = 0;
    let nf = 0;
    let prev = null;
    const horiz = [];
    rays.dirs.forEach((d, r) => {
      const len = rays.lengths[i0 + r];
      const px = ox + d.dx * len;
      const py = oy + d.dy * len;
      const pz = oz + d.dz * len;
      op.set([ox, oz, oy, px, pz, py], no); no += 6;
      if (inCone(world.config, facing, d.dx, d.dy, d.dz)) {
        cp.set([ox, oz, oy, px, pz, py], nc); nc += 6;
        if (d.el === 0) horiz.push({ a: Math.atan2(Math.sin(d.az - facing), Math.cos(d.az - facing)), p: [px, pz, py] });
      }
    });
    horiz.sort((a, b) => a.a - b.a);
    for (const h of horiz) {
      if (prev) { fp.set([ox, oz, oy, ...prev, ...h.p], nf); nf += 9; }
      prev = h.p;
    }
    omni.geometry.setDrawRange(0, no / 3);
    cone.geometry.setDrawRange(0, nc / 3);
    fan.geometry.setDrawRange(0, nf / 3);
    omni.geometry.attributes.position.needsUpdate = true;
    cone.geometry.attributes.position.needsUpdate = true;
    fan.geometry.attributes.position.needsUpdate = true;
  }

  // ---- distance lines ------------------------------------------------
  const straight = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: palette.euclidean, fog: false, linewidth: 2 }));
  const pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: palette.path, dashSize: 0.35, gapSize: 0.22, fog: false }));
  straight.frustumCulled = false;
  // dots on the straight line wherever the sound passes through solid material (acoustic distance)
  const MAX_DOTS = 96;
  const muffleDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshBasicMaterial({ color: palette.acoustic, fog: false }), MAX_DOTS);
  muffleDots.count = 0;
  muffleDots.frustumCulled = false;
  scene.add(muffleDots);
  pathLine.frustumCulled = false;
  scene.add(straight, pathLine);

  // ---- sound ripples ---------------------------------------------------
  const ripples = [];
  const rippleGeo = new THREE.RingGeometry(0.9, 1.0, 48);
  function addRipple(node, color, now) {
    const { x, y, level } = nodeXYL(world, node);
    const mesh = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, fog: false, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x + 0.5, level * world.config.levelHeight + 0.08, y + 0.5);
    scene.add(mesh);
    ripples.push({ mesh, born: now });
  }

  // ---- map ---------------------------------------------------------------
  function buildMap(newWorld, newRays) {
    world = newWorld;
    rays = newRays;
    if (mapGroup) {
      scene.remove(mapGroup);
      mapGroup.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    }
    mapGroup = new THREE.Group();
    canopyGroup = new THREE.Group();
    const { W, H, ground, canopy, config } = world;
    const cells = (arr, type) => {
      const out = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (arr[y * W + x] === type) out.push([x, y]);
      return out;
    };
    const ident = (q) => q.identity();

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: palette.ground, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0, H / 2);
    mapGroup.add(floor);

    mapGroup.add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: palette.wall, roughness: 1 }), cells(ground, G.WALL),
      ([x, y], p, s, q) => { p.set(x + 0.5, 1.1, y + 0.5); s.set(1, 2.2, 1); ident(q); }));

    const trees = cells(ground, G.TREE);
    mapGroup.add(instanced(new THREE.CylinderGeometry(0.1, 0.16, 1, 8), new THREE.MeshStandardMaterial({ color: palette.trunk }), trees,
      ([x, y], p, s, q) => { p.set(x + 0.5, 0.7, y + 0.5); s.set(1, 1.4, 1); ident(q); }));
    mapGroup.add(instanced(new THREE.ConeGeometry(0.5, 1, 9), new THREE.MeshStandardMaterial({ color: palette.tree, roughness: 0.9, flatShading: true }), trees,
      ([x, y], p, s, q) => {
        const h = 1.6 + 0.3 * jitter(x, y, 1);
        p.set(x + 0.5, 2.7 - h / 2, y + 0.5); s.set(1, h, 1); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), jitter(x, y, 2) * 6);
      }));

    mapGroup.add(instanced(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({ color: palette.bush, roughness: 1, flatShading: true }), cells(ground, G.BUSH),
      ([x, y], p, s, q) => { p.set(x + 0.5, 0.9, y + 0.5); s.set(1.1, 1.8, 1.1); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), jitter(x, y, 3) * 6); }));

    mapGroup.add(instanced(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: palette.rock, roughness: 0.95, flatShading: true }), cells(ground, G.ROCK),
      ([x, y], p, s, q) => { p.set(x + 0.5, 1.0, y + 0.5); s.set(1.15, 2.0, 1.15); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), jitter(x, y, 4) * 6); }));

    // canopy level
    const slabMat = new THREE.MeshStandardMaterial({ color: palette.platform, transparent: true, opacity: 0.55, roughness: 0.8, depthWrite: false });
    const slabCells = [...cells(canopy, C.PLATFORM), ...cells(canopy, C.LADDER), ...cells(canopy, C.FOLIAGE)];
    canopyGroup.add(instanced(new THREE.BoxGeometry(1, 1, 1), slabMat, slabCells,
      ([x, y], p, s, q) => { p.set(x + 0.5, (config.slabBottom + config.slabTop) / 2, y + 0.5); s.set(0.98, config.slabTop - config.slabBottom, 0.98); ident(q); }));
    const bridgeMat = new THREE.MeshStandardMaterial({ color: palette.bridge, transparent: true, opacity: 0.6, roughness: 0.8, depthWrite: false });
    canopyGroup.add(instanced(new THREE.BoxGeometry(1, 1, 1), bridgeMat, cells(canopy, C.BRIDGE),
      ([x, y], p, s, q) => { p.set(x + 0.5, (config.slabBottom + config.slabTop) / 2, y + 0.5); s.set(0.9, config.slabTop - config.slabBottom, 0.9); ident(q); }));
    canopyGroup.add(instanced(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({ color: palette.foliage, roughness: 1, flatShading: true, transparent: true, opacity: 0.85 }), cells(canopy, C.FOLIAGE),
      ([x, y], p, s, q) => { p.set(x + 0.5, (config.slabTop + config.foliageTop) / 2, y + 0.5); s.set(1.15, config.foliageTop - config.slabTop, 1.15); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), jitter(x, y, 5) * 6); }));

    // ladders: two rails and rungs
    const ladderMat = new THREE.MeshStandardMaterial({ color: palette.ladder });
    for (const i of world.ladders) {
      const x = i % W;
      const y = Math.floor(i / W);
      const lg = new THREE.Group();
      for (const side of [-0.28, 0.28]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, config.slabTop + 1, 0.06), ladderMat);
        rail.position.set(side, (config.slabTop + 1) / 2, 0);
        lg.add(rail);
      }
      for (let k = 0; k < 8; k++) {
        const rung = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.05), ladderMat);
        rung.position.set(0, 0.35 + k * 0.45, 0);
        lg.add(rung);
      }
      lg.position.set(x + 0.5, 0, y + 0.5);
      mapGroup.add(lg);
    }

    mapGroup.add(canopyGroup);
    canopyGroup.visible = options.canopy;
    scene.add(mapGroup);
    setTopView(topView, true);
  }

  // ---- camera ---------------------------------------------------------
  function setTopView(on, immediate = false) {
    topView = on;
    if (!world) return;
    const cx = world.W / 2;
    const cz = world.H / 2;
    controls.target.set(cx, 0, cz);
    // a tall, narrow view (phone) needs the camera farther back to fit the whole map
    const k = Math.max(1, 1.1 / Math.max(0.3, camera.aspect));
    fogScale = k;
    if (scene.fog) scene.fog.density = baseFog / k;
    if (on) camera.position.set(cx, 46 * k, cz + 0.01);
    else camera.position.set(cx - 3, 30 * k, cz + 33 * k);
    controls.update();
    if (!immediate) controls.update();
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  function setPalette(p) {
    scene.background = new THREE.Color(p.sky);
    baseFog = p.fogDensity;
    scene.fog = new THREE.FogExp2(p.sky, p.fogDensity / fogScale);
    hemi.intensity = p.light;
    sun.intensity = p.light * 1.25;
  }
  setPalette(palette);

  // ---- per step / per frame ----------------------------------------------
  const agentPose = (node, facing) => {
    const { x, y, level } = nodeXYL(world, node);
    return { x: x + 0.5, y: y + 0.5, z: level * world.config.levelHeight, facing };
  };

  function onStep(game, now, stepMs) {
    for (const who of ['police', 'thief']) {
      const a = agents[who];
      const s = game[who];
      const target = agentPose(s.node, s.facing);
      a.from = a.current ?? target;
      a.to = target;
      a.node = s.node;
      a.t0 = now;
      a.dur = stepMs * 0.9;
    }
    for (const snd of game.sounds) if (snd.heard) addRipple(snd.node, snd.who === 'police' ? palette.police : palette.thief, now);

    const pe = eyePoint(world, game.police.node);
    const te = eyePoint(world, game.thief.node);
    straight.geometry.setFromPoints([new THREE.Vector3(pe[0], pe[2], pe[1]), new THREE.Vector3(te[0], te[2], te[1])]);
    const len = Math.hypot(te[0] - pe[0], te[1] - pe[1], te[2] - pe[2]);
    const crossings = segmentCrossings(world, pe, te).slice(0, MAX_DOTS);
    crossings.forEach((c, i) => {
      const k = Math.min(1, (c.t + 0.25) / Math.max(len, 1e-9));
      tmpPos.set(pe[0] + (te[0] - pe[0]) * k, pe[2] + (te[2] - pe[2]) * k, pe[1] + (te[1] - pe[1]) * k);
      tmpMatrix.compose(tmpPos, tmpQuat.identity(), tmpScale.set(1, 1, 1));
      muffleDots.setMatrixAt(i, tmpMatrix);
    });
    muffleDots.count = crossings.length;
    muffleDots.instanceMatrix.needsUpdate = true;
    const pts = game.ctx.pf.path(game.police.node, game.thief.node).map((n) => {
      const { x, y, level } = nodeXYL(world, n);
      return new THREE.Vector3(x + 0.5, level * world.config.levelHeight + 0.2, y + 0.5);
    });
    pathLine.geometry.setFromPoints(pts);
    pathLine.computeLineDistances();
  }

  function frame(now) {
    if (!world) return;
    for (const who of ['police', 'thief']) {
      const a = agents[who];
      if (!a.to) continue;
      const k = Math.min(1, (now - a.t0) / Math.max(1, a.dur));
      const e = k * k * (3 - 2 * k);
      let df = a.to.facing - a.from.facing;
      df = Math.atan2(Math.sin(df), Math.cos(df));
      a.current = {
        x: a.from.x + (a.to.x - a.from.x) * e,
        y: a.from.y + (a.to.y - a.from.y) * e,
        z: a.from.z + (a.to.z - a.from.z) * e,
        facing: a.from.facing + df * e,
      };
      a.mesh.position.set(a.current.x, a.current.z, a.current.y);
      a.mesh.rotation.y = -a.current.facing;
      updateVision(a, a.node, a.current.facing, [a.current.x - a.to.x, a.current.y - a.to.y, a.current.z - a.to.z]);
    }
    straight.visible = options.lines;
    muffleDots.visible = options.lines;
    pathLine.visible = options.lines;
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      const age = (now - r.born) / 1400;
      if (age >= 1) { scene.remove(r.mesh); r.mesh.material.dispose(); ripples.splice(i, 1); continue; }
      const s = 0.4 + age * 4.5;
      r.mesh.scale.set(s, s, s);
      r.mesh.material.opacity = 0.9 * (1 - age);
    }
    controls.update();
    renderer.render(scene, camera);
  }

  return {
    buildMap,
    onStep,
    frame,
    setPalette,
    setTopView,
    isTopView: () => topView,
    setOption(name, value) {
      options[name] = value;
      if (name === 'canopy' && canopyGroup) canopyGroup.visible = value;
    },
    resetAgents() { for (const a of Object.values(agents)) { a.current = null; a.from = null; a.to = null; } },
  };
}
