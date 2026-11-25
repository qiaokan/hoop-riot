// Programmatic Vite build with inline config (no vite.config file to bundle).
import { build } from 'vite';

await build({
  root: new URL('..', import.meta.url).pathname,
  configFile: false,
  base: './',
  logLevel: 'info',
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});
await import('./inline.mjs');
