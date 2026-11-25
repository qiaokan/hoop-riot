// Programmatic Vite dev server with inline config.
import { createServer } from 'vite';

const port = Number(process.env.PORT ?? 5173);
const server = await createServer({
  root: new URL('..', import.meta.url).pathname,
  configFile: false,
  base: '/',
  server: { port, strictPort: true },
  optimizeDeps: { noDiscovery: true, include: [] },
});
await server.listen();
server.printUrls();
