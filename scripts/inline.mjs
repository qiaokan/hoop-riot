// Post-build: inline the bundled JS into one self-contained HTML file
// (dist/hoop-riot.html) that runs from file:// with no server.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = join(dist, 'assets');
for (const f of readdirSync(assets)) {
  if (!f.endsWith('.js')) continue;
  const js = readFileSync(join(assets, f), 'utf8').replace(/<\/script/g, '<\\/script');
  const tag = new RegExp(`<script[^>]*src="\\./assets/${f.replace('.', '\\.')}"[^>]*></script>`);
  html = html.replace(tag, '');
  html = html.replace('</body>', `<script type="module">${js}</script>\n</body>`);
}
writeFileSync(join(dist, 'hoop-riot.html'), html);
console.log(`wrote dist/hoop-riot.html (${(html.length / 1024).toFixed(1)} KB)`);
