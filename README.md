# 播客 Shownotes

在 Apple Podcasts 收听播客时，一键跳转查看当前单集的图文 Show Notes。

## 工作原理

```
Apple Podcasts → 分享单集 → iOS Shortcut → 打开 PWA → 展示 Show Notes
```

1. **Shortcut** 接收 Apple Podcasts 的分享 URL，提取 podcastId 和 episodeId，跳转到 PWA
2. **PWA** 通过 iTunes API 获取播客信息，抓取 RSS Feed 解析出 Show Notes 内容并渲染

## 安装

### 1. 添加 Shortcut

点击以下链接在 iPhone 上安装 Shortcut：

[https://www.icloud.com/shortcuts/b7b1468eeb104782a35af6a0d6a8fc98](https://www.icloud.com/shortcuts/b7b1468eeb104782a35af6a0d6a8fc98)

安装后需要在 Shortcut 设置中开启 **Share Sheet** 支持，接收类型选择 **URLs**。

### 2. 添加到主屏幕（推荐）

在 Safari 中打开 [podcast-shownotes.caosanyang.workers.dev](https://podcast-shownotes.caosanyang.workers.dev)，通过分享菜单选择"添加到主屏幕"，获得接近原生 App 的体验。

## 使用方法

1. 在 Apple Podcasts 中播放任意播客单集
2. 点击分享按钮 → 选择「播客 Shownotes」Shortcut
3. 自动跳转到该单集的 Show Notes 页面

也可以直接打开 PWA，通过搜索框搜索播客名称浏览剧集。

## 技术栈

- **前端**：纯 HTML/CSS/JS，零运行时依赖 SPA
- **PWA**：Service Worker 离线缓存，支持添加到主屏幕
- **API**：iTunes Search / Lookup API
- **RSS**：前端 DOMParser 直接解析，同域 CORS 代理降级
- **测试**：Node test 覆盖 RSS 代理和 shownotes 清洗逻辑
- **部署**：Cloudflare Workers Static Assets + Worker 路由

## 开发

```bash
npm run dev      # Wrangler Worker 本地环境（含静态资源和 /rss-proxy）
npm run serve    # 简单静态服务：http://localhost:4173
npm run check    # 校验静态资源、manifest、JS 语法
npm test         # 运行安全相关单元测试
npm run build    # 生成 Cloudflare Workers Static Assets 目录 dist/
npm run deploy   # 本地构建并部署到 Cloudflare Workers
```

项目没有前端框架和打包依赖，`build` 只复制静态资源到 `dist/`。安全响应头和缓存策略由 Worker 统一设置，CSP 不允许 inline script/style。

## Cloudflare 部署

- Worker 名称：`podcast-shownotes`
- 静态资源目录：`dist/`（见 `wrangler.toml` 的 `[assets]`）
- RSS 代理：同域 Worker 路由 `/rss-proxy`
- 代理限流：同一个 Worker 使用 `RSS_PROXY_RATE_LIMIT`

本地手动部署：

```bash
npm run deploy
```

Cloudflare 自动化部署使用 Workers 项目连接 Git 仓库，不再通过 GitHub Actions 或 Pages 部署。构建命令使用 `npm run build`，部署命令使用 `npx wrangler@latest deploy`。Rate Limiting 绑定需要 Wrangler 4.36+；项目脚本使用 `npx wrangler@latest` 避免本地旧版本缺少该配置支持。

## 项目结构

```
├── index.html       # 主页面结构
├── app.css          # 应用样式
├── app.js           # SPA 交互逻辑
├── sanitize.js      # shownotes HTML 清洗逻辑
├── sw.js            # Service Worker
├── manifest.json    # PWA 清单
├── icon-192.png
├── icon-512.png
├── package.json     # 开发、校验、构建脚本
├── scripts/         # 构建与检查脚本
├── tests/           # proxy 与 sanitizer 安全测试
├── worker/          # Cloudflare Worker 入口和 RSS 代理逻辑
└── wrangler.toml    # Cloudflare Worker + Static Assets 配置
```
