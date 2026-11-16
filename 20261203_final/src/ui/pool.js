// A pool of Web Workers that evaluates plans (ROADMAP M6.2): hardwareConcurrency - 1 workers, each
// with its own copy of the world; a plan's suite is split into its nights and spread over them.
// The page stays responsive: the main thread only aggregates.

import { CONFIG } from '../sim/config.js';
import { suiteNights } from '../sim/evaluate.js';
import { aggregate } from '../sim/score.js';

export async function makePool(world, { base, size = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)) } = {}) {
  const workers = await Promise.all(Array.from({ length: size }, () => new Promise((res) => {
    const w = new Worker(new URL('../sim/worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { if (e.data.type === 'ready') res(w); };
    w.postMessage({ type: 'init', base: String(base) });
  })));
  const idle = [...workers]; const queue = []; const pending = new Map(); let nextId = 1;
  workers.forEach((w) => { w.onmessage = (e) => { const { id, night } = e.data; pending.get(id)(night); pending.delete(id); idle.push(w); pump(); }; });
  function pump() { while (idle.length && queue.length) { const w = idle.pop(); const job = queue.shift(); pending.set(job.id, job.resolve); w.postMessage({ type: 'night', id: job.id, plan: job.plan, night: job.night }); } }
  const runNight = (plan, night) => new Promise((resolve) => { queue.push({ id: nextId++, plan, night, resolve }); pump(); });
  return {
    size,
    async evaluate(plan, config = CONFIG) {
      const t = performance.now();
      const nights = await Promise.all(suiteNights(config).map((n) => runNight(plan, n)));
      return { nights, metrics: aggregate(nights, config, { world, plan }), ms: performance.now() - t };
    },
    terminate: () => workers.forEach((w) => w.terminate()),
  };
}
