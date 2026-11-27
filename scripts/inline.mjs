// Post-build: inline the bundled JS into one self-contained HTML file that runs from file://
// with no server.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Reads `page` and its scripts from the build folder `dir` and writes them as one file, `out`. */
export function inline(dir, page, out) {
  let html = readFileSync(join(dir, page), 'utf8');
  const assets = join(dir, 'assets');
  for (const f of readdirSync(assets)) {
    if (!f.endsWith('.js')) continue;
    const js = readFileSync(join(assets, f), 'utf8').replace(/<\/script/g, '<\\/script');
    const tag = new RegExp(`<script[^>]*src="\\./assets/${f.replace('.', '\\.')}"[^>]*></script>`);
    html = html.replace(tag, '');
    // A function as the replacement, so "$" sequences inside the script are left alone.
    html = html.replace('</body>', () => `<script type="module">${js}</script>\n</body>`);
  }
  writeFileSync(out, html);
  console.log(`wrote ${out.replace(/^.*\/dist\//, 'dist/')} (${(html.length / 1024).toFixed(1)} KB)`);
}
