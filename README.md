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

## 致谢

本项目由 [Claude](https://claude.ai)（Anthropic）辅助生成，基于 [Astro](https://astro.build) 框架与 [Tailwind CSS](https://tailwindcss.com) 构建。

## 开源协议

MIT License

Copyright (c) 2026 ZouHongxue

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
