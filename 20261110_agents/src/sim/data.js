// Reads the processed data files written by data/scripts/process_nyc.py.
//
// buildings.json  { format: 'nyc-agents-buildings/1', source, site, buildings: [[top_dm, base_dm, name, [x, y, ...]_dm], ...] }
// land.json       { format: 'nyc-agents-land/1', source, site, land: [{ name, p: [x, y, ...]_dm }] }
//
// Coordinates are decimetres in the local frame of `site` (geo.js). If the file was made for a
// different bounding box than config.site, the points are re-projected.

import { makeFrame } from './geo.js';

export function parseData(bjson, ljson, frame) {
  if (!bjson?.format?.startsWith('nyc-agents-buildings/') || !ljson?.format?.startsWith('nyc-agents-land/')) {
    throw new Error('Unknown data format: re-run data/scripts/process_nyc.py');
  }
  const conv = converter(bjson.site, frame);
  const convL = converter(ljson.site, frame);
  const buildings = bjson.buildings.map(([top, base, name, p]) => ({ top: top / 10, base: base / 10, name: name || null, p: conv(p) }));
  const land = ljson.land.map((l) => ({ name: l.name, p: convL(l.p) }));
  return { source: `${bjson.source}; shoreline: ${ljson.source}`, buildings, land };
}

function converter(fileSite, frame) {
  const same = ['south', 'north', 'west', 'east'].every((k) => Math.abs(fileSite[k] - frameSite(frame)[k]) < 1e-9);
  if (same) return (p) => p.map((v) => v / 10);
  const f0 = makeFrame(fileSite);
  return (p) => {
    const out = new Array(p.length);
    for (let i = 0; i < p.length; i += 2) {
      const [la, lo] = f0.toLatLon(p[i] / 10, p[i + 1] / 10);
      const [x, y] = frame.toXY(la, lo);
      out[i] = x; out[i + 1] = y;
    }
    return out;
  };
}

const frameSite = (frame) => frame.site;
