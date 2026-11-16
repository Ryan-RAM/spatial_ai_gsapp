// Downloads the OpenStreetMap data around the Ramble into data/raw/osm/ (D-011).
// The download area is wider than the study area so that features crossing its edge (the Lake,
// the 79th Street Transverse, Fifth Avenue) come in whole; M1.1 cuts the study bbox from it.
// Run: npm run fetch:osm

import { mkdirSync, writeFileSync } from 'node:fs';
import { fetchOsmXml } from '../../src/data/osm.js';

export const DOWNLOAD_BBOX = [-73.9765, 40.7710, -73.9615, 40.7835]; // minLon, minLat, maxLon, maxLat

const out = new URL('../raw/osm/', import.meta.url);
mkdirSync(out, { recursive: true });
const xml = await fetchOsmXml(DOWNLOAD_BBOX);
writeFileSync(new URL('ramble.osm', out), xml);
const count = (el) => (xml.match(new RegExp(`<${el} `, 'g')) || []).length;
console.log(`ramble.osm: ${(xml.length / 1e6).toFixed(1)} MB, ${count('node')} nodes, ${count('way')} ways, ${count('relation')} relations`);
