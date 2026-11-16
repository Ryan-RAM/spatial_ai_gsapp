// What the model takes from OpenStreetMap (semantic model §3, §16): the footpath graph (frame P),
// the area features that set the ground cover, and the named places (frame N). All geometry comes
// out in metres of frame W. Shared by data/scripts/bake-osm.mjs and the MCP server (paths.in).
// Data © OpenStreetMap contributors, ODbL 1.0.

import { assembleRings, pointInRings } from './raster.js';

// ------------------------------------------------------------------ classification

const WALKWAYS = new Set(['footway', 'path', 'steps', 'pedestrian', 'service', 'bridleway', 'cycleway', 'track', 'living_street']);
const PAVED = new Set(['asphalt', 'paved', 'concrete', 'concrete:plates', 'paving_stones', 'sett', 'wood', 'stone', 'rubber', 'metal']);
// width in metres when the way has no width tag
const DEFAULT_WIDTH = { footway: 3, path: 2, steps: 3, pedestrian: 8, service: 4, bridleway: 3, cycleway: 3, track: 3, living_street: 6 };

export const isWalkway = (t) => WALKWAYS.has(t.highway) && !t.tunnel && !(+t.layer < 0) && t.area !== 'yes' && t.access !== 'private';
export const isBridge = (t) => !!t.bridge && t.bridge !== 'no';
export const surfaceOf = (t) => (!t.surface || PAVED.has(t.surface) ? 'paved' : 'dirt');
export const widthOf = (t) => {
  const w = parseFloat(t.width);
  return Number.isFinite(w) && w > 0 && w < 30 ? w : DEFAULT_WIDTH[t.highway] ?? 3;
};
// A road that is not in a tunnel: a barrier on foot, crossed only by bridges. The transverses run
// in cuttings below the park (tagged layer=-1 without tunnel=*) between retaining walls.
export const isRoadBarrier = (t) => ['secondary', 'primary', 'tertiary', 'residential', 'trunk'].includes(t.highway) && !t.tunnel && !isBridge(t);

// ------------------------------------------------------------------ geometry helpers

export function project(osm, enu) {
  const xy = new Map();
  for (const n of osm.nodes.values()) xy.set(n.id, enu.toEnu(n.lat, n.lon, 0).slice(0, 2));
  return (id) => xy.get(id);
}

const ringsOfWay = (way, xy) => (way.nds.length >= 4 && way.nds[0] === way.nds[way.nds.length - 1]
  ? [way.nds.map(xy).filter(Boolean)] : []);

function ringsOfRelation(osm, rel, xy) {
  const segs = rel.members.filter((m) => m.type === 'way' && osm.ways.has(m.ref)).map((m) => osm.ways.get(m.ref).nds);
  return assembleRings(segs).map((r) => r.map(xy).filter(Boolean));
}

// Every area feature with its rings in metres: [{ tags, rings, name }]
export function areas(osm, xy, match) {
  const out = [];
  for (const w of osm.ways.values()) if (match(w.tags)) { const rings = ringsOfWay(w, xy); if (rings.length) out.push({ id: `w${w.id}`, tags: w.tags, rings }); }
  for (const r of osm.relations.values()) if (r.tags.type === 'multipolygon' && match(r.tags)) {
    const rings = ringsOfRelation(osm, r, xy); if (rings.length) out.push({ id: `r${r.id}`, tags: r.tags, rings });
  }
  return out;
}

export const lines = (osm, xy, match) => [...osm.ways.values()].filter((w) => match(w.tags))
  .map((w) => ({ id: `w${w.id}`, tags: w.tags, nds: w.nds, pts: w.nds.map(xy).filter(Boolean) }));

// The park polygon (Central Park, leisure=park): the study area is the bbox ∩ the park.
export function parkRings(osm, xy) {
  const park = areas(osm, xy, (t) => t.leisure === 'park' && t.name === 'Central Park');
  if (!park.length) throw new Error('Central Park polygon not found in the OSM data');
  return park[0].rings;
}

// ------------------------------------------------------------------ the path graph (frame P)

// Builds the walkable graph from the walkway ways, keeping the parts inside `keep(x, y)`.
// Nodes: junctions (shared by 2+ ways, or where a way ends) and the points where a way leaves the
// kept region. Edges: the way pieces between them, with length, surface, width, bridge, steps, lit
// and their polyline. Returns { nodes: [{id, osm, x, y, degree}], edges: [{id, a, b, ...}] }.
export function pathGraph(osm, xy, keep) {
  const ways = lines(osm, xy, isWalkway);
  const uses = new Map();
  for (const w of ways) w.nds.forEach((id, k) => {
    const end = k === 0 || k === w.nds.length - 1;
    uses.set(id, (uses.get(id) ?? 0) + (end ? 2 : 1));
  });
  const nodeIndex = new Map(); const nodes = [];
  const nodeOf = (osmId) => {
    if (!nodeIndex.has(osmId)) {
      const [x, y] = xy(osmId);
      nodeIndex.set(osmId, nodes.length);
      nodes.push({ id: nodes.length, osm: osmId, x: +x.toFixed(2), y: +y.toFixed(2), degree: 0 });
    }
    return nodeIndex.get(osmId);
  };
  const edges = [];
  for (const w of ways) {
    let piece = [];
    const flush = () => {
      if (piece.length >= 2) {
        const pts = piece.map(xy);
        let len = 0;
        for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
        if (len > 0.01) {
          const a = nodeOf(piece[0]); const b = nodeOf(piece[piece.length - 1]);
          nodes[a].degree++; nodes[b].degree++;
          edges.push({
            id: edges.length, a, b, way: w.id, name: w.tags.name ?? null,
            kind: w.tags.highway, len: +len.toFixed(2), surface: surfaceOf(w.tags), width: widthOf(w.tags),
            bridge: isBridge(w.tags), steps: w.tags.highway === 'steps', lit: w.tags.lit === 'yes',
            pts: pts.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]),
          });
        }
      }
      piece = [];
    };
    for (let k = 0; k < w.nds.length; k++) {
      const id = w.nds[k]; const p = xy(id);
      if (!p || !keep(p[0], p[1])) { flush(); continue; }
      piece.push(id);
      if (k > 0 && k < w.nds.length - 1 && uses.get(id) > 1) { flush(); piece.push(id); }
    }
    flush();
  }
  return { nodes, edges };
}

// Connected components of the graph (union-find), largest first: [[nodeId, ...], ...]
export function components(graph) {
  const parent = graph.nodes.map((n) => n.id);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (const e of graph.edges) parent[find(e.a)] = find(e.b);
  const groups = new Map();
  for (const n of graph.nodes) { const r = find(n.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(n.id); }
  return [...groups.values()].sort((p, q) => q.length - p.length);
}

// ------------------------------------------------------------------ named places (frame N)

const PLACE_KINDS = [
  ['castle', (t) => t.historic === 'castle'],
  ['peak', (t) => t.natural === 'peak'],
  ['water', (t) => t.natural === 'water' || t.natural === 'bay' || t.waterway === 'stream'],
  ['bridge', (t) => isBridge(t) || t.man_made === 'bridge'],
  ['arch', (t) => /Arch$/.test(t.name ?? '')],
  ['building', (t) => !!t.building],
  ['garden', (t) => t.leisure === 'garden' || t.leisure === 'playground'],
  ['hill', (t) => /Hill$/.test(t.name ?? '')],
  ['woods', (t) => t.natural === 'yes' || t.natural === 'wood' || t.natural === 'peninsula'],
  ['monument', (t) => t.historic === 'monument' || t.historic === 'memorial' || t.tourism === 'artwork'],
  ['drive', (t) => /Drive$|Walk$/.test(t.name ?? '')],
  ['landing', (t) => t.leisure === 'slipway' || t.waterway === 'access_point'],
];
const slug = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Named features inside `keep`, one entry per name (parts of one feature, e.g. the two halves of
// a bridge, are merged into their mean position). Tall features are flagged: seen from afar.
export function namedPlaces(osm, xy, keep) {
  const byName = new Map();
  const add = (tags, pts) => {
    const name = tags.name; if (!name) return;
    if (/Street|Avenue|Transverse|Outer Loop|Citi Bike|USPS|Link NYC|Café|Bar|Dining|Eatery/.test(name)) return;
    const kind = PLACE_KINDS.find(([, f]) => f(tags))?.[0]; if (!kind) return;
    const inside = pts.filter(([x, y]) => keep(x, y)); if (!inside.length) return;
    const e = byName.get(name) ?? { name, kind, sx: 0, sy: 0, n: 0, tall: false, ele: null };
    for (const [x, y] of inside) { e.sx += x; e.sy += y; e.n++; }
    if (kind === 'castle' || +tags.height > 15) e.tall = true;
    if (tags.ele) e.ele = +tags.ele;
    byName.set(name, e);
  };
  for (const n of osm.nodes.values()) if (n.tags.name) { const p = xy(n.id); if (p) add(n.tags, [p]); }
  for (const w of osm.ways.values()) if (w.tags.name) add(w.tags, w.nds.map(xy).filter(Boolean));
  for (const r of osm.relations.values()) if (r.tags.name && r.tags.type === 'multipolygon') {
    const pts = r.members.filter((m) => m.type === 'way' && osm.ways.has(m.ref)).flatMap((m) => osm.ways.get(m.ref).nds.map(xy).filter(Boolean));
    add(r.tags, pts);
  }
  return [...byName.values()].map((e) => ({
    id: slug(e.name), name: e.name, kind: e.kind,
    x: +(e.sx / e.n).toFixed(1), y: +(e.sy / e.n).toFixed(1), tall: e.tall, ...(e.ele != null ? { ele: e.ele } : {}),
  })).sort((a, b) => a.id.localeCompare(b.id));
}

export { pointInRings };
