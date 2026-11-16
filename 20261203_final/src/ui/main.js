// Page entry. For now it proves that the import map, three.js and the baked world load in the
// browser, and draws the ground cover as a small map; the scene, map and designer come in M5 and M6.

import * as THREE from 'three';
import { CONFIG } from '../sim/config.js';
import { loadWorldFromUrl } from '../sim/load.js';

const status = document.getElementById('status');
const PAL = [[40, 40, 48], [235, 225, 200], [190, 160, 110], [150, 190, 120], [60, 110, 70], [30, 70, 40], [140, 140, 150], [70, 120, 200], [200, 90, 80]];

try {
  const t0 = performance.now();
  const world = await loadWorldFromUrl(new URL('../../data/baked/', import.meta.url));
  const ms = performance.now() - t0;
  const canvas = document.createElement('canvas');
  canvas.width = world.W; canvas.height = world.H; canvas.className = 'cover-map';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Ground cover of the study area, ${world.W} by ${world.H} cells of ${world.s} m`);
  const ctx = canvas.getContext('2d'); const img = ctx.createImageData(world.W, world.H);
  for (let k = 0; k < world.n; k++) { img.data.set(PAL[world.cover[k]], k * 4); img.data[k * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  status.textContent = `Under construction. World loaded in ${ms.toFixed(0)} ms: ${world.W} × ${world.H} cells of ${CONFIG.cellSize} m, `
    + `${world.trees.count.toLocaleString()} trees, ${world.paths.edges.length} path segments, ${world.places.length} named places; three.js r${THREE.REVISION}.`;
  status.after(canvas);
} catch (e) {
  status.textContent = `Could not load the world: ${e.message}`;
  throw e;
}
