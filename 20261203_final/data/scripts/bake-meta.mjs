// Writes data/baked/meta.json: frame W's origin, the study bbox (metres and degrees), the cell size
// and the grid size. Every other baked file is laid out on this grid. Run: npm run bake:meta

import { mkdirSync, writeFileSync } from 'node:fs';
import { CONFIG } from '../../src/sim/config.js';
import { studyArea } from '../../src/data/area.js';

const { grid, bboxDeg } = studyArea(CONFIG);
const meta = {
  name: 'Frostroot: The Ramble',
  frame: 'W: local east-north-up, metres, origin at the KNYC station; cell (i, j) with j growing southward, idx = j * W + i',
  origin: { ...CONFIG.origin, datum: 'WGS84' },
  bboxM: CONFIG.studyArea.bboxM,
  bboxDeg: bboxDeg.map((v) => +v.toFixed(6)),
  cellSize: CONFIG.cellSize,
  W: grid.W,
  H: grid.H,
  cells: grid.W * grid.H,
};
const out = new URL('../baked/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('meta.json', out), JSON.stringify(meta, null, 2) + '\n');
console.log(`meta.json: ${meta.W} x ${meta.H} = ${meta.cells} cells of ${meta.cellSize} m; bbox ${meta.bboxDeg.join(', ')}`);
