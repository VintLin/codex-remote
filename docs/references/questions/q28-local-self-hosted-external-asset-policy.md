---
title: "Q28：Local self-hosted external asset policy"
source_url: "https://chatgpt.com/c/6a364e9f-7c70-83ee-93d7-a4867e0b2b81"
exported_at: "2026-06-20T17:08:47"
open_method: "anchor"
clicked_copy: "False"
used_fallback_text: "True"
---

最小可用决策

本地 self-hosted 控制台的生产版本，应禁止外部字体和静态 UI asset 请求。
默认用 system fonts；只有在确实需要品牌一致性或跨平台排版一致性时，才使用 vendored WOFF2 + next/font/local。不要在运行时加载 fonts.googleapis.com、fonts.gstatic.com、CDN CSS、远程图标库或远程 JS。next/font/google 可以消除浏览器运行时到 Google 的请求，但会在构建时下载 CSS/font；对“可离线构建 / 可复现供应链”的 self-hosted 产品，仍优先 next/font/local 或 system fonts。Next.js 官方说明 next/font 会移除外部网络请求，Google Fonts 的 CSS/font 会在构建时下载并随静态资源自托管，浏览器不会请求 Google。
Next.js

1. 本地 self-hosted 控制台允许外部字体请求的风险

风险不是字体文件本身，而是“本地控制台启动时对第三方发出静态资源请求”。 对 Codex Remote 这类本地控制台，外部字体请求会造成以下问题：

风险 影响
隐私泄露 Google Fonts 官方说明，嵌入 Web API 时，Google 会收到用户 IP、请求 URL、HTTP headers，包括 user agent 和 referer；虽然 Google Fonts 不设置或记录 cookies，也称不会用于用户画像或广告，但请求本身仍会暴露访问事实和环境信息。
Google for Developers

本地产品使用痕迹泄露 如果 referer/origin 暴露 localhost、端口或路径，第三方可观察到该本机控制台的启动时间、使用频率、浏览器/OS 信息。对本地开发工具尤其不合适。
离线/内网不可用 self-hosted/offline 产品的 UI 不应依赖互联网。离线 Web 应用的基本原则是关键 UI 资源应本地可用；本地缓存可支撑离线运行和响应速度。
MDN Web Docs

供应链和变更面 远程 CSS @import 不是固定资产；外部 CSS 可继续拉字体、图片等资源。CSP 的 style-src 会约束 stylesheet 和 @import，MDN 示例明确显示不被允许的远程 @import 会被阻止。
MDN Web Docs

合规和企业环境阻断 企业代理、DLP、防火墙可能阻断 fonts.googleapis.com / CDN，导致控制台首屏字体或样式异常。
安全边界混淆 本地控制台通常被用户理解为“本机服务”。静态 UI 资产出网会削弱产品承诺，也增加审计成本。

补充：system fonts 本身也有字体指纹问题，因为安装字体列表或字体度量可参与浏览器指纹识别；W3C 也指出检查系统字体列表可用于 fingerprinting。但这与“主动向第三方发请求”不同。最小方案是使用常见系统字体栈，不做 Local Font Access、不枚举字体、不用 @font-face local() 探测稀有字体。
W3C

2. system fonts vs vendored fonts vs next/font 的取舍
方案 优点 缺点 适用决策
system fonts 零字体文件、零字体网络请求、最快、最小供应链、天然离线 各平台观感不完全一致；品牌感弱 默认首选。本地控制台、开发工具、管理 UI 足够。
vendored fonts + next/font/local 运行时离线；字体一致；可审计 license、hash、版本 增加包体；需要 license 管理；CJK 字体体积可能很大 需要固定品牌字体、monospace 精确排版、截图一致性时使用。Next.js 支持 next/font/local 指向本地字体文件。
Next.js

next/font/google 浏览器不再请求 Google；Next 自动优化、自托管、减少 layout shift 构建时会下载 Google Fonts；离线构建/可复现构建不理想；仍引入外部上游依赖 只适合“CI 构建允许联网、交付物运行时离线”的场景。对严格 self-hosted/offline readiness，不作为首选。Next 官方说明 Google Fonts CSS/font 在 build time 下载并随静态资产自托管。
Next.js

外部 @import / <link> Google Fonts/CDN 实现最快 运行时出网、隐私泄露、离线失败、CSP 需要放开外部域 不应使用。

推荐字体栈：

CSS
:root {
 --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
 "Noto Sans", "Helvetica Neue", Arial, sans-serif;
 --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
 "Liberation Mono", "Courier New", monospace;
}

body {
 font-family: var(--font-sans);
}

code,
pre,
kbd,
samp {
 font-family: var(--font-mono);
}

如需 vendored font：

TypeScript
import localFont from "next/font/local";

export const appSans = localFont({
 src: "./fonts/Inter-Variable.woff2",
 variable: "--font-sans",
 display: "swap",
});

同时提交 LICENSE / NOTICE，并避免引入完整 CJK 字库，除非确有必要。

3. 最小改动建议：是否删除外部 @import，是否需要 CSP

结论：删除外部 @import；需要 CSP。

最小 PR 建议：

删除所有类似内容：

CSS
@import url("https://fonts.googleapis.com/css2?...");

/* 或 */
@import "https://fonts.googleapis.com/...";

删除 HTML/head 中的外部字体 link：

HTML
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com">
<link href="https://fonts.googleapis.com/css2?..." rel="stylesheet">

改成 system fonts；如必须保留特定字体，改为 next/font/local vendored WOFF2。

加生产 CSP。CSP 的作用是把“无外部静态 asset 请求”从代码约定变成浏览器强制策略；MDN 说明 CSP 可控制页面允许加载的资源来源，OWASP 也给出同源资源的基础策略示例。
MDN Web Docs
+1

Next.js 最小生产 CSP 示例：

JavaScript
// next.config.js
const csp = [
 "default-src 'self'",
 // 最小可用：如果当前 Next 构建不支持严格 nonce，可先保留 unsafe-inline。
 // 更严格版本应改 nonce/hash，但那是下一阶段安全加固。
 "script-src 'self' 'unsafe-inline'",
 "style-src 'self' 'unsafe-inline'",
 "img-src 'self' data: blob:",
 "font-src 'self'",
 "connect-src 'self'",
 "object-src 'none'",
 "base-uri 'self'",
 "form-action 'self'",
 "frame-ancestors 'none'",
].join("; ");

module.exports = {
 async headers() {
 return [
 {
 source: "/(.*)",
 headers: [
 {
 key: "Content-Security-Policy",
 value: csp,
 },
 ],
 },
 ];
 },
};

如果 UI 和后端不是同源，例如前端在 localhost:3000，API/WebSocket 在 127.0.0.1:1455，不要放宽到任意外部域，只显式加入本地 allowlist：

connect-src 'self' http://127.0.0.1:1455 ws://127.0.0.1:1455 http://localhost:1455 ws://localhost:1455

注意两点：

不要在 font-src 加 https://fonts.gstatic.com，也不要在 style-src 加 https://fonts.googleapis.com。MDN 的 font-src 定义就是限制 @font-face 字体来源。
MDN Web Docs

如果后续做更严格 CSP，可以用 nonce/hash。Next.js 官方说明 nonce 可用于允许特定 inline script/style，但 nonce 会要求动态渲染，并影响静态优化和缓存；因此它不是“最小改动”，而是后续 hardening。
Next.js

4. 如何验证离线启动和 Network panel 无外部请求

手动验证

先跑生产构建，不要只测 dev server：

Bash
pnpm build
pnpm start

断开互联网，但保留 loopback。不要优先用 Chrome Network 的 “Offline” 模拟，因为它可能影响本地请求；更可靠的是断 Wi-Fi、禁用外网路由，或用防火墙阻断非 loopback egress。

打开：

http://127.0.0.1:<port>

Chrome DevTools → Network：

勾选 Preserve log，Chrome 官方文档说明它会跨页面加载保留请求记录。
Chrome for Developers

勾选 Disable cache。

Hard reload。

观察 Domain/Name/Initiator。

期望只看到 127.0.0.1、localhost、同源 /_next/static/...、本地 API/WebSocket。

不应出现：fonts.googleapis.com、fonts.gstatic.com、cdn.jsdelivr.net、unpkg.com、cdnjs.cloudflare.com、外部图片域、外部 analytics。

控制台不应出现 CSP violation 以外的功能错误。若 CSP 阻止了外部字体请求，说明代码中仍残留外部引用；应删引用，而不是放宽 CSP。

静态扫描

Bash
grep -RInE "fonts\.googleapis|fonts\.gstatic|@import\s+url\(https?://|https://(cdn|unpkg|jsdelivr|cdnjs)" \
 app pages components src public styles .

还应检查：

Bash
grep -RInE "<link[^>]+https?://|<script[^>]+https?://|url\(https?://" \
 app pages components src public styles .

自动化回归测试

用 Playwright 记录所有请求，非 loopback 一律失败。Playwright 官方说明可监控、修改和处理页面发出的 HTTP/HTTPS 请求；如果使用 route 且 Service Worker 影响事件，可禁用 Service Worker。
Playwright
+1

TypeScript
import { test, expect } from "@playwright/test";

test("local console makes no external static asset requests", async ({ browser }) => {
 const context = await browser.newContext({
 serviceWorkers: "block",
 });

 const page = await context.newPage();
 const external: string[] = [];

 page.on("request", (request) => {
 const url = request.url();

 if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("ws://") && !url.startsWith("wss://")) {
 return;
 }

 const u = new URL(url);
 const isLoopback =
 u.hostname === "localhost" ||
 u.hostname === "127.0.0.1" ||
 u.hostname === "::1";

 if (!isLoopback) {
 external.push(url);
 }
 });

 await page.goto("http://127.0.0.1:3000", {
 waitUntil: "networkidle",
 });

 expect(external).toEqual([]);
});

如果只要求“运行时离线”，测试已构建产物即可。
如果要求“源码构建也可离线”，还要在 CI 中增加无外网 pnpm build；此时不应使用 next/font/google，因为它的 Google Fonts CSS/font 下载发生在 build time。
Next.js

5. 产品 readiness 中该如何表述

建议在 readiness / release checklist 中这样写：

Static UI asset egress policy: Codex Remote 的本地 Web 控制台在生产运行时不依赖第三方字体、CDN、图片或脚本资源。UI shell 的字体和静态资源由本地实例提供，或使用系统字体。生产 CSP 限制 font-src、style-src、script-src、img-src、connect-src 到同源或显式本地 loopback allowlist。CI 包含离线启动 smoke test 和 no-external-request 回归测试。
该声明仅覆盖 UI 静态资产加载；用户显式配置的模型/API/更新检查等网络行为应单独列为产品功能和安全例外。

Readiness 验收项可写成：

项 标准
外部字体 无 fonts.googleapis.com / fonts.gstatic.com 运行时请求
外部静态 asset 无第三方 CSS/JS/image/icon/CDN 请求
字体策略 默认 system fonts；如使用 custom font，必须 vendored WOFF2 + license
CSP 生产环境启用；font-src 'self'；无 Google Fonts/CDN allowlist
离线启动 断网后本地控制台首屏可加载、核心 UI 可操作
自动化测试 Playwright 或等价测试捕获请求，非 loopback 请求失败
例外机制 任何外部 endpoint 必须是显式产品功能、可配置、可关闭、文档化，并经过安全评审

最终建议： 先用 system fonts，删除外部 @import，加生产 CSP，增加 no-external-request 测试。vendored fonts 只在产品视觉一致性明确需要时再引入；next/font/google 不作为严格 self-hosted/offline 的默认方案。
