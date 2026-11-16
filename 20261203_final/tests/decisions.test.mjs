// M0.2: every decision referenced in config.js is written up in DECISIONS.md, and each of the
// seven open questions of semantic model §17 (D-001..D-007) has a parameter in config.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const config = read('../src/sim/config.js');
const decisions = read('../DECISIONS.md');
const ids = (s, re) => new Set([...s.matchAll(re)].map((m) => m[1]));

test('every D-nnn in config.js has a heading in DECISIONS.md', () => {
  const headings = ids(decisions, /^#{2,3} D-(\d{3})/gm);
  for (const id of ids(config, /D-(\d{3})/g)) assert.ok(headings.has(id), `D-${id} missing in DECISIONS.md`);
});

test('the seven §17 questions are decided and wired into config.js', () => {
  for (let n = 1; n <= 7; n++) {
    const id = `D-00${n}`;
    assert.match(decisions, new RegExp(`^### ${id} `, 'm'), `${id} not in DECISIONS.md`);
    assert.ok(config.includes(id), `${id} not referenced in config.js`);
  }
});
