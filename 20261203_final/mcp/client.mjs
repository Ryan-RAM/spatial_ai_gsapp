// A minimal MCP client over stdio: starts the frostroot-data server as a child process, does the
// initialize handshake, and calls tools. Used by data/scripts/fetch-weather.mjs and the tests.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export async function connect({ env = {} } = {}) {
  const child = spawn(process.execPath, ['--disable-warning=UNDICI-EHPA', new URL('./server.mjs', import.meta.url).pathname], {
    stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, ...env },
  });
  const pending = new Map(); let nextId = 1;
  createInterface({ input: child.stdout }).on('line', (line) => {
    const msg = JSON.parse(line); const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++; pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'frostroot-bake', version: '0.1.0' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  return {
    server: init.serverInfo, protocolVersion: init.protocolVersion,
    listTools: async () => (await request('tools/list', {})).tools,
    async call(name, args) {
      const r = await request('tools/call', { name, arguments: args });
      if (r.isError) throw new Error(r.content?.[0]?.text ?? 'tool error');
      return r.structuredContent ?? JSON.parse(r.content[0].text);
    },
    close: () => { child.stdin.end(); child.kill(); },
  };
}
