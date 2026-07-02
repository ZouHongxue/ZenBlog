import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

import { readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

function devEditorPlugin() {
  return {
    name: 'dev-editor',
    configureServer(server) {
      // 监听 src/data/zaobao 和 src/data/zhuanti，新增文件时触发整页刷新
      // Astro v6 / Vite 6 不再自动 watch 这些 raw HTML 目录，getStaticPaths 不会重跑
      const watchDirs = [
        join(process.cwd(), 'src/data/zaobao'),
        join(process.cwd(), 'src/data/zhuanti'),
      ];
      server.watcher.add(watchDirs);
      server.watcher.on('add', (filePath) => {
        if (watchDirs.some(dir => filePath.startsWith(dir))) {
          server.hot.send({ type: 'full-reload' });
        }
      });

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
            try {
              const payload = JSON.parse(body);
              if (payload.action === 'update' || payload.action === 'delete') {
                // 读取现有数据，操作后写回
                const existing = JSON.parse(readFileSync(fullPath, 'utf-8'));
                // sorted = [...ideas].reverse() 所以 index 在 sorted 里对应 existing[existing.length - 1 - index]
                const realIdx = existing.length - 1 - payload.index;
                if (payload.action === 'delete') {
                  existing.splice(realIdx, 1);
                } else {
                  existing[realIdx].text = payload.text;
                  existing[realIdx].context = payload.context;
                }
                writeFileSync(fullPath, JSON.stringify(existing, null, 2), 'utf-8');
              } else {
                // 兼容旧版：整体覆盖
                writeFileSync(fullPath, body, 'utf-8');
              }
              res.writeHead(200); res.end('OK');
            } catch {
              res.writeHead(400); res.end('Bad request');
            }
          });
        } else { res.writeHead(405); res.end(); }
      });

      // 早报同步端点：把 ~/Desktop/早报/*.html 复制到 src/data/zaobao/
      server.middlewares.use('/api/sync-zaobao', (req, res) => {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        try {
          // 支持多个候选路径（macOS 中英文桌面名均可）
          const srcCandidates = [
            join(homedir(), 'Desktop', '早报'),
            join(homedir(), '桌面', '早报'),
          ];
          const src = srcCandidates.find(p => existsSync(p));
          if (!src) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: `未找到桌面早报文件夹，请确认 ~/Desktop/早报 存在。已检查路径：${srcCandidates.join(', ')}` }));
            return;
          }
          const dest = join(process.cwd(), 'src/data/zaobao');
          if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
          const srcFiles = readdirSync(src).filter(f => f.endsWith('.html'));
          const copied = [];   // 新增或内容有变化的文件
          const skipped = [];  // 内容完全相同，跳过
          for (const f of srcFiles) {
            const srcPath  = join(src, f);
            const destPath = join(dest, f);
            if (existsSync(destPath)) {
              // 已存在：对比内容，有变化才覆盖
              const srcContent  = readFileSync(srcPath);
              const destContent = readFileSync(destPath);
              if (srcContent.equals(destContent)) {
                skipped.push(f);
                continue;
              }
            }
            copyFileSync(srcPath, destPath);
            copied.push(f);
          }
          // git add + commit（有新文件才提交）
          if (copied.length > 0) {
            const cwd = process.cwd();
            try {
              execSync('git add src/data/zaobao/', { cwd });
              const dates = copied.map(f => f.replace('.html', '')).join(', ');
              execSync(`git commit -m "content: 同步早报 ${dates}"`, { cwd });
            } catch (gitErr) {
              // git commit 失败不影响同步成功（文件已复制）
              console.warn('[sync-zaobao] git commit 失败（可能无变更）:', String(gitErr).split('\n')[0]);
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, copied, skipped }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: String(e) }));
        }
      });

      // songs.json lyrics 编辑端点
      server.middlewares.use('/api/lyrics', (req, res) => {
        const fullPath = join(process.cwd(), 'src/data/songs.json');
        if (req.method === 'GET') {
          try {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(readFileSync(fullPath, 'utf-8'));
          } catch { res.writeHead(404); res.end('[]'); }
        } else if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { songId, lyrics } = JSON.parse(body);
              const songs = JSON.parse(readFileSync(fullPath, 'utf-8'));
              const idx = songs.findIndex(s => s.id === songId);
              if (idx < 0) { res.writeHead(404); res.end('Song not found'); return; }
              songs[idx].lyrics = lyrics;
              writeFileSync(fullPath, JSON.stringify(songs, null, 2), 'utf-8');
              res.writeHead(200); res.end('OK');
            } catch { res.writeHead(400); res.end('Bad request'); }
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
  integrations: [mdx()],
  vite: {
    plugins: [
      tailwindcss(),
      devEditorPlugin(),
    ],
  },
});
