// Page entry. For now it only proves that the import map, three.js and the simulation config load
// in the browser; the scene, map and designer are wired in M5 and M6.

import * as THREE from 'three';
import { CONFIG } from '../sim/config.js';

const status = document.getElementById('status');
status.textContent =
  `Under construction. Simulation config loaded (cell ${CONFIG.cellSize} m, ` +
  `${CONFIG.roundTicks}-tick rounds); three.js r${THREE.REVISION} ready.`;
