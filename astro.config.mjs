import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

function devEditorPlugin() {
  return {
    name: 'dev-editor',
    configureServer(server) {
      // ideas.json 专用端点
      server.middlewares.use('/api/ideas', (req, res) => {
        const fullPath = join(process.cwd(), 'src/data/ideas.json');
        if (req.method === 'GET') {
          try {
            const content = readFileSync(fullPath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(content);
          } catch { res.writeHead(404); res.end('{}'); }
        } else if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            writeFileSync(fullPath, body, 'utf-8');
            res.writeHead(200); res.end('OK');
          });
        } else { res.writeHead(405); res.end(); }
      });

      server.middlewares.use('/api/edit', (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const file = url.searchParams.get('file') || '';
        if (!file || file.includes('..') || !file.endsWith('.md')) {
          res.writeHead(400); res.end('Invalid file'); return;
        }
        const fullPath = join(process.cwd(), 'src/content/blog', file);
        if (req.method === 'GET') {
          try {
            const content = readFileSync(fullPath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(content);
          } catch { res.writeHead(404); res.end('Not found'); }
        } else if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            writeFileSync(fullPath, body, 'utf-8');
            res.writeHead(200); res.end('OK');
          });
        } else {
          res.writeHead(405); res.end();
        }
      });
    },
  };
}

export default defineConfig({
  site: 'https://zenhome.qzz.io',
  integrations: [tailwind(), mdx()],
  vite: { plugins: [devEditorPlugin()] },
});
