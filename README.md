# Zen Blog

用 Astro + Tailwind CSS 构建的个人博客，部署于 GitHub Pages。

## 特性

- 🌙 深色/浅色主题切换
- 📱 响应式设计
- 🏷️ 标签筛选
- ⚡ 极快加载速度

## 本地开发

```bash
npm install
npm run dev
```

## 部署到 GitHub Pages

1. 修改 `astro.config.mjs` 中的 `site` 和 `base` 为你自己的
2. 推送到 `main` 分支
3. 在仓库 Settings → Pages 中选择 GitHub Actions 作为来源

## 写新文章

在 `src/content/blog/` 下新建 `.md` 文件：

```markdown
---
title: "文章标题"
description: "文章摘要"
pubDate: "2024-01-01"
tags: ["标签1", "标签2"]
---

正文内容...
```
