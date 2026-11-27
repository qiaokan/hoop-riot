// Programmatic Vite build with inline config (no vite.config file to bundle).
// Two pages come out, each as one self-contained file: the 2D game and the 3D game.
import { build } from 'vite';
import { join } from 'node:path';
import { inline } from './inline.mjs';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const common = { root, configFile: false, base: './', logLevel: 'info' };

await build({ ...common, build: { target: 'es2022', outDir: 'dist', emptyOutDir: true } });
inline(dist, 'index.html', join(dist, 'hoop-riot.html'));

// The 3D page carries three.js, so it is several times the size of the 2D one.
await build({ ...common, build: { target: 'es2022', outDir: 'dist/3d', emptyOutDir: true, chunkSizeWarningLimit: 2000, rollupOptions: { input: join(root, 'gl.html') } } });
inline(join(dist, '3d'), 'gl.html', join(dist, 'hoop-riot-3d.html'));
