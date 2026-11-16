// Writes deck.html (ROADMAP M8.5) from the diagrams index, the gallery and the stories, so the deck
// always shows the current figures and numbers. `npm run deck`; `npm run deck:pdf` prints it to
// docs/frostroot-deck.pdf with Playwright (D-036). Slides are 16:9 sections; arrow keys move between them.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const LIVE = process.env.LIVE_URL ?? 'https://ryan-ram.github.io/spatial_ai_gsapp/20261203_final/';
const REPO = 'https://github.com/Ryan-RAM/spatial_ai_gsapp/tree/main/20261203_final';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const md = read('docs/diagrams/README.md'); const figs = [...md.matchAll(/^## (.+)\n\n!\[[^\]]*\]\(([^)]+)\)\n\n([^\n]*)/gm)].map((m) => ({ title: m[1], file: `docs/diagrams/${m[2]}`, cap: m[3] }));
const G = JSON.parse(read('data/gallery.json')); const S = JSON.parse(read('data/gallery-stories.json'));
const nf = figs.filter((f) => !f.file.endsWith('00-view.png')).length; const F0 = 5; const V1 = F0 + nf; const G0 = V1 + 2;
const pct = (v) => `${Math.round(100 * v)} %`;
const slide = (cls, body) => `<section class="slide ${cls}">${body}</section>`;
const slides = [];
slides.push(slide('title', `<p class="eyebrow">Spatial AI · ARCH6956-1 · Columbia GSAPP · Final project</p><h1>Frostroot<span>:</span> The Ramble</h1><p class="lede">23 January 2016, the night of the record blizzard. Two people are lost in the Ramble; something made of roots is hunting them. Design the park for the storm: who gets out?</p><p class="who">Ryan Fu · Lu Liu · Yifan Zhao — William Martin</p><p class="url">Simulation: <a href="${LIVE}">${LIVE}</a></p>`));
slides.push(slide('img', `<h2>The simulation</h2><img src="docs/diagrams/00-view.png" alt="The live 3D view"><p>Real terrain and 2,427 trees from NYC LiDAR, paths from OpenStreetMap, the hourly weather of that night from the Central Park station. Fog is the observed visibility; warm light is safety.</p>`));
slides.push(slide('check', `<h2>The six deliverables</h2><ol class="checks">
<li><b>The simulation</b> — <a href="${LIVE}">${LIVE}</a> (code: <a href="${REPO}">${REPO}</a>)</li>
<li><b>The semantic model</b> — <a href="${REPO}/semantic_model.md">semantic_model.md</a> (v1.0, consistent with config.js: <code>npm run model:check</code>)</li>
<li><b>Diagrams for each requirement</b> — slides ${F0}–${V1 - 1}, also live at <a href="${LIVE}diagrams.html">diagrams.html</a></li>
<li><b>Video: how to run it and generate environments</b> — slide ${V1} (<a href="${REPO}/docs/video-manual.md">shot list</a>)</li>
<li><b>Video: an environment generated through simulations</b> — slide ${V1 + 1} (<a href="${REPO}/docs/video-demo.md">shot list</a>)</li>
<li><b>Gallery of generated environments</b> — slides ${G0}–${G0 + 3}, and in the page (Gallery → Load this environment)</li></ol>`));
slides.push(slide('text', `<h2>The semantic model, in one slide</h2><ul>
<li><b>Place</b>: 3 m grid of the Ramble (244 × 215 cells), ground cover, LiDAR terrain and trees as solids, a 406-node path graph, 42 named places.</li>
<li><b>Time</b>: the storm clock of 23–24 Jan 2016, hourly observations; snow and drift from them; tracks fill in.</li>
<li><b>Location</b>: W (metres), P (on a path), N (named place), E (egocentric), and each agent's landmark chain.</li>
<li><b>Distance</b>: Euclidean, acoustic (muffled, wind), travel time (Tobler, snow, per kind), perceptual (visibility fingerprints).</li>
<li><b>Agents</b>: survivors and the creature, each with its own map, vision and hearing; plans on what it knows.</li>
<li><b>Design</b>: plowed / closed paths, lamps, shelters, signs within a budget; scored on 24 rounds with common random numbers; manual and (1+1)-ES automatic modes.</li></ul>`));
for (const f of figs.filter((f) => !f.file.endsWith('00-view.png'))) slides.push(slide('fig', `<h2>${esc(f.title)}</h2><img src="${f.file}" alt="${esc(f.title)}: ${esc(f.cap)}">`));
slides.push(slide('video', `<h2>Video 1 — How to run it, and how to generate environments</h2><p class="vid">Video: <span class="todo">link added after recording</span></p><p>2:40, eleven shots: the view and controls, the timeline, the map and its layers, the metrics, manual mode, automatic mode, the gallery, tonight's weather. Shot list: <a href="${REPO}/docs/video-manual.md">docs/video-manual.md</a>.</p>`));
slides.push(slide('video', `<h2>Video 2 — Generating an environment through a series of simulations</h2><p class="vid">Video: <span class="todo">link added after recording</span></p><p>2:50: from the empty park, three manual generations, a jump to Plan B, thirty automatic epochs, the result watched in 3D. Shot list: <a href="${REPO}/docs/video-demo.md">docs/video-demo.md</a>.</p>`));
const envs = S.order.map((id) => G.environments.find((e) => e.id === id));
slides.push(slide('grid', `<h2>Gallery: generated environments</h2><div class="thumbs">${envs.map((e) => `<figure><img src="docs/gallery/${e.id}.png" alt="${esc(e.title)}"><figcaption>${esc(e.title)} · F ${e.metrics.F.toFixed(3)}</figcaption></figure>`).join('')}</div>`));
for (const id of ['plan-b-dark', 'shelters', 'funnel']) { const e = G.environments.find((x) => x.id === id); const m = e.metrics; slides.push(slide('gal', `<h2>${esc(e.title)}</h2><div class="two"><img src="docs/gallery/${id}.png" alt="${esc(e.title)}"><div><p class="nums">Scored on the 24-round suite: escaped ${pct(m.escapeRate)} · caught ${pct(m.catchRate)} · cold ${pct(m.collapseRate)} · lost ${pct(m.lostRate)} · F ${m.F.toFixed(3)} · cost ${Math.round(m.cost)}.</p><p class="nums">In the page: Gallery → “${esc(e.title)}” → Load this environment. Same seed, same numbers.</p></div></div>`)); }
slides.push(slide('text', `<h2>Credits</h2><ul class="small"><li>Map data © OpenStreetMap contributors, ODbL 1.0.</li><li>Terrain and trees: 2017 New York City LiDAR (NOAA Office for Coastal Management / NYC), public domain.</li><li>Weather: KNYC ASOS via the Iowa Environmental Mesonet; tonight mode: NOAA National Weather Service API.</li><li>three.js (MIT). All art, the creature and the interface are original.</li><li>Not emergency advice: a design exercise with tunable defaults, set on a real night in which real people were affected.</li></ul>`));
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Frostroot Deck</title>
<style>
:root { --bg: #0b1020; --fg: #e6ebf5; --muted: #9aa5c0; --warm: #f2a65a; --line: #2a3150; }
* { box-sizing: border-box; } html, body { margin: 0; background: var(--bg); color: var(--fg); font: 18px/1.45 system-ui, sans-serif; }
a { color: var(--warm); } code { font-size: .9em; }
.slide { width: min(100vw, 177.78vh); height: min(56.25vw, 100vh); margin: 0 auto; padding: 3.2% 4.5%; display: flex; flex-direction: column; gap: 1.2vh; overflow: hidden; border-bottom: 1px solid var(--line); scroll-snap-align: start; }
html { scroll-snap-type: y mandatory; }
h1 { font-size: 4.2em; margin: auto 0 0; letter-spacing: -.02em; } h1 span { color: var(--warm); }
h2 { font-size: 1.7em; margin: 0; } .eyebrow, .who { color: var(--muted); } .lede { font-size: 1.3em; max-width: 46em; } .url { margin-bottom: auto; font-size: 1.2em; }
.slide img { max-width: 100%; min-height: 0; flex: 1 1 auto; object-fit: contain; object-position: left top; border-radius: 6px; }
.cap, .nums { color: var(--muted); font-size: .9em; margin: 0; }
.checks li { margin: .5em 0; font-size: 1.1em; } ul li { margin: .4em 0; } .small li { font-size: .95em; }
.thumbs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; min-height: 0; } .thumbs figure { margin: 0; } .thumbs img { width: 100%; } .thumbs figcaption { font-size: .7em; color: var(--muted); }
.two { display: grid; grid-template-columns: 1.1fr 1fr; gap: 24px; min-height: 0; flex: 1; } .two img { width: 100%; }
.vid { font-size: 1.3em; } .todo { color: var(--warm); }
@page { size: 13.333in 7.5in; margin: 0; }
@media print { html { scroll-snap-type: none; } .slide { width: 13.333in; height: 7.5in; page-break-after: always; border: 0; } body { font-size: 15px; } }
</style></head><body>
${slides.join('\n')}
<script>addEventListener('keydown', (e) => { const s = [...document.querySelectorAll('.slide')]; const i = s.findIndex((x) => x.getBoundingClientRect().top > -10); const k = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 }[e.key]; if (k) { e.preventDefault(); s[Math.max(0, Math.min(s.length - 1, i + k))].scrollIntoView(); } });</script>
</body></html>
`;
writeFileSync(new URL('deck.html', root), html);
console.log(`deck.html: ${slides.length} slides${existsSync(new URL('docs/gallery/plan-b.png', root)) ? '' : ' (gallery images missing: run npm run diagrams)'}`);
