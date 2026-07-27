import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

import { readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

function devEditorPlugin() {
  return {
    name: 'dev-editor',
    configureServer(server) {
      // 监听 src/data/zaobao、src/data/zhuanti、src/data/digest，新增文件时重启 dev server
      // 注意：这几个目录下的动态路由 [date]/[slug] 用 getStaticPaths 生成，
      // Astro 只在 dev server 启动时跑一次该函数来确定路由清单。
      // 之前用 hot.send({type:'full-reload'}) 只是刷新浏览器，并不会让 Astro
      // 重新计算路由清单，所以新文件依然 404——必须真正 restart() 才能生效。
      const watchDirs = [
        join(process.cwd(), 'src/data/zaobao'),
        join(process.cwd(), 'src/data/zhuanti'),
        join(process.cwd(), 'src/data/digest'),
      ];
      server.watcher.add(watchDirs);
      let restartTimer = null;
      server.watcher.on('add', (filePath) => {
        if (watchDirs.some(dir => filePath.startsWith(dir))) {
          // 防抖：同步端点一次可能新增多个文件，避免连续触发多次 restart
          clearTimeout(restartTimer);
          restartTimer = setTimeout(() => {
            console.log('[dev-editor] 检测到新文件，重启 dev server 以刷新路由...');
            server.restart();
          }, 300);
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

      // 通用 git commit 端点（供沙箱 Claude 通过 curl 调用，以本地用户身份执行 git）
      // POST /api/git-commit  Body: { "files": ["path/to/file"], "message": "commit msg" }
      server.middlewares.use('/api/git-commit', (req, res) => {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const { files, message } = JSON.parse(body);
            if (!message || !Array.isArray(files) || files.length === 0) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: 'files and message required' }));
              return;
            }
            // 安全校验：只允许提交 src/ 和根目录白名单文件，禁止路径穿越
            const allowed = files.every(f =>
              typeof f === 'string' && !f.includes('..') &&
              (f.startsWith('src/') || ['astro.config.mjs', 'package.json', '.gitignore', 'CLAUDE.md'].includes(f))
            );
            if (!allowed) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: 'path not allowed' }));
              return;
            }
            const cwd = process.cwd();
            execSync(`git add ${files.map(f => JSON.stringify(f)).join(' ')}`, { cwd });
            execSync(`git commit -m ${JSON.stringify(message)}`, { cwd });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(e).split('\n')[0] }));
          }
        });
      });

      // RSS 资讯抓取端点：跑 scripts/generate-digest.mjs 的核心逻辑，
      // 生成 src/data/digest/YYYY-MM-DD.html 并尝试 git commit（跟 sync-zaobao 一样，
      // 只有在真实的本地 dev server 里跑才会成功抓到网并提交）。
      // 如果当天文件已存在且没带 force:true，直接返回 needsConfirm，不做任何抓取，
      // 前端弹 confirm() 确认后带 force:true 重新调用一次才会真正覆盖。
      server.middlewares.use('/api/generate-digest', (req, res) => {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          (async () => {
            try {
              let force = false;
              try { force = JSON.parse(body || '{}').force === true; } catch {}
              const mod = await import('./scripts/generate-digest.mjs?t=' + Date.now());
              const result = await mod.runDigest({ force });
              if (result.needsConfirm) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, needsConfirm: true, date: result.date }));
                return;
              }
              if (result.totalItems > 0) {
                const cwd = process.cwd();
                try {
                  execSync('git add src/data/digest/', { cwd });
                  execSync(`git commit -m "content: RSS digest ${result.date}"`, { cwd });
                } catch (gitErr) {
                  console.warn('[generate-digest] git commit 失败（可能无变更）:', String(gitErr).split('\n')[0]);
                }
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, totalItems: result.totalItems }));
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: String(e) }));
            }
          })();
        });
      });

      // 删除某一天的资讯精选（dev 模式下 /digest 列表页的删除按钮用）
      server.middlewares.use('/api/delete-digest', (req, res) => {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        const url = new URL(req.url, 'http://localhost');
        const name = url.searchParams.get('name') || '';
        if (!name || !/^[\w-]+$/.test(name)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid name' }));
          return;
        }
        const filePath = join(process.cwd(), 'src/data/digest', `${name}.html`);
        try {
          if (existsSync(filePath)) unlinkSync(filePath);
          const cwd = process.cwd();
          try {
            execSync(`git add src/data/digest/${name}.html`, { cwd });
            execSync(`git commit -m "chore: remove digest ${name}"`, { cwd });
          } catch (gitErr) {
            console.warn('[delete-digest] git commit 失败（可能无变更）:', String(gitErr).split('\n')[0]);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
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
