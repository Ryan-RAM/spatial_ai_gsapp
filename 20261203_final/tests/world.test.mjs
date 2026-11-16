// M1.6: the composed world layers, the manifest and the data budget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/sim/config.js';
import { COVER } from '../src/sim/cover.js';
import { studyArea } from '../src/data/area.js';

const baked = (f) => new URL(`../data/baked/${f}`, import.meta.url);
const meta = JSON.parse(readFileSync(baked('world.json'), 'utf8'));
const buf = new Uint8Array(readFileSync(baked('world.bin')));
const manifest = JSON.parse(readFileSync(baked('MANIFEST.json'), 'utf8'));
const { grid, enu } = studyArea(CONFIG);
const n = grid.W * grid.H;
const layer = (name) => { const s = meta.sections.find((x) => x.name === name); return s.type === 'float32' ? new Float32Array(buf.buffer, buf.byteOffset + s.offset, n) : buf.subarray(s.offset, s.offset + n); };
const cover = layer('cover'); const osmCover = new Uint8Array(readFileSync(baked('cover.bin')));
const paths = JSON.parse(readFileSync(baked('paths.json'), 'utf8'));

test('world.bin: every section is there, sized and aligned', () => {
  assert.equal(buf.length, meta.sections.reduce((s, x) => s + x.bytes, 0));
  for (const name of ['cover', 'z', 'slope', 'openness', 'canopy', 'canopyEv', ...meta.windDirs.map((d) => `drift_${d}`)])
    assert.ok(meta.sections.find((s) => s.name === name), `${name} missing`);
  for (const s of meta.sections) if (s.type === 'float32') assert.equal(s.offset % 4, 0);
});

test('thickets only in former woodland, outcrops only on steep ground; nothing else changed', () => {
  const slope = layer('slope');
  for (let k = 0; k < n; k++) {
    if (cover[k] === osmCover[k]) continue;
    if (cover[k] === COVER.THICKET) assert.equal(osmCover[k], COVER.WOODLAND);
    else if (cover[k] === COVER.ROCK) assert.ok(slope[k] >= meta.rules.rockSlope);
    else assert.fail(`cell ${k} changed from ${osmCover[k]} to ${cover[k]}`);
  }
  assert.ok(meta.counts.thicket > 0 && meta.counts.thicket < 0.25 * (meta.counts.woodland_floor + meta.counts.thicket));
});

test('openness and drift stay in range; canopy shelters and damps drift', () => {
  const open = layer('openness'); const canopy = layer('canopy');
  let underTrees = 0; let openGround = 0; let a = 0; let b = 0;
  for (let k = 0; k < n; k++) { if (canopy[k] > 200) { underTrees += open[k]; a++; } else if (canopy[k] < 20 && cover[k] === COVER.LAWN) { openGround += open[k]; b++; } }
  assert.ok(underTrees / a < openGround / b, 'woods are less open than lawns');
  for (const d of meta.windDirs) { const dr = layer(`drift_${d}`); for (let k = 0; k < n; k++) assert.ok(dr[k] >= 50 && dr[k] <= 200); }
});

test('rule I2 on the final map: a survivor can walk from every exit to the spawn area', () => {
  const walkable = (c) => [COVER.PATH_PAVED, COVER.PATH_DIRT, COVER.LAWN, COVER.WOODLAND].includes(c);
  const goal = grid.cellOf(...enu.toEnu(40.7772, -73.9700, 0).slice(0, 2));
  for (const e of paths.exits) {
    const seen = new Uint8Array(n); const q = [grid.cellOf(e.x, e.y)]; seen[q[0]] = 1;
    while (q.length) {
      const c = q.pop(); const i = c % grid.W; const j = (c - i) / grid.W;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ni = i + di; const nj = j + dj; if (ni < 0 || nj < 0 || ni >= grid.W || nj >= grid.H) continue;
        const m = nj * grid.W + ni; if (!seen[m] && walkable(cover[m])) { seen[m] = 1; q.push(m); }
      }
    }
    assert.ok(seen[goal], `no way from ${e.id}`);
  }
});

test('manifest: inputs and outputs hashed; baked data under the 15 MB gzip budget', () => {
  assert.ok(Object.keys(manifest.inputs).length >= 3);
  for (const f of ['world.bin', 'paths.json', 'storm-2016-01.json', 'trees.bin']) {
    assert.ok(manifest.outputs[f], `${f} not in the manifest`);
    assert.equal(manifest.outputs[f].bytes, readFileSync(baked(f)).length, `${f} changed since the manifest: run npm run bake`);
  }
  assert.ok(manifest.gzipTotalMB < CONFIG.targets.bakedGzipMB);
  const lic = readFileSync(baked('LICENSE.md'), 'utf8');
  assert.match(lic, /Open Database License/);
  assert.match(lic, /NOAA/);
});
