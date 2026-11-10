// Packs the page into ONE html file that opens with a double-click (no server, no install):
//   low-sky.html             the standalone page (three.js comes from the jsDelivr CDN)
//   dist/low-sky-embed.html  the same page without the <html>/<head>/<body> skeleton, for hosting as a claude.ai artifact
// Usage: npm run build
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const res = await build({
  entryPoints: [join(ROOT, 'src/ui/main.js')], bundle: true, format: 'esm', minify: true, write: false,
  external: ['three', 'three/addons/*'], target: 'es2020', legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile(join(ROOT, 'style.css'), 'utf8');
let html = await readFile(join(ROOT, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="style\.css[^"]*">/, () => `<style>\n${css}\n</style>`);
html = html.replace(/<script type="module" src="src\/ui\/main\.js[^"]*"><\/script>/, () => `<script type="module">\n${js}\n</script>`);
html = html.replace('<!-- ?v= is a version stamp: change it on every release so browsers fetch the new files. -->\n', '');
const stamp = `<!-- Built from src/ by tools/build_single.mjs on ${new Date().toISOString().slice(0, 10)}. Edit src/, then npm run build. -->\n`;
await writeFile(join(ROOT, 'low-sky.html'), html.replace('<head>\n', `<head>\n  ${stamp}`));

// Artifact version: no skeleton tags, a title first, the side-gutter meta, the download buttons hidden
// (artifact frames block downloads).
let embed = html
  .replace(/<!doctype html>\s*/i, '').replace(/<html[^>]*>\s*/i, '').replace(/<\/html>\s*/i, '')
  .replace(/<head>\s*/i, '').replace(/<\/head>\s*/i, '').replace(/<\/body>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<body>/i, '<div class="embed">');
embed = embed.replace(/(<title>[^<]*<\/title>)/, '$1\n<meta name="claude:viewport-fit-sides" content="cover">');
embed = embed.replace('</footer>', '</footer>\n</div>');
embed = embed.replace('color-scheme: dark;\n}', 'color-scheme: dark;\n}\n:root { background: var(--bg); }');
await mkdir(join(ROOT, 'dist'), { recursive: true });
await writeFile(join(ROOT, 'dist/low-sky-embed.html'), embed);
console.log(`low-sky.html ${(html.length / 1024).toFixed(0)} KB, dist/low-sky-embed.html ${(embed.length / 1024).toFixed(0)} KB`);
