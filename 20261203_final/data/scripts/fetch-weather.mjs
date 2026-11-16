// Downloads the hourly KNYC record of the January 2016 blizzard (semantic model §16) into
// data/raw/weather/. Run: npm run fetch:weather

import { mkdirSync, writeFileSync } from 'node:fs';
import { fetchAsosCsv } from '../../src/data/weather.js';

export const STORM = { station: 'NYC', start: '2016-01-22T12:00Z', end: '2016-01-24T12:00Z', file: 'knyc-2016-01.csv' };
const out = new URL('../raw/weather/', import.meta.url);
mkdirSync(out, { recursive: true });
const csv = await fetchAsosCsv(STORM.station, STORM.start, STORM.end);
writeFileSync(new URL(STORM.file, out), csv);
console.log(`${STORM.file}: ${csv.trim().split('\n').length - 1} observations`);
