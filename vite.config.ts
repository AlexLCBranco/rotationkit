import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { generatedFile, generatedFiles, seasonsIn } from './scripts/lib/generated.ts';
import { withHead } from './scripts/lib/head.ts';
import { allPages, pageFiles } from './scripts/lib/pages.ts';

// Committed data/ is served at /data in dev and copied to dist/data at build time (preview serves dist/).
// Generated files (scripts/lib/generated.ts, e.g. <season>/players.json) are built from the game files: written to
// dist/data at build time and generated on request in dev. They are never committed.
function dataDir(): Plugin {
  const root = join(import.meta.dirname, 'data');
  const serve = (url: string | undefined, res: import('node:http').ServerResponse, next: () => void) => {
    if (!url?.startsWith('/data/')) return next();
    const rel = decodeURIComponent(url.slice(6).split('?')[0]!);
    const gen = generatedFile(root, rel);
    if (gen !== undefined) {
      res.setHeader('Content-Type', 'application/json');
      return void res.end(JSON.stringify(gen));
    }
    const file = normalize(join(root, rel));
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();
    res.setHeader('Content-Type', 'application/json');
    createReadStream(file).pipe(res);
  };
  return {
    name: 'rotationkit-data',
    configureServer: (s) => void s.middlewares.use((req, res, next) => serve(req.url, res, next)),
    closeBundle: () => {
      const out = join(import.meta.dirname, 'dist', 'data');
      cpSync(root, out, { recursive: true });
      for (const season of seasonsIn(root))
        for (const [path, content] of Object.entries(generatedFiles(root, season))) {
          mkdirSync(dirname(join(out, path)), { recursive: true });
          writeFileSync(join(out, path), JSON.stringify(content));
        }
      // RK-14: one real page per game, player and team (its own title and preview tags), sitemap.xml, robots.txt.
      const dist = join(import.meta.dirname, 'dist');
      const files = pageFiles(readFileSync(join(dist, 'index.html'), 'utf8'), allPages(root));
      let bytes = 0;
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(dist, path)), { recursive: true });
        writeFileSync(join(dist, path), text);
        bytes += Buffer.byteLength(text);
      }
      console.log(`generated pages: ${Object.keys(files).length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
    },
  };
}

// RK-9 / RK-16: index.html gets its title, description and link-preview tags at build time, from src/app/site.ts.
const siteHead = (): Plugin => ({ name: 'rotationkit-head', transformIndexHtml: (html) => withHead(html, {}) });

export default defineConfig({
  plugins: [react(), dataDir(), siteHead()],
  test: { include: ['tests/**/*.test.ts', 'src/**/*.test.ts'] },
});
