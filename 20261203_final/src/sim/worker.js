// A Web Worker that evaluates one night of the suite at a time (ROADMAP M6.2). It loads the baked
// world once (the same loader as the page), then answers { id, plan, night } with { id, night }.
// Runs the simulation only: no DOM, no three.js.

import { loadWorldWith } from './load.js';
import { makeStorm } from './storm.js';
import { evaluateNight } from './evaluate.js';

let ready = null;
self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    const base = new URL(msg.base);
    ready = (async () => {
      const world = await loadWorldWith(async (f) => (await fetch(new URL(f, base))).json(), async (f) => new Uint8Array(await (await fetch(new URL(f, base))).arrayBuffer()));
      const storm = makeStorm(await (await fetch(new URL('storm-2016-01.json', base))).json());
      return { world, storm };
    })();
    await ready; self.postMessage({ type: 'ready' }); return;
  }
  if (msg.type === 'night') {
    const { world, storm } = await ready;
    const t = performance.now();
    const night = evaluateNight(world, storm, msg.plan, msg.night);
    self.postMessage({ type: 'night', id: msg.id, night, ms: performance.now() - t });
  }
};
