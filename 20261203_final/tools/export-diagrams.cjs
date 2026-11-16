// Re-generates docs/diagrams/ (ROADMAP M8.1): every figure of diagrams.html as a 2x PNG, plus the
// manual and automatic modes captured from the main page, and docs/diagrams/README.md with the
// one-line captions. Needs a static server on the folder and Playwright with Chromium (D-036):
//   npm run serve            (in another terminal)
//   npm run diagrams         (BASE=http://localhost:8765/ by default)
// Playwright is not a dependency of the project: install it once with `npx playwright install chromium`
// or point NODE_PATH at a global install.
const path = require('node:path'); const fs = require('node:fs');
let chromium; try { ({ chromium } = require('playwright')); } catch { console.error('Playwright not found: npm i -g playwright && npx playwright install chromium'); process.exit(1); }
const BASE = process.env.BASE ?? 'http://localhost:8765/';
const OUT = path.join(__dirname, '..', 'docs', 'diagrams');
const NAMES = { '01': 'baseline', '02': 'frames', '03': 'distances', '04': 'knowledge', '05': 'landmarks', '06': 'metrics', '07': 'planning', '08': 'vision', '09': 'bridge', '10': 'snow', '11': 'obstacles', '12': 'two-sided', '15': 'data' };
// a capture of one element without waiting for it to be "stable" (the live view and the
// side-by-side rounds keep animating, which starves Playwright's stability check under SwiftShader)
async function shot(page, target, file) {
  const el = typeof target === 'string' ? page.locator(target) : target;
  await el.evaluate((e) => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(2500); // let the 3D view stop drawing once off screen
  const clip = await el.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: Math.max(0, r.y), width: r.width, height: Math.min(r.height, innerHeight - Math.max(0, r.y)) }; });
  await page.screenshot({ path: file, clip, timeout: 120000 });
}
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: GL }); const errors = [];
  const page = async (url) => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 1500 }, deviceScaleFactor: 2 });
    p.on('pageerror', (e) => errors.push(`${url}: ${e}`)); p.on('console', (m) => { if (m.type() === 'error') errors.push(`${url}: ${m.text()}`); });
    await p.addInitScript(() => { try { localStorage.setItem('frostroot-intro', '1'); } catch {} });
    await p.goto(BASE + url); return p;
  };
  const index = [];
  // the figures drawn from the simulation
  const d = await page('diagrams.html');
  await d.waitForSelector('body[data-ready="1"]', { timeout: 180000 });
  for (const [id, name] of Object.entries(NAMES)) {
    const f = d.locator(`figure[data-d="${id}"]`); const file = `${id}-${name}.png`;
    await shot(d, f, path.join(OUT, file));
    const title = (await f.locator('h2').innerText()).trim(); const cap = (await f.locator('figcaption').innerText().catch(() => '')).trim();
    index.push({ id, file, title, cap }); console.log('wrote', file);
  }
  await d.close();
  // manual mode: two generations of side-by-side choices
  const m = await page('index.html');
  await m.waitForFunction(() => /scored/.test(document.getElementById('designStatus').textContent), null, { timeout: 120000 });
  for (let g = 0; g < 2; g++) {
    await m.click('#vary');
    await m.waitForFunction(() => /choose one/.test(document.getElementById('designStatus').textContent), null, { timeout: 120000 });
    if (g === 0) await m.click('#pickA');
  }
  await shot(m, '#design', path.join(OUT, '13-manual.png'));
  index.push({ id: '13', file: '13-manual.png', title: '13. Manual mode: side by side, and the lineage', cap: 'Two variations of the parent plan play the same round side by side and are scored on the 24-round suite; the chosen one becomes the parent. Every plan tried is in the lineage tree.' });
  await m.close();
  // automatic mode: 12 epochs from Plan B
  const a = await page('index.html');
  await a.waitForFunction(() => /scored/.test(document.getElementById('designStatus').textContent), null, { timeout: 120000 });
  await a.selectOption('#preset', 'plan-b');
  await a.waitForFunction(() => /Plan B.*scored/.test(document.getElementById('designStatus').textContent), null, { timeout: 120000 });
  await a.click('#tabAuto'); await a.fill('#epochs', '12'); await a.click('#autoStart');
  await a.waitForFunction(() => /^Done/.test(document.getElementById('designStatus').textContent), null, { timeout: 600000 });
  const status = await a.textContent('#designStatus');
  await shot(a, '#design', path.join(OUT, '14-auto.png'));
  index.push({ id: '14', file: '14-auto.png', title: '14. Automatic mode: the fitness curve and the best plan', cap: `A (1+1) evolution strategy from Plan B, 12 epochs, each child scored on the same 24 rounds. ${status}` });
  // the gallery (M8.4): one PNG per environment, and docs/gallery/README.md
  const GOUT = path.join(__dirname, '..', 'docs', 'gallery'); fs.mkdirSync(GOUT, { recursive: true });
  const stories = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'gallery-stories.json'), 'utf8'));
  const gal = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'gallery.json'), 'utf8'));
  await a.close();
  const a2 = await page('index.html'); await a2.waitForSelector('#g-empty img[src^="data:"]', { timeout: 120000 }); await a2.evaluate(() => window.__app.pause());
  const gl = [];
  for (const id of stories.order) {
    await shot(a2, `#g-${id}`, path.join(GOUT, `${id}.png`));
    const env = gal.environments.find((e) => e.id === id); const m = env.metrics; const pct = (v) => `${Math.round(100 * v)} %`;
    gl.push(`## ${env.title}\n\n![${env.title}](${id}.png)\n\n${stories.stories[id]}\n\n*${env.how}.* F ${m.F.toFixed(3)} · escaped ${pct(m.escapeRate)} · caught ${pct(m.catchRate)} · cold ${pct(m.collapseRate)} · lost ${pct(m.lostRate)} · cost ${Math.round(m.cost)}. On the page: Gallery → "${env.title}" → Load this environment.\n`);
    console.log('wrote gallery', id);
  }
  fs.writeFileSync(path.join(GOUT, 'README.md'), `# Gallery of generated environments (ROADMAP M8.4)\n\nBuilt by \`node tools/build-gallery.mjs\` (scores on the 24-round suite, heat maps on the first night); images by \`npm run diagrams\`. Map key: pale = where survivors walked, green = where the creature went; ▲ escaped, ✕ caught, ○ taken by the cold, • still lost; white = plowed, red = closed, orange = lamps and shelters, pale triangles = signs.\n\n${gl.join('\n')}`);
  await a2.close();
  // the 3D view at 17:00
  const v = await page('index.html'); await v.waitForSelector('#view', { state: 'visible', timeout: 120000 }); await v.waitForTimeout(4000); await shot(v, '#view', path.join(OUT, '00-view.png'));
  index.unshift({ id: '00', file: '00-view.png', title: 'The live view', cap: 'Third-person view of a round at 17:00: fog from the observed visibility, LiDAR trees, the creature of roots.' });
  index.sort((x, y) => x.id.localeCompare(y.id));
  fs.writeFileSync(path.join(OUT, 'README.md'), `# Diagrams (ROADMAP M8.1)\n\nOne per requirement of the brief (semantic model §14). Re-generate with \`npm run diagrams\` (see \`tools/export-diagrams.cjs\`); the live page is [\`diagrams.html\`](../../diagrams.html).\n\n${index.map((x) => `## ${x.title}\n\n![${x.title}](${x.file})\n\n${x.cap}\n`).join('\n')}`);
  await browser.close();
  if (errors.length) { console.error('console errors:\n' + errors.join('\n')); process.exit(1); }
  console.log(`${index.length} diagrams, no console errors`);
})();
