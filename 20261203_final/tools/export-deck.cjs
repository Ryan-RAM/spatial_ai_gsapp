// deck.html -> docs/frostroot-deck.pdf (ROADMAP M8.5), one 16:9 page per slide. Needs the static
// server (npm run serve) and Playwright with Chromium, like the diagrams (D-036).
const path = require('node:path');
let chromium; try { ({ chromium } = require('playwright')); } catch { console.error('Playwright not found: npm i -g playwright && npx playwright install chromium'); process.exit(1); }
const BASE = process.env.BASE ?? 'http://localhost:8765/';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto(BASE + 'deck.html', { waitUntil: 'networkidle' });
  const out = path.join(__dirname, '..', 'docs', 'frostroot-deck.pdf');
  await p.pdf({ path: out, width: '13.333in', height: '7.5in', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  console.log('wrote', out, (await p.locator('.slide').count()), 'slides'); await b.close();
})();
