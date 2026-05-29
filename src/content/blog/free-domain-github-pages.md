---
title: "免费域名 + GitHub Pages + Cloudflare 全套搭建 | Free Domain, GitHub Pages & Cloudflare Setup"
description: "用 digitalplat.org 申请免费域名，配合 GitHub Pages 托管和 Cloudflare DNS 解析，顺带接入 Google Search Console——零成本搭一个有自定义域名的静态博客。"
pubDate: "2026-05-29"
author: "Zen"
tags: ["建站", "工程效率", "随笔"]
draft: true
---

<!-- DRAFT：流程待核对 -->

搭这个博客的时候，顺手把自定义域名也配好了。整套下来没踩什么坑，但各个环节散落在不同的文档里，第一次配容易绕圈子。整理一下，下次用的时候也方便查。

最终效果：`zenhome.qzz.io`，免费域名，GitHub Pages 托管，Cloudflare 管 DNS，Google 已收录。

---

## 第一步：申请免费域名

去 [digitalplat.org](https://dash.domain.digitalplat.org/) 注册账号，选一个你喜欢的免费域名后缀（`.qzz.io`、`.us.kg` 等可选）。

流程很直接：搜索想要的域名 → 检查是否可用 → 注册。免费的，不需要付款。

注册完成后，在控制台里找到 DNS 设置，这里后面会用到。

---

## 第二步：GitHub Pages 配置

假设你的仓库已经用 GitHub Actions 自动构建部署了。需要做两件事：

**1. 在仓库根目录放 CNAME 文件**

在 `public/CNAME`（Astro）或仓库根目录的 `CNAME`（其他框架）里写上你的域名：

```
zenhome.qzz.io
```

不要加 `https://`，只写域名本身。

**2. 在 GitHub 仓库设置里填入域名**

进 `Settings → Pages → Custom domain`，填入你的域名，点 Save。

此时 GitHub 会开始做 DNS 验证，先不用管，等 DNS 配好之后会自动通过。

---

## 第三步：Cloudflare DNS 解析

在 [cloudflare.com](https://cloudflare.com) 注册账号（免费），添加你的域名。

**添加 4 条 A 记录，指向 GitHub Pages 的 IP：**

| 类型 | 名称 | 内容 |
|------|------|------|
| A | @ 或你的子域名 | 185.199.108.153 |
| A | @ 或你的子域名 | 185.199.109.153 |
| A | @ 或你的子域名 | 185.199.110.153 |
| A | @ 或你的子域名 | 185.199.111.153 |

**关键：Proxy 状态设为 DNS only（灰色云朵）**

不要开 Proxy（橙色云朵）。GitHub Pages 的 HTTPS 证书是 GitHub 自己签发的，走 Cloudflare CDN 会导致证书冲突，出现 SSL 错误。

---

**在 digitalplat 里设置 Nameserver**

回到 digitalplat 的域名控制台，把 Nameserver 改成 Cloudflare 分配给你的两个地址（格式类似 `xxx.ns.cloudflare.com`）。

DNS 生效需要一点时间，通常几分钟到半小时。

---

## 第四步：验证并开启 HTTPS

DNS 生效后，回 GitHub `Settings → Pages`，之前填的 Custom domain 下面应该会显示 DNS check successful。

勾选 **Enforce HTTPS**，之后访问 `http://` 会自动 301 跳转到 `https://`。

---

## 第五步：Google Search Console 接入

让搜索引擎收录你的新域名。

**添加资产**

进 [search.google.com/search-console](https://search.google.com/search-console)，点「添加资产」，选「网址前缀」，填入 `https://你的域名`。

**验证所有权**

最简单的方式：如果你的站已经装了 Google Analytics，在验证页面选「通过 Google Analytics 验证」，一键完成。

或者用 HTML meta 标签：把验证码加到 `<head>` 里：

```html
<meta name="google-site-verification" content="你的验证码" />
```

**提交 Sitemap**

验证通过后，进 `Sitemaps`，提交：

```
https://你的域名/sitemap.xml
```

Google 不会立刻收录，通常几天到一周开始看到效果。

---

## 整体架构

```
访客
  ↓
Cloudflare DNS（解析，不走 CDN）
  ↓
GitHub Pages（托管 + HTTPS 证书）
  ↓
你的站
```

---

## 几点补充

**旧域名会失效吗？**

如果你之前用的是 `username.github.io/repo` 这样的路径，配了自定义域名之后旧地址会 301 重定向到新域名，不用担心。

**免费域名稳定吗？**

digitalplat 的免费域名是社区项目，长期稳定性不如付费域名。如果将来换正式域名，Google Search Console 有「地址更改」工具可以平滑迁移 SEO 权重。

**要不要接 Bing Search Console？**

可以接，但优先级低。国内用 Bing 的人不多，Google 搜索覆盖大部分场景。如果 Google 已经收录了，Bing 迟早也会跟着抓。
