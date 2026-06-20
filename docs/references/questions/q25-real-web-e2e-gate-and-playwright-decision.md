---
title: "Q25：Real Web E2E gate and Playwright decision"
source_url: "https://chatgpt.com/c/6a364db2-05dc-83ee-89db-1b38d84ecf31"
exported_at: "2026-06-20T17:08:23"
open_method: "anchor"
clicked_copy: "False"
used_fallback_text: "True"
---

1. 是否值得引入 Playwright

建议：引入 Playwright，但只作为 Stage 9 的必需 Web E2E smoke gate；不要把它扩展成常规 E2E 测试框架，也不要放进普通 test。

理由很直接：你现在的 HTTP-only real:check 能证明 API/后端链路活着，但不能证明浏览器实际加载了正确 Web env、fallback banner 行为正确、start UI 可交互、hydration 后 DOM state 正确。Next.js 官方把 E2E 定义为在类似真实用户场景的浏览器环境中测试用户流，并且其 Playwright 指南建议对 production code 运行测试以更接近应用真实行为；Playwright 也提供 web-first assertions，会等待 UI 条件达成，而不是做一次性 DOM 查询。
Next.js
+2
Next.js
+2

对本项目的判断：

Stage 9 完成条件需要 Playwright 级别的真实浏览器证明。 因为目标不是“API 能回 200”，而是证明 Web -> Control Plane -> Worker -> Codex app-server 这条链在用户入口上可用。

现有 ActionBook/Chrome/manual smoke 可继续保留，但只能作为 bootstrap/debug/runbook，不应作为最终 CI 绿灯。 它能帮助人工确认 UI，但很难稳定、可复现、可审计地证明 DOM state、network accept、follow-up accept。

不要引入完整测试文化负担。 只做 Chromium-only、1 个 spec、3-5 个断言点、独立命令、独立 CI job。Playwright 官方支持只跑指定 project、单文件、headed/debug/UI 模式，本项目只需要 headless Chromium smoke。
Playwright
+1

结论：Playwright 值得引入，但边界必须很窄：web:e2e:smoke 是 Stage 9 证据，不是普通回归套件。

2. 最小 Web E2E 覆盖

最小覆盖应是一个 happy path spec，不做跨浏览器、不做视觉快照、不做长对话。目标是“证明真实 Web shell 和后端链路握手成功”。

建议覆盖这些状态：

A. loaded / empty / example banner

断言：

TypeScript
await page.goto('/');

await expect(page.getByTestId('codex-remote-root')).toBeVisible();
await expect(page.getByTestId('remote-env-loaded')).toHaveText(/loaded|connected|ready/i);

await expect(page.getByTestId('empty-state')).toBeVisible();
await expect(page.getByTestId('example-banner')).toBeVisible();
await expect(page.getByTestId('fallback-banner')).not.toBeVisible();

这里不要只检查页面标题或根节点。要检查 remote env 已注入、空会话状态存在、example banner 存在、fallback banner 没有误出现。Playwright 官方建议优先使用面向用户的 role/name locator 和显式契约，例如 getByRole()；对这种内部状态，稳定的 data-testid 也合理。
Playwright

B. start conversation

断言用户真的通过 UI 发起会话，而不是 API 单独成功：

TypeScript
const runId = `stage9-${Date.now()}`;

await page.getByRole('textbox', { name: /message|prompt|ask/i }).fill(`Stage 9 smoke ${runId}`);
await page.getByRole('button', { name: /start|send|submit/i }).click();

const startResponse = await page.waitForResponse((res) =>
 res.url().includes('/api/') &&
 /conversation|thread|message|control-plane|remote/i.test(res.url()) &&
 res.status() >= 200 &&
 res.status() < 300
);

await expect(page.getByTestId('conversation-thread')).toBeVisible();
await expect(page.getByText(runId)).toBeVisible();
await expect(page.getByTestId('conversation-status')).toHaveText(/accepted|queued|running|started/i);

关键点：必须同时有 network accept 和 DOM transition。只断言 textarea 清空、button disabled、页面未崩溃都容易伪绿。

C. follow-up accepted

断言同一个 thread 能接受第二轮输入：

TypeScript
await page.getByRole('textbox', { name: /message|prompt|ask/i }).fill(`Follow-up ${runId}`);
await page.getByRole('button', { name: /send|submit/i }).click();

await page.waitForResponse((res) =>
 res.url().includes('/api/') &&
 /message|follow|thread|control-plane/i.test(res.url()) &&
 res.status() >= 200 &&
 res.status() < 300
);

await expect(page.getByText(`Follow-up ${runId}`)).toBeVisible();
await expect(page.getByTestId('follow-up-status')).toHaveText(/accepted|queued|running/i);

这一步是必要的：start conversation 只能证明 initial path；follow-up 能证明 thread/session state 没断，Web DOM、Control Plane routing、Worker/app-server conversation state 至少通过一次续写。

3. 如果引入 Playwright：依赖放哪、命令怎么命名、如何隔离慢测试
依赖位置

首选：放在独立 e2e package，而不是 root，也不是 app-server。

例如：

tooling/playwright-web/
 package.json
 playwright.config.ts
 tests/stage9-smoke.spec.ts

package 名：

JSON
{
 "name": "@repo/playwright-web",
 "private": true,
 "dependencies": {
 "@repo/web": "workspace:*"
 },
 "devDependencies": {
 "@playwright/test": "^1.x"
 }
}

Turborepo 官方建议在 monorepo 中为每个 Playwright test suite 建一个 Playwright package；不确定时，从 per-application package 开始。它还建议让 e2e package 依赖被测应用 package，以便应用代码变化时 e2e cache/hash 能正确失效。
Turborepo

如果 repo 结构非常简单，也可以把 @playwright/test 作为 apps/web 的 devDependency，但我不推荐作为首选。Stage 9 smoke 是跨 Web -> Control Plane -> Worker -> app-server 的验收，不只是 Web 组件测试；独立 package 更清楚，也避免污染 web app 的普通 dev/test 依赖。

命令命名

不要叫 test，不要默认跑。

tooling/playwright-web/package.json：

JSON
{
 "scripts": {
 "smoke:stage9": "playwright test --config=playwright.config.ts --project=chromium --grep @stage9-smoke --workers=1"
 }
}

root package.json：

JSON
{
 "scripts": {
 "test": "turbo run test",
 "smoke:stage9:web": "turbo run smoke:stage9 --filter=@repo/playwright-web --only"
 }
}

Turborepo 官方建议在 root package.json 和 CI 中使用 turbo run，并支持按 package/filter 执行任务。
Turborepo

playwright.config.ts
TypeScript
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
 testDir: './tests',
 timeout: 60_000,
 expect: { timeout: 10_000 },
 forbidOnly: !!process.env.CI,
 retries: process.env.CI ? 1 : 0,
 workers: 1,
 reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

 use: {
 baseURL,
 trace: 'retain-on-failure',
 screenshot: 'only-on-failure'
 },

 projects: [
 {
 name: 'chromium',
 use: { ...devices['Desktop Chrome'] }
 }
 ],

 webServer: process.env.PLAYWRIGHT_BASE_URL
 ? undefined
 : {
 command: 'pnpm --filter @repo/web build && pnpm --filter @repo/web start',
 url: baseURL,
 reuseExistingServer: !process.env.CI,
 timeout: 120_000
 }
});

Playwright 支持 webServer 启动本地 server，并且 reuseExistingServer: !process.env.CI 是官方文档给出的常见配置；Next.js 也说明可以用 webServer 让 Playwright 启动开发/应用 server 并等待可用。
Playwright
+2
Playwright
+2

turbo.json
JSON
{
 "tasks": {
 "smoke:stage9": {
 "dependsOn": ["^build"],
 "cache": false,
 "outputs": [],
 "passThroughEnv": [
 "PLAYWRIGHT_*",
 "CODEX_REMOTE_*",
 "CONTROL_PLANE_*",
 "WORKER_*",
 "APP_SERVER_*"
 ]
 }
 }
}

这里建议 cache: false。Stage 9 smoke 依赖真实 remote/control-plane/worker/app-server 状态，不应被 Turborepo cache 复用成绿灯。Turborepo 文档说明 cache: false 适合需要始终运行的任务；Playwright 的 Turborepo 指南也建议为 e2e task 明确传递 PLAYWRIGHT_* 环境变量。
Turborepo
+1

CI 安装

只在 Stage 9 smoke job 里安装浏览器：

Bash
pnpm install --frozen-lockfile
pnpm --filter @repo/playwright-web exec playwright install --with-deps chromium
pnpm smoke:stage9:web

Playwright 官方 CI 文档建议在 CI 中安装浏览器和系统依赖，例如 npx playwright install --with-deps；也明确说缓存 browser binaries 通常不推荐，因为恢复缓存的时间常与下载接近，且 Linux 系统依赖不能缓存。
Playwright
+1

4. 如果不引入 Playwright：最小替代方案如何防止伪绿灯

不引入 Playwright 时，最低可接受方案不是“人工看一下页面”。必须把现有 ActionBook/Chrome/manual smoke 变成有证据的浏览器探针。

最小替代方案：

继续保留 real:check，但它只能是后端链路 probe。

校验 Control Plane、Worker、app-server API。

输出 run id、thread id、worker id、app-server endpoint。

结果必须和浏览器 smoke 使用同一个 correlation id。

用真实 Chrome 执行 Web runbook。

可以是 ActionBook 驱动现有 Chrome。

或者用已安装 Chrome + CDP 的极简 Node 脚本。

不要用 curl、JSDOM、HTML grep 替代；这些仍然不能证明 hydration、client env、DOM transition、button/actionability。

必须保存证据 artifact。

初始页面 screenshot。

start conversation 后 screenshot。

follow-up 后 screenshot。

DOM snapshot：至少包含 data-testid 状态节点。

Network log：至少包含 start 和 follow-up 的 2xx request/response。

必须有反伪绿断言。

页面根节点存在不算通过。

必须断言 fallback-banner 在正常路径不可见。

必须断言 remote-env-loaded 或等价状态可见。

必须断言 unique runId 出现在 DOM。

必须断言 start API 和 follow-up API 都返回 2xx。

必须断言 conversation/thread id 出现在 URL、DOM 或 captured response 中。

必须 fail on fatal pageerror / uncaught exception。

必须 fail on target API 5xx/401/403。

必须 fail if follow-up 只是清空输入框但没有 accepted/running/queued 状态。

这能把 manual smoke 从“人工确认”提升到“可审计 smoke”。但代价是你会自己维护 wait/retry、selector、network 捕获、artifact、Chrome 启动和错误归因。Playwright 已经内建 test runner、assertions、isolation、parallelization 和 tooling；对一个最小 smoke 来说，自己重造这些通常不划算。
Playwright
+1

5. 最终建议和退出条件
最终建议

采用 Playwright，范围限定为 Stage 9 Web E2E smoke。

保留三层检查：

unit/integration tests
 └─ 普通 pnpm test / turbo run test，不包含 Playwright

HTTP real:check
 └─ 证明 Control Plane / Worker / app-server API 链路

Playwright smoke:stage9:web
 └─ 证明真实 Web -> Control Plane -> Worker -> Codex app-server 用户链路

具体落地：

tooling/playwright-web/tests/stage9-smoke.spec.ts

测试标题加 tag：

TypeScript
test('Stage 9 Web remote smoke @stage9-smoke', async ({ page }) => {
 // loaded / empty / example banner
 // start conversation accepted
 // follow-up accepted
});

普通测试命令不变：

Bash
pnpm test

Stage 9 专用命令：

Bash
pnpm smoke:stage9:web
Stage 9 可退出条件

Stage 9 不应只看 CI 绿。建议退出条件是：

real:check 通过，并输出本次 run 的 control-plane / worker / app-server 证据。

smoke:stage9:web 在 CI headless Chromium 通过，且使用 production build 或真实 deploy URL。

初始 Web state 被证明：remote env loaded、empty state visible、example banner visible、fallback banner normal path 不可见。

start conversation 被证明：UI 发起，Control Plane/API 2xx，DOM 出现 run id，conversation status 进入 accepted/queued/running。

follow-up accepted 被证明：同一 thread/session 接受第二条消息，DOM 和 network 都有证据。

失败时有 artifact：trace、screenshot、DOM snapshot、network log。

普通 test 不受污染：Playwright 只在 smoke:stage9:web 或 release/stage9 CI job 中运行。

负向 sanity check 至少跑过一次：禁用 Web env 或强制 fallback 时，smoke 必须失败；否则仍可能是伪绿灯。

什么时候可以先不引入 Playwright

只有在下面条件同时满足时，才建议短期不引入：

Stage 9 当前目标只是人工 demo，不是 CI/release gate。

已有 ActionBook/Chrome runbook 能稳定产出 screenshot、DOM snapshot、network log。

real:check 与 browser smoke 共用 correlation id。

manual smoke 失败会阻断 Stage 9，而不是作为“备注”。

即便如此，退出 manual-only 的条件应写清楚：一旦 Stage 9 变成 PR gate、release gate、nightly gate，或出现一次 Web env/fallback/DOM state 回归但 real:check 仍绿，就应立即切到 Playwright smoke。
