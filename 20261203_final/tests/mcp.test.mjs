// M1.8: the frostroot-data MCP server. Offline tests always run; the tools that call outside
// services run only with FROSTROOT_NET=1 (and NODE_USE_ENV_PROXY=1 behind a proxy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handle, TOOLS } from '../mcp/server.mjs';
import { connect } from '../mcp/client.mjs';

const NET = process.env.FROSTROOT_NET === '1';

test('handshake: initialize negotiates the protocol and announces tools', async () => {
  const r = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
  assert.equal(r.result.protocolVersion, '2024-11-05');
  assert.equal(r.result.serverInfo.name, 'frostroot-data');
  assert.ok(r.result.capabilities.tools);
  const unknown = await handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(unknown.result.protocolVersion, '2025-06-18');
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal((await handle({ jsonrpc: '2.0', id: 3, method: 'nope' })).error.code, -32601);
});

test('tools/list: the four tools of §13, with names clients accept and JSON schemas', async () => {
  const r = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.deepEqual(r.result.tools.map((t) => t.name), ['weather_series', 'terrain_tile', 'trees_in', 'paths_in']);
  for (const t of TOOLS) { assert.match(t.name, /^[a-zA-Z0-9_-]{1,64}$/); assert.equal(t.inputSchema.type, 'object'); assert.ok(t.description.length > 40); }
});

test('trees_in returns the baked trees inside a bbox; errors come back as tool errors', async () => {
  const r = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'trees_in', arguments: { bbox: [-73.9700, 40.7768, -73.9690, 40.7775] } } });
  assert.equal(r.result.isError, false);
  const data = r.result.structuredContent;
  assert.ok(data.count > 10);
  for (const t of data.trees) assert.ok(t.lon >= -73.97 && t.lon <= -73.969 && t.lat >= 40.7768 && t.lat <= 40.7775 && t.height >= 4);
  assert.deepEqual(JSON.parse(r.result.content[0].text), data);
  const bad = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'trees_in', arguments: { bbox: [1, 2, 0, 3] } } });
  assert.equal(bad.result.isError, true);
  const none = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nope', arguments: {} } });
  assert.equal(none.error.code, -32602);
});

test('over stdio: the client starts the server, lists tools and calls one', async () => {
  const mcp = await connect();
  try {
    assert.equal(mcp.server.name, 'frostroot-data');
    assert.equal((await mcp.listTools()).length, 4);
    const r = await mcp.call('trees_in', { bbox: [-73.9700, 40.7768, -73.9690, 40.7775], limit: 3 });
    assert.equal(r.trees.length, 3);
  } finally { mcp.close(); }
});

test('the baked storm record came through the MCP server', () => {
  const storm = JSON.parse(readFileSync(new URL('../data/baked/storm-2016-01.json', import.meta.url), 'utf8'));
  assert.match(storm.via, /MCP frostroot-data .* weather_series/);
});

test('live: weather_series, terrain_tile and paths_in (FROSTROOT_NET=1)', { skip: !NET && 'set FROSTROOT_NET=1 to call the outside services' }, async () => {
  const mcp = await connect({ env: { NODE_USE_ENV_PROXY: '1' } });
  try {
    const w = await mcp.call('weather_series', { station: 'NYC', start: '2016-01-23T23:00Z', end: '2016-01-24T02:00Z' });
    assert.ok(w.count >= 2 && w.records[0].tempC < 0);
    const b = [-73.9700, 40.7768, -73.9690, 40.7775];
    const t = await mcp.call('terrain_tile', { bbox: b, res: 5 });
    assert.ok(t.z.filter((v) => v != null).every((v) => v > 15 && v < 45));
    const p = await mcp.call('paths_in', { bbox: b });
    assert.ok(p.edges.length > 5 && /OpenStreetMap/.test(p.attribution));
  } finally { mcp.close(); }
});
