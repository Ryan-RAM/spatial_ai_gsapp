// HTTP for the data scripts and the MCP server. Node's fetch goes through the environment's
// proxy only when started with NODE_USE_ENV_PROXY=1 (set by the npm scripts). A generic client
// name is sent as the User-Agent: no personal details go to outside services.

export const USER_AGENT = 'frostroot-data/0.1 (course project)';

export async function get(url, { as = 'text', retries = 3, headers = {}, range = null } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const h = { 'User-Agent': USER_AGENT, ...headers };
      if (range) h.Range = `bytes=${range[0]}-${range[1]}`;
      const res = await fetch(url, { headers: h });
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status} for ${url}`);
      if (as === 'json') return await res.json();
      if (as === 'bytes') return new Uint8Array(await res.arrayBuffer());
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastErr;
}
