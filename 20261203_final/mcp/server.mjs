#!/usr/bin/env node
// frostroot-data: an MCP server (Model Context Protocol, stdio transport) for the real-world data of
// Frostroot: The Ramble (semantic model §13, ROADMAP M1.8). It uses the same data-access code as
// the bake scripts (src/data/). Tools:
//   weather_series  hourly ASOS observations of a station (Iowa Environmental Mesonet), SI units
//   terrain_tile    bare-earth elevations from the 2017 NYC LiDAR DEM (NOAA COG, range requests)
//   trees_in        individual trees (from the baked 2017 LiDAR extraction) inside a bbox
//   paths_in        the OpenStreetMap footpath graph inside a bbox
// Run: node --disable-warning=UNDICI-EHPA mcp/server.mjs (with NODE_USE_ENV_PROXY=1 behind a proxy).
// JSON-RPC 2.0, one message per line on stdin/stdout; logs go to stderr.

import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { fetchAsosCsv, parseAsosCsv } from '../src/data/weather.js';
import { openGeoTiff, httpRangeReader, readWindow } from '../src/data/geotiff.js';
import { toStatePlane, fromStatePlane, FT_US } from '../src/data/stateplane.js';
import { DEM_URL } from '../src/data/sources.js';
import { fetchOsmXml, parseOsmXml } from '../src/data/osm.js';
import { project, pathGraph } from '../src/data/osm-features.js';
import { makeEnu } from '../src/data/geo.js';
import { CONFIG } from '../src/sim/config.js';

export const SERVER = { name: 'frostroot-data', version: '0.1.0' };
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const enu = makeEnu(CONFIG.origin.lat, CONFIG.origin.lon, 0);

const bboxSchema = {
  type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4,
  description: '[minLon, minLat, maxLon, maxLat] in degrees (WGS84)',
};

export const TOOLS = [
  {
    name: 'weather_series',
    description: 'Hourly observations of an ASOS station from the Iowa Environmental Mesonet archive, in SI units (°C, m/s, m, mm), with NWS wind chill. Times are local wall-clock time of America/New_York. Use station "NYC" for Central Park (KNYC).',
    inputSchema: {
      type: 'object', required: ['station', 'start', 'end'],
      properties: {
        station: { type: 'string', description: 'ASOS identifier without the leading K, e.g. "NYC"' },
        start: { type: 'string', description: 'UTC start, ISO 8601, e.g. "2016-01-22T12:00Z"' },
        end: { type: 'string', description: 'UTC end, ISO 8601' },
      },
    },
  },
  {
    name: 'terrain_tile',
    description: 'Bare-earth ground elevations (m, NAVD88) from the 2017 New York City topobathymetric LiDAR DEM (NOAA Digital Coast), averaged onto a grid of the given resolution. Covers the tile around Central Park (be_NYC_025). At most 250 x 250 cells.',
    inputSchema: {
      type: 'object', required: ['bbox'],
      properties: { bbox: bboxSchema, res: { type: 'number', description: 'cell size in metres (default 3)', minimum: 1 } },
    },
  },
  {
    name: 'trees_in',
    description: 'Individual trees inside a bbox, extracted from the 2017 NYC LiDAR point cloud for this project (position, ground elevation, height, crown radius, trunk radius, evergreen estimate). Covers the study area of the Ramble only.',
    inputSchema: { type: 'object', required: ['bbox'], properties: { bbox: bboxSchema, limit: { type: 'integer', minimum: 1, description: 'at most this many trees (default 2000)' } } },
  },
  {
    name: 'paths_in',
    description: 'The walkable footpath graph from OpenStreetMap inside a bbox (at most 0.0025 square degrees): junction nodes and path edges with length, surface, width, bridge, steps and lit. Coordinates in WGS84 and in metres east/north of the KNYC station. Data © OpenStreetMap contributors, ODbL.',
    inputSchema: { type: 'object', required: ['bbox'], properties: { bbox: bboxSchema } },
  },
];

const checkBbox = (b) => {
  if (!Array.isArray(b) || b.length !== 4 || b.some((v) => typeof v !== 'number') || b[0] >= b[2] || b[1] >= b[3]) throw new Error('bbox must be [minLon, minLat, maxLon, maxLat] with min < max');
};

export const HANDLERS = {
  async weather_series({ station, start, end }) {
    const records = parseAsosCsv(await fetchAsosCsv(station, start, end));
    return { station, start, end, source: 'Iowa Environmental Mesonet ASOS archive', count: records.length, records };
  },
  async terrain_tile({ bbox, res = 3 }) {
    checkBbox(bbox);
    const tif = await openGeoTiff(httpRangeReader(DEM_URL));
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const local = enu;
    const [x0, y0] = local.toEnu(minLat, minLon, 0); const [x1, y1] = local.toEnu(maxLat, maxLon, 0);
    const W = Math.ceil((x1 - x0) / res); const H = Math.ceil((y1 - y0) / res);
    if (W * H > 62500) throw new Error(`${W} x ${H} cells: at most 250 x 250, use a smaller bbox or a larger res`);
    const corners = [[minLat, minLon], [maxLat, maxLon], [minLat, maxLon], [maxLat, minLon]].map(([la, lo]) => tif.toPixel(...toStatePlane(la, lo)));
    const c0 = Math.floor(Math.min(...corners.map((c) => c[0]))); const c1 = Math.ceil(Math.max(...corners.map((c) => c[0]))) + 1;
    const r0 = Math.floor(Math.min(...corners.map((c) => c[1]))); const r1 = Math.ceil(Math.max(...corners.map((c) => c[1]))) + 1;
    if (c0 < 0 || r0 < 0 || c1 > tif.width || r1 > tif.height) throw new Error('bbox is outside the DEM tile be_NYC_025 (lon -74.018..-73.943, lat 40.716..40.784)');
    const win = await readWindow(tif, c0, r0, c1, r1);
    const sum = new Float64Array(W * H); const cnt = new Uint32Array(W * H);
    // pixel -> local metres: affine over the window (exact at three corners; the projection is
    // affine to millimetres over a few hundred metres)
    const ex = (c, r) => local.toEnu(...fromStatePlane(...tif.toProjected(c, r)), 0);
    const p00 = ex(c0, r0); const p10 = ex(c1, r0); const p01 = ex(c0, r1);
    const ax = [(p10[0] - p00[0]) / (c1 - c0), (p01[0] - p00[0]) / (r1 - r0)]; const ay = [(p10[1] - p00[1]) / (c1 - c0), (p01[1] - p00[1]) / (r1 - r0)];
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
      const v = win[(r - r0) * (c1 - c0) + (c - c0)]; if (!Number.isFinite(v)) continue;
      const x = p00[0] + ax[0] * (c - c0) + ax[1] * (r - r0); const y = p00[1] + ay[0] * (c - c0) + ay[1] * (r - r0);
      const i = Math.floor((x - x0) / res); const j = Math.floor((y1 - y) / res);
      if (i < 0 || j < 0 || i >= W || j >= H) continue;
      sum[j * W + i] += v * FT_US; cnt[j * W + i]++;
    }
    const z = Array.from(sum, (s, k) => (cnt[k] ? +(s / cnt[k]).toFixed(2) : null));
    return { bbox, res, W, H, layout: 'row 0 is the north edge; z[j * W + i]', units: 'm NAVD88', source: 'NYC 2017 topobathymetric LiDAR, bare-earth DEM (NOAA Digital Coast)', z };
  },
  async trees_in({ bbox, limit = 2000 }) {
    checkBbox(bbox);
    const dir = new URL('../data/baked/', import.meta.url);
    const meta = JSON.parse(readFileSync(new URL('trees.json', dir), 'utf8'));
    const buf = new Uint8Array(readFileSync(new URL('trees.bin', dir)));
    const f = new Float32Array(buf.buffer, buf.byteOffset, meta.count * 6); const ev = buf.subarray(meta.count * 24);
    const out = [];
    for (let t = 0; t < meta.count && out.length < limit; t++) {
      const [x, y, z, h, cr, tr] = f.subarray(t * 6, t * 6 + 6);
      const [lat, lon] = enu.fromEnu(x, y, 0);
      if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
      out.push({ lat: +lat.toFixed(7), lon: +lon.toFixed(7), x: +x.toFixed(2), y: +y.toFixed(2), groundZ: +z.toFixed(2), height: +h.toFixed(2), crownRadius: +cr.toFixed(2), trunkRadius: +tr.toFixed(3), evergreen: !!ev[t] });
    }
    return { bbox, count: out.length, source: meta.source, method: meta.method, trees: out };
  },
  async paths_in({ bbox }) {
    checkBbox(bbox);
    if ((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > 0.0025) throw new Error('bbox too large: at most 0.0025 square degrees');
    const osm = parseOsmXml(await fetchOsmXml(bbox));
    const xy = project(osm, enu);
    const inside = (x, y) => { const [la, lo] = enu.fromEnu(x, y, 0); return lo >= bbox[0] && lo <= bbox[2] && la >= bbox[1] && la <= bbox[3]; };
    const g = pathGraph(osm, xy, inside);
    const ll = (x, y) => { const [la, lo] = enu.fromEnu(x, y, 0); return [+lo.toFixed(7), +la.toFixed(7)]; };
    return {
      bbox, attribution: 'Data © OpenStreetMap contributors, ODbL 1.0', frame: 'x, y: metres east and north of the KNYC station',
      nodes: g.nodes.map((nd) => ({ id: nd.id, osm: nd.osm, lonlat: ll(nd.x, nd.y), x: nd.x, y: nd.y, degree: nd.degree })),
      edges: g.edges.map(({ pts, ...e }) => ({ ...e, lonlat: pts.map(([x, y]) => ll(x, y)) })),
    };
  },
};

// ------------------------------------------------------------------ JSON-RPC over stdio

export async function handle(msg) {
  const { id, method, params = {} } = msg;
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  switch (method) {
    case 'initialize': {
      const protocolVersion = PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0];
      return reply({ protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: 'Real-world data for Frostroot: The Ramble (Central Park, January 2016 blizzard).' });
    }
    case 'notifications/initialized': case 'notifications/cancelled': return null;
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS });
    case 'tools/call': {
      const h = HANDLERS[params.name];
      if (!h) return fail(-32602, `unknown tool ${params.name}`);
      try {
        const data = await h(params.arguments ?? {});
        return reply({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: false });
      } catch (e) {
        return reply({ content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
      }
    }
    default:
      return id === undefined ? null : fail(-32601, `method not found: ${method}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rl = createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }) + '\n'); return; }
    const out = await handle(msg);
    if (out) process.stdout.write(JSON.stringify(out) + '\n');
  });
  process.stderr.write(`${SERVER.name} ${SERVER.version} ready on stdio\n`);
}
