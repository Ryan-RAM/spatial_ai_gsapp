// OpenStreetMap access (D-011): the official API's map call, and a parser for the OSM XML it
// returns. The XML is machine-written and regular (one element per line, attributes in double
// quotes), so a small scanner is enough; no dependency.
// Data © OpenStreetMap contributors, ODbL 1.0.

import { get } from './http.js';

export const OSM_API = 'https://api.openstreetmap.org/api/0.6/map';

// bbox in degrees: [minLon, minLat, maxLon, maxLat]
export const fetchOsmXml = (bbox) => get(`${OSM_API}?bbox=${bbox.join(',')}`);

const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function attrs(s) {
  const out = {};
  for (const m of s.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = unescape(m[2]);
  return out;
}

// Returns { nodes: Map(id -> {id, lat, lon, tags}), ways: Map(id -> {id, nds: [ids], tags}),
//           relations: Map(id -> {id, members: [{type, ref, role}], tags}) }
export function parseOsmXml(xml) {
  const nodes = new Map(); const ways = new Map(); const relations = new Map();
  let cur = null;
  for (const m of xml.matchAll(/<(\/?)(node|way|relation|tag|nd|member)\b([^>]*?)(\/?)>/g)) {
    const [, close, el, body, selfClose] = m;
    if (close) { cur = null; continue; }
    const a = attrs(body);
    if (el === 'node') {
      const n = { id: +a.id, lat: +a.lat, lon: +a.lon, tags: {} };
      nodes.set(n.id, n); cur = selfClose ? null : n;
    } else if (el === 'way') {
      const w = { id: +a.id, nds: [], tags: {} };
      ways.set(w.id, w); cur = selfClose ? null : w;
    } else if (el === 'relation') {
      const r = { id: +a.id, members: [], tags: {} };
      relations.set(r.id, r); cur = selfClose ? null : r;
    } else if (cur) {
      if (el === 'tag') cur.tags[a.k] = a.v;
      else if (el === 'nd') cur.nds.push(+a.ref);
      else if (el === 'member') cur.members.push({ type: a.type, ref: +a.ref, role: a.role });
    }
  }
  return { nodes, ways, relations };
}

// The coordinates of a way, as [[lon, lat], ...]; skips nodes outside the downloaded data.
export function wayCoords(osm, way) {
  const out = [];
  for (const id of way.nds) { const n = osm.nodes.get(id); if (n) out.push([n.lon, n.lat]); }
  return out;
}
