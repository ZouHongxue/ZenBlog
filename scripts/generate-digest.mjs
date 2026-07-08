#!/usr/bin/env node
/**
 * 抓取 scripts/digest-feeds.json 里配置的 RSS/Atom 源，过滤最近 7 天的内容，
 * 翻译成中文，生成 src/data/digest/YYYY-MM-DD.html，并尝试自动 git add + commit + push。
 *
 * 用法：
 *   node scripts/generate-digest.mjs
 *
 * 需要先 `npm install`（依赖 rss-parser）。
 * 注意：这个脚本必须在能访问真实互联网、且有 git 写权限的环境里跑（也就是你自己的
 * Mac 终端），不能在 Cowork 的沙箱里跑——沙箱既连不到这些新闻源，也没有 git 提交权限。
 *
 * 如果当天的文件已经存在，会先询问是否覆盖（CLI 下是终端 y/N 提示；被 dev 端点
 * /api/generate-digest 调用时是先返回 needsConfirm，前端 confirm() 后带 force:true 重新调用）。
 */
import Parser from 'rss-parser';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FEEDS_PATH = join(__dirname, 'digest-feeds.json');
const OUT_DIR = join(ROOT, 'src/data/digest');

const MAX_AGE_DAYS = 7;
const MAX_PER_CATEGORY = 100;
const TRANSLATE_CONCURRENCY = 4;

const parser = new Parser({ timeout: 15000 });

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function loadJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return fallback;
  }
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(s = '') {
  return String(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function isWithinDays(pubDate, days) {
  if (!pubDate) return true; // 拿不到日期就先保留，别误删内容
  const t = new Date(pubDate).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t <= days * 24 * 60 * 60 * 1000;
}

// ── 并发限制的 map，避免几百条同时请求翻译接口 ──
async function pMap(items, fn, concurrency) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await fn(items[cur], cur);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// ── 免费的 Google 翻译非官方接口，不需要 API key。
// 失败（限流/网络问题）时直接返回原文，不阻断整个流程。──
async function translateText(text) {
  if (!text || !text.trim()) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return text;
    const data = await res.json();
    const translated = (data[0] || []).map((chunk) => chunk[0]).join('');
    return translated.trim() || text;
  } catch {
    return text;
  }
}

async function translateItem(it) {
  const [title, summary] = await Promise.all([
    translateText(it.title),
    it.summary ? translateText(it.summary) : Promise.resolve(''),
  ]);
  return { ...it, title, summary };
}

async function fetchFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    return (parsed.items || []).map((it) => ({
      title: it.title || '(无标题)',
      link: it.link || '#',
      guid: it.guid || it.link || it.title,
      pubDate: it.isoDate || it.pubDate || null,
      summary: stripHtml(it.contentSnippet || it.content || it.summary || '').slice(0, 160),
      source: feed.name,
      category: feed.category || '其他',
    }));
  } catch (e) {
    console.warn(`[digest] 抓取失败: ${feed.name} (${feed.url}) — ${e.message}`);
    return [];
  }
}

function renderHtml(date, byCategory) {
  const categories = Object.keys(byCategory);
  const cardsHtml = categories
    .map((cat) => {
      const items = byCategory[cat];
      const itemsHtml = items
        .map(
          (it) => `
      <li>
        <div class="item-title"><a href="${escapeHtml(it.link)}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a></div>
        ${it.summary ? `<div class="item-summary">${escapeHtml(it.summary)}</div>` : ''}
        <div class="item-meta"><span class="tag">${escapeHtml(it.source)}</span>${it.pubDate ? ` · ${new Date(it.pubDate).toLocaleDateString('zh-CN')}` : ''}</div>
      </li>`
        )
        .join('');
      return `
    <div class="card">
      <div class="card-title">${escapeHtml(cat)} <span class="count">${items.length} 条</span></div>
      <ul class="news">${itemsHtml}</ul>
    </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>资讯精选 ${date}</title>
<style>
  :root {
    --bg: #f9fafb; --card: #ffffff; --text: #111827; --muted: #6b7280;
    --border: #e5e7eb; --accent: #2563eb; --tag-bg: #f3f4f6;
    --header-bg: #0f172a; --header-text: #f1f5f9;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Helvetica Neue", sans-serif;
    font-size: 14px; line-height: 1.65; color: var(--text); background: var(--bg);
    padding: 24px 16px 48px;
  }
  .page { max-width: 900px; margin: 0 auto; }
  .header { background: var(--header-bg); color: var(--header-text); border-radius: 12px; padding: 28px 32px; margin-bottom: 20px; }
  .header h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
  .header .date { font-size: 12px; color: #94a3b8; margin-top: 4px; }
  .card { background: var(--card); border-radius: 10px; border: 1px solid var(--border); padding: 20px 24px; margin-bottom: 16px; }
  .card-title { font-size: 14px; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
  .card-title .count { font-size: 11px; font-weight: 500; color: var(--muted); background: var(--tag-bg); padding: 1px 7px; border-radius: 10px; }
  ul.news { list-style: none; }
  ul.news li { padding: 10px 0; border-bottom: 1px solid var(--border); display: grid; gap: 3px; }
  ul.news li:last-child { border-bottom: none; }
  .item-title { font-weight: 500; font-size: 13.5px; }
  .item-title a { color: var(--text); text-decoration: none; }
  .item-title a:hover { color: var(--accent); }
  .item-summary { font-size: 12.5px; color: #4b5563; }
  .item-meta { font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .tag { display: inline-block; font-size: 10.5px; padding: 1px 6px; border-radius: 4px; background: var(--tag-bg); color: var(--muted); }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <h1>资讯精选</h1>
    <div class="date">${date}</div>
  </div>
  ${cardsHtml}
</div>
</body>
</html>`;
}

/**
 * @param {{ force?: boolean }} opts force=true 时即使当天文件已存在也直接覆盖
 */
export async function runDigest({ force = false } = {}) {
  const date = todayStr();
  const outPath = join(OUT_DIR, `${date}.html`);

  if (existsSync(outPath) && !force) {
    return { needsConfirm: true, date };
  }

  const feeds = loadJson(FEEDS_PATH, []);
  if (feeds.length === 0) {
    console.warn('[digest] scripts/digest-feeds.json 为空或不存在，跳过。');
    return { needsConfirm: false, totalItems: 0, date };
  }

  const byCategory = {};
  for (const feed of feeds) {
    const items = await fetchFeed(feed);
    const recent = items.filter((it) => isWithinDays(it.pubDate, MAX_AGE_DAYS));
    if (recent.length === 0) continue;
    const cat = feed.category || '其他';
    (byCategory[cat] ||= []).push(...recent);
  }

  // 按时间倒序排列，每个分类最多保留 MAX_PER_CATEGORY 条
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    byCategory[cat] = byCategory[cat].slice(0, MAX_PER_CATEGORY);
  }

  const totalItems = Object.values(byCategory).reduce((s, arr) => s + arr.length, 0);
  if (totalItems === 0) {
    console.log('[digest] 最近 7 天没有新内容，跳过生成。');
    return { needsConfirm: false, totalItems: 0, date };
  }

  // 翻译标题和摘要（并发限制，失败自动回退原文）
  console.log(`[digest] 翻译 ${totalItems} 条内容…`);
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat] = await pMap(byCategory[cat], translateItem, TRANSLATE_CONCURRENCY);
  }

  const html = renderHtml(date, byCategory);
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(outPath, html);

  console.log(`[digest] 生成完成：${totalItems} 条内容 → ${outPath}`);
  return { needsConfirm: false, totalItems, outPath, date };
}

function promptConfirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

async function main() {
  const date = todayStr();
  const outPath = join(OUT_DIR, `${date}.html`);
  let force = false;

  if (existsSync(outPath)) {
    force = await promptConfirm(`今天的资讯已经存在 (${outPath})，是否覆盖？(y/N) `);
    if (!force) {
      console.log('[digest] 已取消。');
      return;
    }
  }

  const result = await runDigest({ force: true });
  if (result.totalItems > 0) {
    try {
      execSync('git add src/data/digest/', { cwd: ROOT });
      execSync(`git commit -m "content: RSS digest ${date}"`, { cwd: ROOT });
      console.log('[digest] 已提交。');
      try {
        execSync('git push', { cwd: ROOT });
        console.log('[digest] 已 push。');
      } catch (pushErr) {
        console.warn('[digest] git push 失败，需要手动 push:', String(pushErr).split('\n')[0]);
      }
    } catch (e) {
      console.warn('[digest] git commit 跳过（可能无变更）:', String(e).split('\n')[0]);
    }
  }
}

// 只有直接 `node generate-digest.mjs` 运行时才执行 main()，
// 被 astro.config.mjs 的 dev 端点 import 时只使用 runDigest()。
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
