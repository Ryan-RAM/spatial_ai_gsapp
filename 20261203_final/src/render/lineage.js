// The lineage tree (ROADMAP M6.5): every plan tried, linked to its parent, with its score and a
// thumbnail of its interventions on the map. Click a node to go back to that plan.
import { pointOnEdge } from '../sim/interventions.js';

// a small picture of a plan: the paths, plowed (light) and closed (red), lamps and shelters (warm)
export function thumbnail(world, plan, size = 64) {
  const c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true'); c.width = size; c.height = Math.round(size * world.H / world.W); // decorative: the node's text says it
  const g = c.getContext('2d'); const sx = size / (world.maxX - world.minX); const sy = c.height / (world.maxY - world.minY);
  const P = (x, y) => [(x - world.minX) * sx, (world.maxY - y) * sy];
  g.fillStyle = '#121729'; g.fillRect(0, 0, c.width, c.height);
  const edge = (e, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); world.paths.edges[e].pts.forEach(([x, y], q) => { const [a, b] = P(x, y); q ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); };
  world.paths.edges.forEach((e) => edge(e.id, 'rgba(160,170,200,0.35)', 0.6));
  plan.plowed.forEach((e) => edge(e, '#e8f0ff', 1.8)); plan.closed.forEach((e) => edge(e, '#e0605a', 1.8));
  g.fillStyle = '#f2a65a';
  plan.lamps.forEach((l) => { const [a, b] = P(...pointOnEdge(world, l.edge, l.s)); g.fillRect(a - 1.5, b - 1.5, 3, 3); });
  plan.shelters.forEach((nd) => { const n = world.paths.nodes[nd]; const [a, b] = P(n.x, n.y); g.fillRect(a - 3, b - 3, 6, 6); });
  return c;
}

// nodes: [{ id, parent, score, mode, label }]; a top-down tree, by depth
export function renderLineage(container, world, nodes, { current, onPick }) {
  container.innerHTML = '';
  const byParent = new Map(); for (const n of nodes) { if (!byParent.has(n.parent)) byParent.set(n.parent, []); byParent.get(n.parent).push(n); }
  const list = document.createElement('ul'); list.className = 'tree';
  const add = (parentEl, id) => {
    for (const n of byParent.get(id) ?? []) {
      const li = document.createElement('li');
      const b = document.createElement('button'); b.type = 'button'; b.className = `node${n.id === current ? ' current' : ''}${n.kept === false ? ' dropped' : ''}`;
      b.title = n.label ?? ''; b.setAttribute('aria-label', `Plan ${n.id}: ${n.label ?? ''}, score ${n.score == null ? 'not yet' : n.score.toFixed(3)}`);
      b.append(thumbnail(world, n.plan));
      const t = document.createElement('span'); t.textContent = `#${n.id} ${n.score == null ? '…' : n.score.toFixed(3)}`; b.append(t);
      b.addEventListener('click', () => onPick(n));
      li.append(b);
      if (byParent.has(n.id)) { const ul = document.createElement('ul'); add(ul, n.id); li.append(ul); }
      parentEl.append(li);
    }
  };
  add(list, null); container.append(list);
}
