// Takes the submission screenshots and a short screen recording with the pre-installed Chromium.
// Usage: npm run capture   (or node tools/capture.mjs [warm-up seconds])
// Writes media/*.png and media/low-sky.webm. three.js is served from node_modules (npm install),
// so this works offline; the page itself loads three.js from the jsDelivr CDN.
// All screenshots come from ONE simulation run, so they show the same moment.
import { createRequire } from 'node:module';
import { mkdir, readFile, rename, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
const { chromium } = createRequire(import.meta.url)('playwright'); // the pre-installed Playwright (or npm i playwright)

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = join(ROOT, 'media');
const warm = Number(process.argv[2] || 3600);
const port = 8124;

const shots = [
  ['01-city-rules', { mode: 'city', view: 'overview', select: 'heli', cones: 'selected', bands: false }],
  ['02-cones-and-bands-midtown', { mode: 'city', view: 'midtown', cones: 'all', bands: true }],
  ['03-drone-knowledge-map', { mode: 'knowledge', select: 'drone', view: 'agent', cones: 'selected', bands: false }],
  ['04-helicopter-knowledge-map', { mode: 'knowledge', select: 'heli', view: 'overview' }],
  ['05-all-paths-3d', { mode: 'collective', view: 'overview', heat: 'none' }],
  ['06-landmark-heatmap', { mode: 'collective', view: 'top', heat: 'landmarks' }],
  ['07-natural-congestion', { mode: 'collective', view: 'top', heat: 'crowd' }],
  ['08-shared-knowledge', { mode: 'collective', view: 'top', heat: 'knowledge' }],
];

async function route(page) {
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', async (r) => {
    const rel = new URL(r.request().url()).pathname.replace('/npm/three@0.160.0/', '');
    r.fulfill({ body: await readFile(join(ROOT, 'node_modules/three', rel)), contentType: 'text/javascript' });
  });
}

const server = await serve(port);
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await route(page);
  await page.goto(`http://localhost:${port}/?paused=1&warm=${warm}`);
  await page.waitForFunction(() => window.__app?.ready, null, { timeout: 900000 });
  for (const [name, opts] of shots) {
    await page.evaluate((o) => window.__app.apply(o), opts);
    await page.waitForTimeout(1200);
    const box = await page.locator('.stage').boundingBox(); // software WebGL is slow: clip instead of waiting for "stable"
    await page.screenshot({ path: join(OUT, `${name}.png`), clip: box, timeout: 120000 });
    console.log('saved', name);
  }
  await page.evaluate(() => window.__app.apply({ mode: 'collective', view: 'top', heat: 'crowd' }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, '09-full-page.png'), fullPage: true, timeout: 120000 });
  console.log('saved 09-full-page');
  await page.close();

  // a short recording: the city at 20x, then one agent's map, then everyone together
  const vdir = join(OUT, 'video-tmp');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: vdir, size: { width: 1280, height: 720 } } });
  const vp = await ctx.newPage(); await route(vp);
  await vp.goto(`http://localhost:${port}/?warm=${Math.min(warm, 1800)}&speed=20`);
  await vp.waitForFunction(() => window.__app?.ready, null, { timeout: 900000 });
  await vp.evaluate(() => { document.querySelector('.page-head').style.display = 'none'; window.scrollTo(0, 0); });
  await vp.evaluate(() => window.__app.apply({ mode: 'city', view: 'downtown', select: 'heli', cones: 'all' }));
  await vp.waitForTimeout(12000);
  await vp.evaluate(() => window.__app.apply({ mode: 'knowledge', select: 'drone', view: 'agent', cones: 'selected' }));
  await vp.waitForTimeout(8000);
  await vp.evaluate(() => window.__app.apply({ mode: 'collective', view: 'overview', heat: 'crowd' }));
  await vp.waitForTimeout(10000);
  await ctx.close();
  const [f] = await readdir(vdir);
  await rename(join(vdir, f), join(OUT, 'low-sky.webm'));
  await rm(vdir, { recursive: true, force: true });
  console.log('saved low-sky.webm');
} finally {
  await browser.close(); server.close();
}
