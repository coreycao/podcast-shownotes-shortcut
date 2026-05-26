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

[https://www.icloud.com/shortcuts/37020b01657b459f970a4089bdd68a74](https://www.icloud.com/shortcuts/37020b01657b459f970a4089bdd68a74)

安装后需要在 Shortcut 设置中开启 **Share Sheet** 支持，接收类型选择 **URLs**。

### 2. 添加到主屏幕（推荐）

在 Safari 中打开 [podcast-shownotes.pages.dev](https://podcast-shownotes.pages.dev)，通过分享菜单选择"添加到主屏幕"，获得接近原生 App 的体验。

## 使用方法

1. 在 Apple Podcasts 中播放任意播客单集
2. 点击分享按钮 → 选择「播客 Shownotes」Shortcut
3. 自动跳转到该单集的 Show Notes 页面

也可以直接打开 PWA，通过搜索框搜索播客名称浏览剧集。

## 技术栈

- **前端**：纯 HTML/CSS/JS，零依赖单文件 SPA
- **PWA**：Service Worker 离线缓存，支持添加到主屏幕
- **API**：iTunes Search / Lookup API
- **RSS**：前端 DOMParser 直接解析，CORS 代理降级
- **部署**：Cloudflare Pages + Workers

## 开发

```bash
npm run dev      # Wrangler Pages 本地环境（含 /rss-proxy Function）
npm run serve    # 简单静态服务：http://localhost:4173
npm run check    # 校验静态资源、manifest、JS 语法
npm run build    # 生成 Cloudflare Pages 可部署目录 dist/
```

项目没有前端框架和打包依赖，`build` 只复制静态资源并生成 Cloudflare Pages `_headers`。

## Cloudflare 部署

- Pages 项目名：`podcast-shownotes`
- Pages 输出目录：`dist/`（见 `wrangler.toml`）
- RSS 代理：优先使用同域 Pages Function `/rss-proxy`
- 独立 Worker：`cors-proxy`，保留为代理服务的独立部署入口
- 代理限流：Pages Function 和独立 Worker 共享 `RSS_PROXY_RATE_LIMIT`

GitHub Actions 会在 `master` push 后运行检查和构建；如果仓库配置了以下 secrets，会继续部署 Pages 和 Worker：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

本地手动部署：

```bash
npm run deploy:pages
npm run deploy:worker
```

Rate Limiting 绑定需要 Wrangler 4.36+；项目脚本使用 `npx wrangler@latest` 避免本地旧版本缺少该配置支持。

## 项目结构

```
├── index.html       # 主页面（SPA）
├── sw.js            # Service Worker
├── manifest.json    # PWA 清单
├── icon-192.png
├── icon-512.png
├── package.json     # 开发、校验、构建脚本
├── scripts/         # 构建与检查脚本
├── functions/       # Cloudflare Pages Functions
├── wrangler.toml    # Cloudflare Pages 配置
├── cors-proxy/      # Cloudflare Worker — CORS 代理
│   ├── wrangler.toml
│   └── src/index.js
└── spec.md          # 详细开发规格书
```
