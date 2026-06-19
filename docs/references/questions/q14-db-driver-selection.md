---
title: "Q14"
source_url: "https://chatgpt.com/c/6a350f40-5ffc-83e8-94a5-8e3f8d130caa"
exported_at: "2026-06-19T19:39:39"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

## 结论

对你当前的 Stage 7 约束，我建议 **默认选 `better-sqlite3`**，但在 `packages/db` 内部做一层 driver adapter，避免把业务层绑定死。前提是：**不要把 Node 25 作为产品化基线**；以 Node **24 LTS** 为主测基线，Node 26 作为前瞻 CI 项。Node 官方当前发布表显示 v25 已 EOL，v24/v22 是 LTS，v26 是 Current，并明确建议生产应用使用 Active/Maintenance LTS。([Node.js][1])

`@libsql/client` 更适合未来出现明确的 **Turso/remote DB、嵌入式副本、HTTP/WS 访问、原生加密、远程同步** 需求时切入。短期本地单 Control Plane、无 remote sync、无多实例写同一 DB 的情况下，它的主要优势暂时用不上；而且本地文件模式并不是“无 native 风险”，因为它依赖 `libsql`，后者通过平台 optional dependency 分发原生二进制。([GitHub][2])

---

## 快速决策表

| 维度                  | `better-sqlite3`                                                                                                                | `@libsql/client`                                                                                                               | 对 Codex Remote 的判断                                                    |                                                      |                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------- |
| 当前本地 Control Plane  | 很适合。同步 API、单文件 SQLite、成熟本地嵌入式用法。                                                                                                | 可用，但为未来 remote/libSQL 语义付出额外复杂度。                                                                                               | **短期 `better-sqlite3` 胜出。**                                           |                                                      |                        |
| Node 25             | 最新 12.11.1 package 声明支持 Node 20/22/23/24/25/26，但 README 仍强调 prebuilt binaries 面向 LTS；非 LTS 新 Node 可能触发 node-gyp 回退。([UNPKG][3]) | 没看到同类 Node engines 限制；但本地模式依赖 `libsql` 原生平台包。                                                                                  | **不要以 Node 25 为产品基线。**                                                |                                                      |                        |
| pnpm                | 有 install script：`prebuild-install                                                                                              |                                                                                                                                | node-gyp rebuild --release`，pnpm 10/11 需显式 approve build。([UNPKG][3]) | 通常少一个 node-gyp 编译风险，但 optional native package 必须被保留。 | 源码自托管可接受；打包分发都要 CI 覆盖。 |
| macOS/Windows/Linux | 支持广，但新 Node ABI/prebuild 节奏可能出问题；Windows 回退编译成本高。                                                                               | `libsql` 声明 darwin/linux/win32、x64/arm64/arm/wasm32，并映射多个 `@libsql/*` 平台包。([UNPKG][4])                                         | 两者都不是零风险；`@libsql/client` 是“预编译平台包风险”，不是纯 JS。                         |                                                      |                        |
| Turborepo/Docker    | 适合，但必须在目标平台内 install，不能跨 OS 复制 `node_modules`。                                                                                  | 同理；还要确保 optional dependencies 没被 prune 或 bundler 丢掉。                                                                           | 用 `turbo prune --docker` 后在目标镜像内安装。([Turborepo][5])                   |                                                      |                        |
| Drizzle 集成          | Drizzle 原生支持，安装和初始化路径清晰。([Drizzle ORM][6])                                                                                      | Drizzle 原生支持，且支持 `node/http/ws/web/sqlite3` 变体。([Drizzle ORM][6])                                                              | 两者都合格。                                                                |                                                      |                        |
| 迁移                  | 标准 SQLite dialect，简单。                                                                                                           | 可用 `sqlite` 或 `turso` dialect；`file:` 前缀更敏感。([Drizzle ORM][7])                                                                 | `schema.ts` 保持 driver-neutral。                                        |                                                      |                        |
| 备份                  | 强。`db.backup()` 是 first-class API，可在线备份并报告进度。([GitHub][8])                                                                      | TS SDK 文档主要覆盖 local file、remote、replica、sync、encryption；未看到等价的本地 online backup API。可走 SQLite `VACUUM INTO`/停写复制策略。([Turso][9]) | **备份需求上 `better-sqlite3` 明显更直接。**                                     |                                                      |                        |
| 未来 remote/sync      | 无内置 remote sync。                                                                                                                | 强项：local file、remote libSQL、embedded replica；但 embedded replica 默认写远端 primary，不是本地优先写。([Turso][9])                             | 等 future sync 需求成形再切。                                                 |                                                      |                        |
| 产品化分发               | native install/build 是主要支持成本；已有 CLI 分发 issue 显示这类问题会影响自动更新工具。([GitHub][10])                                                     | optional native package/bundler inclusion 是主要风险；已有 `@libsql/linux-x64-gnu` 缺失 issue。([GitHub][11])                             | 两者都要平台矩阵测试。                                                           |                                                      |                        |

---

## Node 25 的关键点

Node 25 不应成为 Codex Remote 的“支持承诺”目标。Node 官方当前页面显示 v25 为 EOL，v24 为 LTS，v26 为 Current；并说明生产应用应使用 Active LTS 或 Maintenance LTS。([Node.js][1])

`better-sqlite3` 最新 package.json 已把 Node 25/26 放进 engines，安装脚本是 `prebuild-install || node-gyp rebuild --release`。这意味着：有预编译包时体验好；没有时会回退到本机编译。([UNPKG][3]) 它的 README 也明确写了“Prebuilt binaries are available for LTS versions”，所以非 LTS Node 的稳定性不应作为产品假设。([GitHub][12])

这不是理论风险。`better-sqlite3@12.3.0` 在 Node 25.0.0 曾因 native 编译失败被报 issue；`12.0.0` 在 Node 24 早期也出现过缺少对应 prebuild 的情况。([GitHub][13]) 这些 issue 已经关闭，但它们说明“跟随 node:latest”对 native DB driver 不适合。

建议：

```txt
产品支持矩阵：
- 必测：Node 24 LTS + macOS arm64/x64 + Linux x64/arm64 + Windows x64
- 前瞻：Node 26 Current
- 不承诺：Node 25
```

---

## pnpm + Turborepo 的实际影响

`better-sqlite3` 的安装脚本需要 pnpm build approval。pnpm 10.1+ 提供 `pnpm approve-builds`，会把允许/拒绝执行安装脚本的依赖写入 `pnpm-workspace.yaml` 的 `allowBuilds` map；`pnpm ignored-builds` 可列出被阻止的 build scripts。([pnpm][14])

建议在 monorepo 加入 CI 检查：

```bash
pnpm install --frozen-lockfile
pnpm ignored-builds
pnpm turbo test
```

Turborepo 方面，driver 选择本身不是关键，关键是 **lockfile 和目标平台安装**。Turborepo 文档说明 lockfile 对 package manager 和 turbo 的可复现行为都很关键；`turbo prune --docker` 会生成只包含目标 workspace 依赖的 pruned lockfile。([Turborepo][15])

因此不要做这些事：

```txt
不要在 macOS 安装 node_modules 后复制进 Linux Docker image。
不要在 x64 CI 产物里塞给 arm64 运行。
不要用 --no-optional 安装 @libsql/client 的本地文件模式。
```

对 `@libsql/client`，本地文件模式的风险不同：不是 `node-gyp`，而是 `libsql` 的平台 optional dependencies。`libsql@0.5.29` package.json 显示它通过 `@libsql/darwin-arm64`、`@libsql/linux-x64-gnu`、`@libsql/win32-x64-msvc` 等平台包分发 native binary。([UNPKG][4]) 这对源码安装通常友好，但对 bundler、serverless、单文件打包器、Docker prune 不一定友好；已有 issue 报告 esbuild/Lambda 产物运行时找不到 `@libsql/linux-x64-gnu`。([GitHub][11])

---

## Drizzle 集成与迁移策略

Drizzle 官方 SQLite 文档明确支持 `libsql`、`node:sqlite`、`better-sqlite3`。同时也指出 `libSQL` 能连接 SQLite 文件和 Turso remote DB，并提供更多 ALTER、原生 at-rest encryption、更多扩展支持。([Drizzle ORM][6])

对 Stage 7，我建议这样组织：

```txt
packages/db/
  src/
    schema.ts          # 唯一 schema source of truth
    client.ts          # createDb()
    repositories/      # task、device、conversation mapping 等查询封装
  drizzle/
    0000_*.sql
    meta/
  drizzle.config.ts
```

迁移流：

```bash
pnpm --filter @codex-remote/db drizzle-kit generate
# commit packages/db/drizzle/*
```

生产启动流：

```txt
1. Control Plane 获得 DB 目录锁
2. 执行启动前备份或至少记录当前 DB version
3. drizzle migrate
4. 启动 HTTP/WebSocket/API
5. Device Worker 不直接写 DB，只通过 Control Plane API/IPC 写入
```

Drizzle 迁移文档支持 codebase-first，即 TypeScript schema 作为 source of truth，并通过 `drizzle-kit generate/migrate/push/pull` 管理迁移。([Drizzle ORM][16]) Drizzle config 也支持多配置文件和自定义 migrations 输出目录；这适合你未来区分 dev/test/prod、本地/remote。([Drizzle ORM][7])

`better-sqlite3` 配置示例：

```ts
// packages/db/drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: "./data/codex-remote.db",
  },
});
```

`@libsql/client` 本地文件配置需要注意 `file:` 前缀：

```ts
export default defineConfig({
  dialect: "turso",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: "file:./data/codex-remote.db",
  },
});
```

Drizzle config 文档明确给出 SQLite/Turso 的 local file URL 写法，并标注 libsql 需要 `file:` 前缀。([Drizzle ORM][7])

---

## 备份与恢复

这部分是我倾向 `better-sqlite3` 的主要原因之一。

`better-sqlite3` 有官方 `.backup(destination, options)`，返回 promise；文档说明备份文件就是普通 SQLite DB 文件，可继续打开使用，并且备份期间数据库可以继续使用。文档同时建议做在线备份时最好只有一个连接负责写入。([GitHub][8])

SQLite 官方 Online Backup API 的目标也是在线复制数据库，避免长时间锁住源 DB；官方还列出 `VACUUM INTO` 可创建 live SQLite database 的 vacuumed copy。([SQLite][17])

Codex Remote 建议：

```txt
backup/
  2026-06-19T12-00-00Z.codex-remote.db
  2026-06-19T12-00-00Z.manifest.json
```

`manifest.json` 建议包含：

```json
{
  "appVersion": "0.x.y",
  "dbSchemaVersion": "0007",
  "driver": "better-sqlite3",
  "sqlitePragmas": {
    "journal_mode": "WAL",
    "foreign_keys": "ON"
  },
  "createdAt": "2026-06-19T12:00:00.000Z"
}
```

如果改用 `@libsql/client`，本地备份策略要更保守：先保证没有写事务，执行 checkpoint 或使用 `VACUUM INTO`，再生成 manifest。它可做，但没有 `better-sqlite3` 那种在 Node 侧很直接的 `.backup()` 入口。

---

## future sync / remote 的判断

`@libsql/client` 的价值在未来，而不是你描述的短期。

Turso TS SDK 文档说明 `@libsql/client` 可用于本地 SQLite 文件、remote Turso/libSQL，并支持 embedded replicas；同时明确 embedded replica 模式下读本地、写发送到 cloud primary 后再反映回本地。([Turso][9]) Embedded Replicas 文档也写明：默认写入远端 primary，不是先写本地文件；若需要 offline writes、bidirectional sync 或 multi-writer convergence，Turso 文档建议看 `@tursodatabase/sync`。([Turso][18])

所以，不要因为“长期可能需要同步”就现在换成 `@libsql/client`。更稳妥的判断条件是：

```txt
继续用 better-sqlite3，直到出现以下任一真实需求：
1. 用户需要把 Control Plane DB 放到 Turso/libSQL remote；
2. 需要 embedded replica；
3. 需要同一套 Drizzle repository 同时跑本地文件和 HTTP/WS remote；
4. 需要 libSQL 原生 at-rest encryption；
5. 产品分发策略证明 better-sqlite3 的 node-gyp/prebuild 支持成本不可接受。
```

另外，libSQL 本身不是“解决多写者”的银弹。libSQL README 说明它是 SQLite fork，扩展了 embedded replicas 和 remote access，但继承 SQLite 的 single-writer 模型；Turso Database 是另一个 Rust 重写项目，当前仍标为 beta。([GitHub][19])

---

## 建议的最终方案

### 1. Stage 7 默认 driver

```bash
pnpm --filter @codex-remote/db add drizzle-orm better-sqlite3
pnpm --filter @codex-remote/db add -D drizzle-kit @types/better-sqlite3
```

Drizzle 官方也给出了 `pnpm add drizzle-orm better-sqlite3` 与 `@types/better-sqlite3` 的路径。([Drizzle ORM][6])

### 2. DB API 不暴露 driver

业务层不要直接 import `better-sqlite3`：

```ts
// packages/db/src/client.ts
export type DbDriver = "better-sqlite3" | "libsql";

export interface CreateDbOptions {
  driver?: DbDriver;
  path: string;
}

export async function createDb(options: CreateDbOptions) {
  switch (options.driver ?? "better-sqlite3") {
    case "better-sqlite3":
      return createBetterSqliteDb(options.path);
    case "libsql":
      return createLibsqlDb(`file:${options.path}`);
  }
}
```

`repositories/*` 只接收 Drizzle db 对象，不感知 driver。

### 3. CI matrix

```yaml
node:
  - 24
  - 26

os:
  - ubuntu-latest
  - macos-latest
  - windows-latest
```

Node 25 可以作为临时兼容性观察项，但不应进入 support policy。

### 4. 分发策略

源码自托管：

```txt
better-sqlite3 可接受。
文档写清：Node 24 LTS、pnpm install、pnpm approve-builds。
```

Docker 自托管：

```txt
推荐。
在 Linux image 内 pnpm install，不复制宿主 node_modules。
```

桌面/单文件/自动更新分发：

```txt
两者都要额外验证。
better-sqlite3 风险是 native addon rebuild/prebuild。
@libsql/client 风险是 optional native package 被 bundler/pruner 漏掉。
```

---

## 最终判断

**当前选 `better-sqlite3`。**

理由很集中：你的短期需求是本地 Control Plane、任务看板、conversation 映射、迁移、备份、单实例写入；`better-sqlite3` 在这些点上更直接，Drizzle 集成成熟，备份 API 更好，运行时语义更简单。`@libsql/client` 是未来 remote/sync 产品形态的好候选，但现在引入会把“未来可能用到的能力”提前变成“当前必须处理的 optional native/bundler/URL/remote 语义复杂度”。

保留切换能力即可：`schema.ts` 和 migrations 放在 `packages/db`，业务查询走 repository 层，driver 只在 `createDb()` 和 backup adapter 里出现。

[1]: https://nodejs.org/en/about/previous-releases "Node.js — Node.js Releases"
[2]: https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/package.json "libsql-client-ts/packages/libsql-client/package.json at main · tursodatabase/libsql-client-ts · GitHub"
[3]: https://app.unpkg.com/better-sqlite3%4012.11.1/files/package.json "UNPKG"
[4]: https://app.unpkg.com/libsql%400.5.29/files/package.json?utm_source=chatgpt.com "libsql"
[5]: https://turbo.build/repo/docs/guides/tools/docker "Docker"
[6]: https://orm.drizzle.team/docs/get-started-sqlite "Drizzle ORM - SQLite"
[7]: https://orm.drizzle.team/docs/drizzle-config-file "Drizzle ORM - drizzle.config.ts"
[8]: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md "better-sqlite3/docs/api.md at master · WiseLibs/better-sqlite3 · GitHub"
[9]: https://docs.turso.tech/sdk/ts/reference "Reference - Turso"
[10]: https://github.com/WiseLibs/better-sqlite3/issues/1367 "Issues distributing a node CLI that uses better-sqlite3 as a dependency · Issue #1367 · WiseLibs/better-sqlite3 · GitHub"
[11]: https://github.com/tursodatabase/libsql-client-ts/issues/112 "\"Runtime.ImportModuleError: Error: Cannot find module '@libsql/linux-x64-gnu\" when bundling with esbuild for aws lambda · Issue #112 · tursodatabase/libsql-client-ts · GitHub"
[12]: https://github.com/WiseLibs/better-sqlite3 "GitHub - WiseLibs/better-sqlite3: The fastest and simplest library for SQLite3 in Node.js. · GitHub"
[13]: https://github.com/WiseLibs/better-sqlite3/issues/1411 "better-sqlite3 12.3.0 fails to build on Node.js latest (25) · Issue #1411 · WiseLibs/better-sqlite3 · GitHub"
[14]: https://pnpm.io/cli/approve-builds "pnpm approve-builds | pnpm"
[15]: https://turbo.build/repo/docs/crafting-your-repository/structuring-a-repository "Structuring a repository"
[16]: https://orm.drizzle.team/docs/migrations "Drizzle ORM - Migrations"
[17]: https://sqlite.org/backup.html?utm_source=chatgpt.com "SQLite Backup API"
[18]: https://docs.turso.tech/features/embedded-replicas/introduction "Embedded Replicas - Turso"
[19]: https://github.com/tursodatabase/libsql "GitHub - tursodatabase/libsql: libSQL is a fork of SQLite that is both Open Source, and Open Contributions. · GitHub"
