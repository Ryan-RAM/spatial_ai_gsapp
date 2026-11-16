// The 3D view of the Ramble (ROADMAP M5.2). Reads the simulation state; never changes it.
// Built once from the baked world; per frame only small things change (CLAUDE.md §3):
//   - ground: one mesh over the whole area at 1.5 m, ground heights on the CPU once; the snow
//     depth is a small texture (Uint8, 1 cm per step) that the vertex shader adds on top, so a
//     snow update is a texture upload, never new geometry
//   - trees: instanced (trunks, bare crowns of limbs, evergreen cones): one draw per part type
//   - lamps, flashlights, shelters: the only warm lights (warm = safety)
//   - footprints: instanced dents that fade with the tracks' readability
//   - falling snow: points animated in the vertex shader with the recorded wind
//   - fog from the recorded visibility: sigma = 3.912 / V
// Cameras: 'follow' (third person behind an agent, the default, D-031), 'overview', 'first'
// (optional: through a survivor's eyes).

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { toon, toonGradient, glowTexture, survivor as survivorMesh, lamp as lampMesh, toScene } from './kit.js';
import { makeCreature } from './creature3d.js';
import { makeRng } from '../sim/rng.js';
import { pointOnEdge } from '../sim/interventions.js';

const GRID_STEP = 1.5;

export function makeScene3D(canvas, world, { pixelRatio = Math.min(2, globalThis.devicePixelRatio ?? 1) } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.72;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.FogExp2(PALETTE.fog, 0.005);
  scene.add(new THREE.HemisphereLight(0x55628a, 0x0d1020, 0.55));
  const moon = new THREE.DirectionalLight(0x9fb3e6, 0.4); moon.position.set(-60, 90, 40); scene.add(moon);
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.2, 900);
  const rnd = makeRng(20260123).next;

  // ---------------------------------------------------------------- ground and snow
  const snowTex = new THREE.DataTexture(new Uint8Array(world.n), world.W, world.H, THREE.RedFormat, THREE.UnsignedByteType);
  snowTex.minFilter = THREE.LinearFilter; snowTex.magFilter = THREE.LinearFilter; snowTex.flipY = false; snowTex.needsUpdate = true;
  const sizeX = world.maxX - world.minX; const sizeY = world.maxY - world.minY;
  const ground = new THREE.PlaneGeometry(sizeX, sizeY, Math.round(sizeX / GRID_STEP), Math.round(sizeY / GRID_STEP));
  ground.rotateX(-Math.PI / 2);
  {
    const pos = ground.attributes.position; const col = new Float32Array(pos.count * 3); const uv = ground.attributes.uv;
    const cSnow = new THREE.Color(PALETTE.snow); const cLit = new THREE.Color(PALETTE.snowLit); const cPath = new THREE.Color(PALETTE.path);
    const cOut = new THREE.Color(0x1a1e2e); const cRock = new THREE.Color(PALETTE.rock); const cStruct = new THREE.Color(0x2a2d3f);
    for (let q = 0; q < pos.count; q++) {
      const x = pos.getX(q) + (world.minX + world.maxX) / 2; const y = -pos.getZ(q) + (world.minY + world.maxY) / 2;
      pos.setXYZ(q, x, world.groundAt(x, y), -y);
      // uv into the snow texture: cell centres, row 0 north
      uv.setXY(q, (x - world.minX) / sizeX, (world.maxY - y) / sizeY);
      const k = world.cellOf(x, y); const c = k >= 0 ? world.cover[k] : 0;
      const open = k >= 0 ? world.openness[k] / 255 : 1;
      const grain = 0.05 * (Math.sin(x * 1.7 + y * 0.6) * Math.sin(y * 1.3 - x * 0.4) + 0.5 * Math.sin(x * 4.1 + y * 3.7));
      const base = c === 0 ? cOut : c === 8 ? cStruct : c === 6 ? cRock : (c === 1 || c === 2) ? cSnow.clone().lerp(cPath, 0.25) : cSnow.clone().lerp(cLit, 0.4 * open);
      const out = base.clone(); out.offsetHSL(0, 0, grain); col.set([out.r, out.g, out.b], q * 3);
    }
    ground.setAttribute('color', new THREE.BufferAttribute(col, 3));
    ground.computeVertexNormals();
  }
  const groundMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  groundMat.onBeforeCompile = (sh) => {
    sh.uniforms.uSnow = { value: snowTex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uSnow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n// snow on top: the texture holds depth in cm / 255 m\ntransformed.y += texture2D(uSnow, uv).r * 2.55;');
  };
  const groundMesh = new THREE.Mesh(ground, groundMat); scene.add(groundMesh);
  // structures stand up out of the snow (buildings, walls): simple prisms of their height
  {
    const m = []; const geo = new THREE.BoxGeometry(world.s, 1, world.s);
    for (let k = 0; k < world.n; k++) if (world.structH[k] && world.cover[k] === 8) m.push(k);
    const inst = new THREE.InstancedMesh(geo, toon(0x2a2d3f), m.length); const M4 = new THREE.Matrix4();
    m.forEach((k, q) => { const [x, y] = world.center(k); const h = world.structH[k] / 2; M4.compose(toScene(x, y, world.z[k] + h / 2), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)); inst.setMatrixAt(q, M4); });
    scene.add(inst);
  }

  // ---------------------------------------------------------------- trees, instanced
  const T = world.trees.count; const data = world.trees.data; const ev = world.trees.evergreen;
  const trunkGeo = new THREE.CylinderGeometry(0.5, 1, 1, 7); trunkGeo.translate(0, 0.5, 0);
  // a bare crown: limbs fanning up from a unit trunk top, as one geometry (3 variants)
  const crownGeos = [0, 1, 2].map((v) => {
    const parts = []; const r2 = makeRng(100 + v).next; const limbs = 8 + v;
    for (let l = 0; l < limbs; l++) {
      const a = (l / limbs) * Math.PI * 2 + r2() * 0.5; const tilt = 0.35 + 0.45 * r2(); const len = 0.5 + 0.3 * r2();
      const g = new THREE.CylinderGeometry(0.004, 0.012, len, 3); g.translate(0, len / 2, 0);
      g.rotateX(tilt); g.rotateY(a); g.translate(0, 0.45 + 0.4 * r2(), 0); parts.push(g);
      if (l % 2) continue; const t2 = new THREE.CylinderGeometry(0.002, 0.006, len * 0.5, 3); t2.translate(0, len * 0.25, 0); t2.rotateZ(0.6 * (r2() - 0.5)); t2.rotateX(tilt + 0.3); t2.rotateY(a + 0.3); t2.translate(0, 0.6 + 0.35 * r2(), 0); parts.push(t2);
    }
    return mergeGeos(parts);
  });
  const coneGeo = new THREE.ConeGeometry(1, 1, 7); coneGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, toon(PALETTE.barkLight), T);
  const crowns = crownGeos.map((g) => new THREE.InstancedMesh(g, toon(PALETTE.bark), T));
  const cones = new THREE.InstancedMesh(coneGeo, toon(PALETTE.evergreen), Math.max(1, 3 * ev.reduce((a, b) => a + b, 0)));
  const counts = [0, 0, 0]; let nc = 0; const M = new THREE.Matrix4(); const Q = new THREE.Quaternion(); const S = new THREE.Vector3();
  for (let t = 0; t < T; t++) {
    const [x, y, z, h, cr, tr] = data.subarray(t * 6, t * 6 + 6);
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (t * 2.399) % (Math.PI * 2));
    M.compose(toScene(x, y, z - 0.3), yaw, S.set(tr, h * (ev[t] ? 0.45 : 0.6), tr)); trunks.setMatrixAt(t, M); // the cylinder's base radius is 1: scale by the real trunk radius
    if (ev[t]) {
      for (let q = 0; q < 3; q++) { M.compose(toScene(x, y, z + h * (0.25 + 0.2 * q)), yaw, S.set(cr * (1 - q * 0.28), h * 0.38, cr * (1 - q * 0.28))); cones.setMatrixAt(nc++, M); }
    } else {
      const v = t % 3; M.compose(toScene(x, y, z), yaw, S.set(cr * 1.6, h, cr * 1.6)); crowns[v].setMatrixAt(counts[v]++, M);
    }
  }
  crowns.forEach((c, v) => { c.count = counts[v]; scene.add(c); });
  cones.count = nc; scene.add(trunks); scene.add(cones);

  // ---------------------------------------------------------------- dynamic things
  const lampGroup = new THREE.Group(); scene.add(lampGroup);
  const shelterGroup = new THREE.Group(); scene.add(shelterGroup);
  const agentMeshes = new Map();
  let creatureView = null;
  const prints = new THREE.InstancedMesh(new THREE.CircleGeometry(0.13, 8).rotateX(-Math.PI / 2).scale(1, 1, 1.7), new THREE.MeshBasicMaterial({ color: PALETTE.snowShadow, transparent: true, opacity: 0.6, depthWrite: false }), 6000);
  prints.count = 0; scene.add(prints);
  // falling snow, animated in the shader
  const flakes = 4000; const fpos = new Float32Array(flakes * 3);
  for (let q = 0; q < flakes; q++) fpos.set([(rnd() - 0.5) * 80, rnd() * 30, (rnd() - 0.5) * 80], q * 3);
  const fGeo = new THREE.BufferGeometry(); fGeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  const snowUniforms = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector3() }, uRate: { value: 1 } };
  const fMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, map: glowTexture(), transparent: true, opacity: 0.85, depthWrite: false });
  fMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, snowUniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uCenter; uniform vec3 uWind; uniform float uRate;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float fall = mod(transformed.y - uTime * 1.2, 30.0);
        vec3 p = vec3(transformed.x + uWind.x * uTime, fall, transformed.z + uWind.z * uTime);
        p.xz = mod(p.xz - uCenter.xz + 40.0, 80.0) - 40.0 + uCenter.xz;
        p.y += uCenter.y - 8.0;
        transformed = p;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uRate;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * clamp(uRate / 3.0, 0.15, 1.0) );');
  };
  const flakesPts = new THREE.Points(fGeo, fMat); flakesPts.frustumCulled = false; scene.add(flakesPts);

  // ---------------------------------------------------------------- state -> scene
  let lastLayers = null; let cameraMode = 'follow'; let followId = 0;
  const camPos = new THREE.Vector3(); const camLook = new THREE.Vector3(); let camInit = false;
  const view = { renderer, scene, camera };

  function setPlan(layers) {
    if (layers === lastLayers) return; lastLayers = layers;
    lampGroup.clear(); shelterGroup.clear();
    for (const l of layers.plan.lamps) { const [x, y] = pointOnEdge(world, l.edge, l.s); const m = lampMesh(); m.position.copy(toScene(x, y, world.groundAt(x, y))); lampGroup.add(m); }
    for (const nd of layers.plan.shelters) {
      const n = world.paths.nodes[nd]; const g = new THREE.Group();
      const hut = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 2.4), toon(0x3a3550)); hut.position.y = 1.1; g.add(hut);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.2, 4), toon(PALETTE.snowLit)); roof.position.y = 2.8; roof.rotation.y = Math.PI / 4; g.add(roof);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.5), new THREE.MeshBasicMaterial({ color: PALETTE.warm })); door.position.set(0, 0.8, 1.21); g.add(door);
      const light = new THREE.PointLight(PALETTE.warm, 14, 10, 1.7); light.position.set(0, 1.4, 2.0); g.add(light);
      g.position.copy(toScene(n.x, n.y, world.groundAt(n.x, n.y))); shelterGroup.add(g);
    }
  }

  // state: the round state of src/sim/round.js; frac: 0..1 of the way to the next tick (smooth motion)
  function update(state, frac = 0, timeS = performance.now() / 1000) {
    setPlan(state.layers);
    const w = state.weather ?? state.storm.at(state.t);
    // fog from the recorded visibility; the overview (an analytical view from 110 m up) thins it (D-033)
    scene.fog.density = (3.912 / Math.max(50, w.visibilityM)) * (cameraMode === 'overview' ? 0.35 : 1);
    // snow: one texture upload when the layer changed
    if (state.snow.depth !== view.lastDepthRef || state.tick % 15 === 0) {
      const d = snowTex.image.data; const sd = state.snow.depth;
      for (let k = 0; k < world.n; k++) d[k] = Math.min(255, Math.round(sd[k]));
      snowTex.needsUpdate = true; view.lastDepthRef = sd;
    }
    const depthM = (x, y) => { const k = world.cellOf(x, y); return k >= 0 ? state.snow.depth[k] / 100 : 0; };
    const posOf = (a) => {
      const from = a.prevCell ?? a.cell; const [x0, y0] = world.center(from); const [x1, y1] = world.center(a.cell);
      const x = x0 + (x1 - x0) * frac; const y = y0 + (y1 - y0) * frac;
      return [x, y, world.groundAt(x, y) + depthM(x, y) * 0.55];
    };
    // survivors
    for (const a of state.agents) {
      let m = agentMeshes.get(a.id);
      if (!m) { m = survivorMesh({ coat: a.id % 2 ? PALETTE.coat2 : PALETTE.coat1 }); agentMeshes.set(a.id, m); scene.add(m); }
      m.visible = !a.outcome || a.outcome === 'collapsed';
      const [x, y, z] = posOf(a); m.position.copy(toScene(x, y, z));
      m.rotation.y = -(a.heading ?? 0) * Math.PI / 180;
      m.rotation.z = a.outcome === 'collapsed' ? Math.PI / 2 : 0;
      // breath: denser when cold (warmth shown in the world, not on a panel)
      const breath = m.children[m.children.length - 1];
      breath.material.opacity = 0.15 + 0.5 * (1 - Math.min(1, (a.warmth ?? 100) / 100)) * (0.6 + 0.4 * Math.sin(timeS * 3 + a.id));
    }
    // the creature
    const c = state.creatures[0];
    if (c) {
      if (!creatureView) { creatureView = makeCreature(makeRng(7).next); scene.add(creatureView.group); }
      const [x, y, z] = posOf(c); const p = toScene(x, y, z);
      const vel = p.clone().sub(creatureView.group.position).multiplyScalar(60);
      creatureView.group.position.copy(p); creatureView.group.rotation.y = -(c.heading ?? 0) * Math.PI / 180;
      creatureView.group.updateMatrixWorld();
      const to = (w.windToDeg ?? 0) * Math.PI / 180; const wind = new THREE.Vector3(Math.sin(to), 0, -Math.cos(to)).multiplyScalar(w.windMs);
      creatureView.update(timeS, vel.clampLength(0, 6), wind, Math.min(1, (w.gustKt ?? 0) / 30));
    }
    // footprints: the newest tracks, fading with readability (refreshed every 10 frames)
    if ((view.frame = (view.frame ?? 0) + 1) % 10 === 1) {
      const sn = state.snow; let q = 0;
      for (let k = 0; k < world.n && q < 6000; k++) {
        const t = sn.trackAt(k); if (t < 0) continue; const r = sn.readability(t); if (r <= 0.02) continue;
        const tr = sn.track(t); const [x, y] = world.center(k);
        M.compose(toScene(x, y, world.groundAt(x, y) + sn.depth[k] / 100 + 0.02), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -tr.heading * Math.PI / 180), S.set(r, 1, r));
        prints.setMatrixAt(q++, M);
      }
      prints.count = q; prints.instanceMatrix.needsUpdate = true;
    }
    // falling snow follows the camera, drifts with the wind
    snowUniforms.uTime.value = timeS; snowUniforms.uCenter.value.copy(camera.position); snowUniforms.uRate.value = w.snowRateCmH;
    const to = (w.windToDeg ?? 0) * Math.PI / 180; snowUniforms.uWind.value.set(Math.sin(to) * w.windMs * 0.4, 0, -Math.cos(to) * w.windMs * 0.4);
    // camera
    const target = state.agents.find((a) => a.id === followId && !a.outcome) ?? state.agents.find((a) => !a.outcome) ?? state.creatures[0];
    if (target) {
      const [x, y, z] = posOf(target); const h = (target.heading ?? 90) * Math.PI / 180;
      let want; let look;
      if (cameraMode === 'overview') { want = toScene(x - 70, y - 90, z + 110); look = toScene(x, y, z); }
      else if (cameraMode === 'first' && target.kind === 'survivor') { want = toScene(x, y, z + 1.7); look = toScene(x + Math.sin(h) * 10, y + Math.cos(h) * 10, z + 1.4); }
      else { want = toScene(x - Math.sin(h) * 11, y - Math.cos(h) * 11, z + 6.5); look = toScene(x + Math.sin(h) * 3, y + Math.cos(h) * 3, z + 1.2); }
      if (!camInit) { camPos.copy(want); camLook.copy(look); camInit = true; }
      camPos.lerp(want, 0.08); camLook.lerp(look, 0.12);
      camera.position.copy(camPos); camera.lookAt(camLook);
      for (const m of agentMeshes.values()) m.visible = m.visible && !(cameraMode === 'first' && m === agentMeshes.get(target.id));
    }
  }

  function resize(w, h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function render() { renderer.render(scene, camera); }
  return {
    ...view, update, render, resize,
    setCamera(mode) { cameraMode = mode; camInit = false; },
    follow(id) { followId = id; },
    get cameraMode() { return cameraMode; },
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
  };
}

// merge plain BufferGeometries (position, normal, index) into one
function mergeGeos(geos) {
  let nv = 0; let ni = 0; for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const P = new Float32Array(nv * 3); const N = new Float32Array(nv * 3); const I = new Uint32Array(ni); let ov = 0; let oi = 0;
  for (const g of geos) {
    P.set(g.attributes.position.array, ov * 3); N.set(g.attributes.normal.array, ov * 3);
    for (let q = 0; q < g.index.count; q++) I[oi + q] = g.index.array[q] + ov;
    ov += g.attributes.position.count; oi += g.index.count;
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setIndex(new THREE.BufferAttribute(I, 1));
  return out;
}
