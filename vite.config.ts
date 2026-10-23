import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

// Committed data/ is served at /data in dev/preview and copied to dist/data at build time.
function dataDir(): Plugin {
  const root = join(import.meta.dirname, 'data');
  const serve = (url: string | undefined, res: import('node:http').ServerResponse, next: () => void) => {
    if (!url?.startsWith('/data/')) return next();
    const file = normalize(join(root, decodeURIComponent(url.slice(6).split('?')[0]!)));
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();
    res.setHeader('Content-Type', 'application/json');
    createReadStream(file).pipe(res);
  };
  return {
    name: 'rotationkit-data',
    configureServer: (s) => void s.middlewares.use((req, res, next) => serve(req.url, res, next)),
    closeBundle: () => cpSync(root, join(import.meta.dirname, 'dist', 'data'), { recursive: true }),
  };
}

export default defineConfig({
  plugins: [react(), dataDir()],
  test: { include: ['tests/**/*.test.ts'] },
});
