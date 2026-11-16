// The creature in 3D, animated (M5.2, D-032). Its roots move without a physics simulation: every
// strand is a thin tube whose vertices know how far along the strand they are (0 at the root's
// anchor, 1 at its tip) and a phase; the vertex shader bends them, more toward the tip:
//   - a slow, never-quite-regular sway
//   - lag behind motion: strands trail when it moves and whip forward when it stops
//   - the wind of the storm clock (direction and speed from the record), stronger in gusts
//   - now and then a twitch, a fast shiver of a few strands
// One geometry, one draw call, no collision: the strands are thin and stay near the body, and the
// creature only walks cells without solids. Cost is independent of the simulation.

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { toonGradient, glowTexture } from './kit.js';

// merge tubes into one BufferGeometry with attributes `along` and `phase`
function mergeStrands(strands, tubular = 28, radial = 5) {
  const parts = strands.map(({ pts, r, phase }) => {
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), tubular, r, radial);
    // taper toward the tip
    const pos = g.attributes.position; const curve = g.parameters.path;
    const along = new Float32Array(pos.count); const ph = new Float32Array(pos.count).fill(phase);
    for (let v = 0; v < pos.count; v++) {
      const i = Math.floor(v / (radial + 1)); const u = i / tubular; along[v] = u;
      const c = curve.getPointAt(Math.min(1, u)); const p = new THREE.Vector3().fromBufferAttribute(pos, v);
      p.sub(c).multiplyScalar(1 - 0.75 * u).add(c); pos.setXYZ(v, p.x, p.y, p.z);
    }
    g.setAttribute('along', new THREE.BufferAttribute(along, 1)); g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
    g.computeVertexNormals();
    return g;
  });
  let nv = 0; let ni = 0; for (const g of parts) { nv += g.attributes.position.count; ni += g.index.count; }
  const out = new THREE.BufferGeometry();
  const P = new Float32Array(nv * 3); const N = new Float32Array(nv * 3); const A = new Float32Array(nv); const H = new Float32Array(nv); const I = new Uint32Array(ni);
  let ov = 0; let oi = 0;
  for (const g of parts) {
    P.set(g.attributes.position.array, ov * 3); N.set(g.attributes.normal.array, ov * 3);
    A.set(g.attributes.along.array, ov); H.set(g.attributes.phase.array, ov);
    for (let q = 0; q < g.index.count; q++) I[oi + q] = g.index.array[q] + ov;
    ov += g.attributes.position.count; oi += g.index.count;
  }
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('along', new THREE.BufferAttribute(A, 1)); out.setAttribute('phase', new THREE.BufferAttribute(H, 1));
  out.setIndex(new THREE.BufferAttribute(I, 1));
  return out;
}

// the body: strands twisting up from the ground and leaning forward; two arms of many strands
// reaching ahead; roots creeping over the snow; a small head with two uneven eyes
function strandsOf(rnd) {
  const S = [];
  for (let s = 0; s < 46; s++) { // trunk
    const a0 = rnd() * Math.PI * 2; const r0 = 0.3 + rnd() * 0.35; const pts = [];
    for (let t = 0; t <= 10; t++) {
      const u = t / 10; const a = a0 + u * (2.2 + rnd() * 0.4);
      pts.push(new THREE.Vector3(Math.cos(a) * r0 * (1 - 0.5 * u), u * (3.2 + rnd() * 0.4), Math.sin(a) * r0 * (1 - 0.5 * u) - u * u * 1.1));
    }
    S.push({ pts, r: 0.025 + rnd() * 0.035, phase: rnd() });
  }
  for (const side of [-1, 1]) for (let s = 0; s < 14; s++) { // arms: thin, many, uneven
    const len = 2.4 + rnd() * 0.9; const pts = [];
    for (let t = 0; t <= 9; t++) {
      const u = t / 9; const spread = 0.12 * (s - 6.5) * u * u;
      pts.push(new THREE.Vector3(side * (0.35 + u * 0.7) + spread * side + 0.08 * Math.sin(u * 6 + s), 3.0 - u * 2.85 + 0.15 * Math.sin(u * 3 + s), -0.9 - u * len - 0.05 * s * u));
    }
    S.push({ pts, r: 0.012 + 0.016 * rnd(), phase: rnd() });
  }
  for (let s = 0; s < 22; s++) { // roots creeping ahead over the snow
    const a = (rnd() - 0.5) * 1.8; const L = 2 + rnd() * 5; const pts = [];
    for (let t = 0; t <= 8; t++) { const u = t / 8; pts.push(new THREE.Vector3(Math.sin(a + 0.35 * Math.sin(u * 4 + s)) * u * L, 0.05 + 0.1 * (1 - u), -Math.cos(a) * u * L)); }
    S.push({ pts, r: 0.02 + 0.03 * rnd(), phase: rnd() });
  }
  return S;
}

export function makeCreature(rnd) {
  const group = new THREE.Group();
  const uniforms = { uTime: { value: 0 }, uVel: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector3() }, uGust: { value: 0 } };
  const mat = new THREE.MeshToonMaterial({ color: PALETTE.root, gradientMap: toonGradient() });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float along; attribute float phase;
        uniform float uTime; uniform vec3 uVel; uniform vec3 uWind; uniform float uGust;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float w = along * along;
        vec3 sway = vec3(sin(uTime * 1.3 + phase * 6.3) + 0.5 * sin(uTime * 2.9 + phase * 11.0),
                         0.35 * sin(uTime * 2.1 + phase * 3.1),
                         cos(uTime * 1.1 + phase * 5.1)) * 0.16 * w * (1.0 + uGust);
        float twitch = step(0.94, fract(uTime * 0.21 + phase * 7.0)) * sin(uTime * 37.0 + phase * 50.0) * 0.07 * w;
        transformed += sway + vec3(twitch, 0.0, twitch) - uVel * 0.45 * w + uWind * 0.22 * w * (1.0 + uGust);`);
  };
  const body = new THREE.Mesh(mergeStrands(strandsOf(rnd)), mat);
  group.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.27, 1), new THREE.MeshToonMaterial({ color: PALETTE.root, gradientMap: toonGradient() }));
  head.position.set(0.05, 3.15, -1.55); head.scale.set(0.9, 1.15, 1.1); group.add(head);
  for (const [dx, dy, sz] of [[-0.1, 0.03, 0.035], [0.11, -0.02, 0.028]]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(sz, 8, 6), new THREE.MeshBasicMaterial({ color: PALETTE.eye }));
    eye.position.set(0.05 + dx, 3.15 + dy, -1.82); group.add(eye);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: PALETTE.eye, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.copy(eye.position); glow.scale.setScalar(0.35); group.add(glow);
  }
  // velocity in the creature's own frame, smoothed so that stopping makes the strands whip forward
  const vel = new THREE.Vector3();
  return {
    group, uniforms, head,
    // t seconds; worldVel and wind as THREE.Vector3 in scene space (m/s); gust 0..1
    update(t, worldVel, wind, gust = 0) {
      uniforms.uTime.value = t;
      const inv = new THREE.Matrix4().copy(group.matrixWorld).invert().setPosition(0, 0, 0);
      const local = worldVel.clone().applyMatrix4(inv);
      vel.lerp(local, 0.12); uniforms.uVel.value.copy(vel);
      uniforms.uWind.value.copy(wind.clone().applyMatrix4(inv)); uniforms.uGust.value = gust;
      // the head jerks a little ahead of the body when it moves
      head.position.z = -1.55 - 0.15 * Math.min(1, local.length() / 2);
    },
  };
}
