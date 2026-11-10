// Shared helpers for the Node tests and the headless runner.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeFrame } from '../src/sim/geo.js';
import { parseData } from '../src/sim/data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Real processed data when it exists, otherwise null (buildWorld then uses the placeholder).
export function loadDataNode(config) {
  const b = join(ROOT, config.data.buildings), l = join(ROOT, config.data.land);
  if (!existsSync(b) || !existsSync(l)) return null;
  return parseData(JSON.parse(readFileSync(b, 'utf8')), JSON.parse(readFileSync(l, 'utf8')), makeFrame(config.site));
}
