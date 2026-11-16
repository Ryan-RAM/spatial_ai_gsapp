// Building blocks of the 3D view (M5.1 style frame, reused by M5.2): terrain and snow from the baked
// world, stylised trees at their real positions and heights, survivors, the creature, lamps and
// falling snow. Toon shading with a soft outline (an inverted hull) so silhouettes read in the
// dark. Real data decides where and how big; the shapes are stylised (CLAUDE.md §4).

import * as THREE from 'three';
import { PALETTE } from './palette.js';

// a 3-step toon ramp, soft
export function toonGradient() {
  const data = new Uint8Array([70, 150, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
  return tex;
}
const GRAD = toonGradient();
export const toon = (color, opts = {}) => new THREE.MeshToonMaterial({ color, gradientMap: GRAD, ...opts });

// the outline: a slightly bigger copy, back faces only, flat dark
export function outlined(mesh, width = 0.04, color = PALETTE.outline) {
  const hull = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
  hull.scale.setScalar(1 + width); hull.renderOrder = -1;
  const g = new THREE.Group(); g.add(hull); g.add(mesh);
  g.position.copy(mesh.position); mesh.position.set(0, 0, 0); hull.position.set(0, 0, 0);
  return g;
}

// three.js axes: x = east, y = up, z = south (so frame W (x, y north) -> (x, z = -y))
export const toScene = (x, y, z) => new THREE.Vector3(x, z, -y);

// Terrain + snow surface over a window of the world (metres of frame W), resampled to `step` m.
// The snow surface is the ground plus the snow depth (cm), smoothed; the colour follows depth and
// exposure so wind-blown drifts read.
export function snowSurface(world, snowDepthCm, { minX, maxX, minY, maxY, step = 1 }) {
  const nx = Math.round((maxX - minX) / step) + 1; const ny = Math.round((maxY - minY) / step) + 1;
  const geo = new THREE.PlaneGeometry(maxX - minX, maxY - minY, nx - 1, ny - 1);
  geo.rotateX(-Math.PI / 2); // lies in x-z, normal up
  const pos = geo.attributes.position; const colors = new Float32Array(pos.count * 3);
  const cLit = new THREE.Color(PALETTE.snowLit); const cMid = new THREE.Color(PALETTE.snow); const cDeep = new THREE.Color(PALETTE.snowDeep);
  // snow depth, bilinear over the cell centres (snow hides the cell grid)
  const cellD = (i, j) => { const ii = Math.max(0, Math.min(world.W - 1, i)); const jj = Math.max(0, Math.min(world.H - 1, j)); return snowDepthCm[jj * world.W + ii] / 100; };
  const depthAt = (x, y) => {
    const fx = (x - world.minX) / world.s - 0.5; const fy = (world.maxY - y) / world.s - 0.5;
    const i = Math.floor(fx); const j = Math.floor(fy); const u = fx - i; const v = fy - j;
    return (1 - v) * ((1 - u) * cellD(i, j) + u * cellD(i + 1, j)) + v * ((1 - u) * cellD(i, j + 1) + u * cellD(i + 1, j + 1));
  };
  for (let q = 0; q < pos.count; q++) {
    const x = pos.getX(q) + (minX + maxX) / 2; const y = -(pos.getZ(q)) + (minY + maxY) / 2;
    const g = world.groundAt(x, y);
    // smooth the snow by averaging the depth of the cells around (snow hides the cell grid)
    let d = 0; let n = 0; for (const [dx, dy] of [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5], [1.8, 1.8], [-1.8, 1.8], [1.8, -1.8], [-1.8, -1.8]]) { d += depthAt(x + dx, y + dy); n++; }
    d /= n;
    const k = world.cellOf(x, y);
    const water = k >= 0 && world.cover[k] === 7;
    // a frozen pond carries snow too, a little less (it is flat and open): no cliff at its shore
    pos.setXYZ(q, x, g + d * (water ? 0.8 : 1), -y);
    const open = k >= 0 ? world.openness[k] / 255 : 1;
    // hand-drawn grain: a soft value noise on the snow, and drifts lighter on their crests
    const grain = 0.06 * (Math.sin(x * 1.7 + y * 0.6) * Math.sin(y * 1.3 - x * 0.4) + 0.5 * Math.sin(x * 4.1 + y * 3.7));
    const c = cMid.clone().lerp(cLit, Math.min(1, 0.45 * open + Math.max(0, d - 0.6) * 0.8)).lerp(cDeep, Math.max(0, 0.6 - d) * 0.3);
    if (water) c.lerp(new THREE.Color(PALETTE.ice), 0.25);
    c.offsetHSL(0, 0, grain);
    colors.set([c.r, c.g, c.b], q * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true }));
}

// A stylised bare winter tree: tapered trunk, a few upward limbs, a faint crown haze, snow on the
// limbs; evergreens are stacked cones. Size from the data (height, crown radius, trunk radius).
export function tree({ x, y, z, h, crown, trunk, evergreen }, rnd) {
  const g = new THREE.Group(); g.position.copy(toScene(x, y, z));
  const bark = toon(PALETTE.bark); const snowM = toon(PALETTE.snowLit);
  if (evergreen) {
    const tiers = 4;
    for (let t = 0; t < tiers; t++) {
      const r = crown * (1 - t / tiers) * 0.9; const hh = h * 0.32;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, hh, 7), toon(PALETTE.evergreen));
      cone.position.y = h * 0.25 + t * h * 0.18 + hh / 2; g.add(outlined(cone, 0.03));
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.75, hh * 0.35, 7), snowM); cap.position.y = cone.position.y + hh * 0.18; g.add(cap);
    }
  }
  const trunkH = evergreen ? h * 0.4 : h * 0.55;
  const barkM = toon(PALETTE.barkLight);
  const tm = new THREE.Mesh(new THREE.CylinderGeometry(trunk * 0.5, trunk, trunkH, 7), barkM); tm.position.y = trunkH / 2;
  g.add(outlined(tm, 0.05));
  if (!evergreen) {
    // limbs fan up and out to the crown radius; each splits into two twigs; snow lies on top
    const limbs = 7 + Math.floor(rnd() * 4);
    const twigM = toon(PALETTE.bark);
    const limbGeo = (r, len) => { const geo = new THREE.CylinderGeometry(r * 0.25, r, len, 5); geo.translate(0, len / 2, 0); return geo; };
    for (let l = 0; l < limbs; l++) {
      const a = (l / limbs) * Math.PI * 2 + rnd() * 0.5; const tilt = 0.35 + 0.45 * rnd();
      const len = Math.min(h * 0.45, crown / Math.sin(tilt)) * (0.75 + 0.3 * rnd()); const r = trunk * (0.28 + 0.12 * rnd());
      const pivot = new THREE.Group(); pivot.position.y = trunkH * (0.65 + 0.4 * rnd());
      pivot.rotation.order = 'YXZ'; pivot.rotation.y = a; pivot.rotation.x = tilt;
      pivot.add(new THREE.Mesh(limbGeo(r, len), twigM));
      const sn = new THREE.Mesh(limbGeo(r * 0.7, len * 0.85), snowM); sn.position.set(0, 0, -r * 0.5); pivot.add(sn);
      for (const side of [-1, 1]) {
        const tw = new THREE.Group(); tw.position.y = len * (0.55 + 0.3 * rnd()); tw.rotation.z = side * (0.4 + 0.4 * rnd()); tw.rotation.x = -0.2;
        tw.add(new THREE.Mesh(limbGeo(r * 0.45, len * 0.45), twigM)); pivot.add(tw);
      }
      g.add(pivot);
    }
    const haze = new THREE.Mesh(new THREE.SphereGeometry(crown * 0.95, 12, 8), new THREE.MeshBasicMaterial({ color: PALETTE.crownHaze, transparent: true, opacity: 0.12, depthWrite: false }));
    haze.scale.y = 0.65; haze.position.y = h * 0.78; g.add(haze);
  }
  return g;
}

// A survivor: a rounded figure in a winter coat, a scarf, a flashlight with a warm beam, breath.
export function survivor({ coat = PALETTE.coat1, heading = 0 } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.55, 4, 10), toon(coat)); body.position.y = 1.12; g.add(outlined(body, 0.05));
  const dark = toon(0x2b2f45);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 3, 8), dark); leg.position.set(side * 0.13, 0.42, side * 0.08); leg.rotation.x = side * 0.25; g.add(outlined(leg, 0.08));
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.45, 3, 8), toon(coat)); arm.position.set(side * 0.34, 1.15, side === 1 ? -0.18 : 0.05); arm.rotation.x = side === 1 ? -1.0 : 0.3; arm.rotation.z = side * 0.15; g.add(arm);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), toon(PALETTE.skin)); head.position.y = 1.66; g.add(outlined(head, 0.08));
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), toon(coat)); hood.position.y = 1.7; g.add(hood);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 14), toon(PALETTE.scarf)); scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.47; g.add(scarf);
  // the flashlight: a warm spot light and a soft visible cone
  const lamp = new THREE.SpotLight(PALETTE.warmHot, 14, 18, Math.PI / 7, 0.6, 1.6); lamp.position.set(0.25, 1.25, -0.2);
  const target = new THREE.Object3D(); target.position.set(0, 0, -9); g.add(target); lamp.target = target; g.add(lamp);
  // the beam: a cone with its apex at the torch, opening forward and a little down, fading out
  const beamGeo = new THREE.ConeGeometry(1.5, 8, 24, 1, true); beamGeo.translate(0, -4, 0); // apex at the origin
  const fade = new Float32Array(beamGeo.attributes.position.count * 3);
  for (let q = 0; q < beamGeo.attributes.position.count; q++) { const t = Math.min(1, -beamGeo.attributes.position.getY(q) / 8); const v = 1 - t; fade.set([v, v * 0.8, v * 0.55], q * 3); }
  beamGeo.setAttribute('color', new THREE.BufferAttribute(fade, 3));
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.rotation.x = Math.PI / 2 - 0.14; beam.position.set(0.25, 1.25, -0.25); g.add(beam); // forward (-z), a little down
  const torch = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: PALETTE.warmHot })); torch.position.copy(lamp.position); g.add(torch);
  // breath: the white plume (warmth is shown in the world, not on a panel)
  const breath = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
  breath.position.set(0, 1.62, -0.38); breath.scale.set(1.2, 0.8, 1.6); g.add(breath);
  g.rotation.y = -heading * Math.PI / 180;
  return g;
}

// The creature: an original tangle of roots, hunched, taller than a person, with glowing eyes.
export function creature(rnd, { heading = 0 } = {}) {
  const g = new THREE.Group();
  const rootM = toon(PALETTE.root); const rootL = toon(PALETTE.rootLight);
  const strands = 44;
  for (let s = 0; s < strands; s++) {
    const pts = []; const a0 = rnd() * Math.PI * 2; const r0 = 0.9 + rnd() * 0.9;
    // from the ground, spiralling up into a hunched back, some curling forward as arms
    const arm = s % 6 === 0;
    for (let t = 0; t <= 8; t++) {
      const u = t / 8; const a = a0 + u * (1.5 + rnd() * 0.5);
      const rr = r0 * (1 - u * 0.75) + (arm ? u * 1.2 : 0);
      pts.push(new THREE.Vector3(Math.cos(a) * rr * 0.8, u * (arm ? 2.2 : 2.9) + Math.sin(u * 9 + s) * 0.08, Math.sin(a) * rr * 0.6 - (arm ? u * 1.1 : u * 0.5)));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.05 + rnd() * 0.07, 5), s % 3 ? rootM : rootL);
    g.add(tube);
  }
  // a knot of roots for a head, and roots spreading over the snow around its feet
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), rootM); core.position.set(0, 2.65, -0.7); core.scale.set(1.1, 0.9, 1.2); g.add(outlined(core, 0.06));
  for (let s = 0; s < 14; s++) {
    const a = rnd() * Math.PI * 2; const L = 1.2 + rnd() * 1.6; const pts = [];
    for (let t = 0; t <= 6; t++) { const u = t / 6; pts.push(new THREE.Vector3(Math.cos(a + u * 0.6) * (0.5 + u * L), 0.15 * (1 - u) + 0.05 * Math.sin(u * 7 + s), Math.sin(a + u * 0.6) * (0.5 + u * L))); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.07 * (1 - 0.3 * rnd()), 5), rootM));
  }
  const rim = new THREE.PointLight(0x8fa8ff, 2.5, 7, 2); rim.position.set(0, 3.2, 1.6); g.add(rim);
  for (const dx of [-0.24, 0.24]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), new THREE.MeshBasicMaterial({ color: PALETTE.eye }));
    eye.position.set(dx * 0.8, 2.68, -1.2); g.add(eye);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: PALETTE.eye, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.copy(eye.position); glow.scale.setScalar(0.9); g.add(glow);
  }
  const eyeLight = new THREE.PointLight(PALETTE.eye, 1.2, 6, 2); eyeLight.position.set(0, 2.6, -1.4); g.add(eyeLight);
  g.rotation.y = -heading * Math.PI / 180;
  return g;
}

// A park lamp: post, a warm lantern, a pool of warm light on the snow.
export function lamp() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.6, 8), toon(0x1c1f2c)); post.position.y = 1.8; g.add(outlined(post, 0.1));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshBasicMaterial({ color: PALETTE.warmHot })); head.position.y = 3.75; g.add(head);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: PALETTE.warm, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.y = 3.75; glow.scale.setScalar(3.2); g.add(glow);
  const light = new THREE.PointLight(PALETTE.warm, 26, 15, 1.7); light.position.y = 3.7; g.add(light);
  return g;
}

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(c); return glowTex;
}

// Falling snow: points in a box around the camera, density from the snowfall rate (cm/h).
export function snowfall(center, size, rateCmH, rnd) {
  const n = Math.round(1200 + 900 * rateCmH);
  const pos = new Float32Array(n * 3);
  for (let q = 0; q < n; q++) pos.set([center.x + (rnd() - 0.5) * size, center.y + rnd() * 25, center.z + (rnd() - 0.5) * size], q * 3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.32, map: glowTexture(), transparent: true, opacity: 0.9, depthWrite: false }));
}

// Footprints: small dark dents along a track (cells of frame W), on the snow surface.
export function footprints(world, depthAt, points) {
  const g = new THREE.Group(); const m = new THREE.MeshBasicMaterial({ color: PALETTE.snowShadow, transparent: true, opacity: 0.55, depthWrite: false });
  points.forEach(([x, y, a], q) => {
    const side = q % 2 ? 0.14 : -0.14; const ux = Math.cos(a); const uy = -Math.sin(a);
    const px = x + ux * side; const py = y + uy * side;
    const dent = new THREE.Mesh(new THREE.CircleGeometry(0.12, 10), m); dent.rotation.x = -Math.PI / 2; dent.scale.set(1, 1.7, 1);
    dent.position.copy(toScene(px, py, world.groundAt(px, py) + depthAt(px, py) + 0.015)); dent.rotation.z = a; g.add(dent);
  });
  return g;
}
