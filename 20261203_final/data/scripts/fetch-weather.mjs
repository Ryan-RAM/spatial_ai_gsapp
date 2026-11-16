// Downloads the hourly KNYC record of the January 2016 blizzard (semantic model §16) through the
// frostroot-data MCP server (tool weather_series), into data/raw/weather/. This is the data path
// of the secondary function: KNYC -> IEM archive -> MCP -> data/raw -> bake.
// Run: npm run fetch:weather

import { mkdirSync, writeFileSync } from 'node:fs';
import { connect } from '../../mcp/client.mjs';

export const STORM = { station: 'NYC', start: '2016-01-22T12:00Z', end: '2016-01-24T12:00Z', file: 'knyc-2016-01.json' };
const out = new URL('../raw/weather/', import.meta.url);
mkdirSync(out, { recursive: true });
const mcp = await connect({ env: { NODE_USE_ENV_PROXY: '1' } });
try {
  const data = await mcp.call('weather_series', { station: STORM.station, start: STORM.start, end: STORM.end });
  writeFileSync(new URL(STORM.file, out), JSON.stringify({ via: `MCP ${mcp.server.name} ${mcp.server.version}, tool weather_series`, ...data }, null, 1) + '\n');
  console.log(`${STORM.file}: ${data.count} observations via MCP (${mcp.server.name}, protocol ${mcp.protocolVersion})`);
} finally { mcp.close(); }
