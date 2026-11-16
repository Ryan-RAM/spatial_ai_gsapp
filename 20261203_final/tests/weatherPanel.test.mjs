// M7.1: the data panel shows the baked observations, unchanged
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seriesOf, ROWS, describeObservation } from '../src/render/weatherPanel.js';
import { localSeconds } from '../src/sim/storm.js';
import { CONFIG } from '../src/sim/config.js';

const record = JSON.parse(readFileSync(new URL('../data/baked/storm-2016-01.json', import.meta.url)));
test('every value the charts draw is a value in storm-2016-01.json', () => {
  const t0 = localSeconds(CONFIG.window.start); const t1 = localSeconds(CONFIG.window.end);
  const s = seriesOf(record, t0, t1);
  for (const row of ROWS) {
    assert.ok(s[row.key].length >= 12, row.key);
    for (const p of s[row.key]) { const r = record.records.find((x) => x.time === p.time); assert.equal(p.v, r[row.key]); }
  }
  const last = s.cumSnowCm.at(-1).v; assert.ok(last > 50, `snow fallen by the end of the window: ${last}`);
});
test('the hover text quotes the observation', () => {
  const r = record.records.find((x) => x.snowCm > 0);
  const txt = describeObservation(r);
  assert.match(txt, new RegExp(r.tempC.toFixed(1))); assert.match(txt, new RegExp(r.utc));
});
