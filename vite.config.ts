import { defineConfig } from 'vite';

export default defineConfig({
  // Bind all interfaces (0.0.0.0) so the dev server is reachable on both
  // loopback and the container/network IP. Use '127.0.0.1' to restrict to localhost.
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
  },
});
