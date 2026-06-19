---
title: "Q10：DB 选型调研建议"
source_url: "https://chatgpt.com/c/6a34fefb-1558-83ee-89e5-b3f33992f794"
exported_at: "2026-06-19T17:07:10"
method: "system-clipboard"
clicked_copy: "True"
warnings:
---

## 结论

对 **Codex Remote** 这个阶段，我建议默认选：

**SQLite + Drizzle，放在 `packages/db`，以 Drizzle schema 作为持久化 schema 的唯一作者源，生成并提交 SQL migrations。**

更具体地说：

**首选：SQLite + Drizzle + `better-sqlite3` 或 `@libsql/client`**
其中我更倾向于：

* **本地优先、最少复杂度**：`better-sqlite3`
* **想给未来 Turso/libSQL remote/replica 留通道**：`@libsql/client`，先用 `file:` 本地 SQLite

不建议现在直接上 PostgreSQL、Prisma、rqlite、LiteFS、PGlite 或 Turso Sync 作为默认方案。它们都有合理场景，但会提前引入你当前并不需要的运维面、同步语义或生成层复杂度。

---

## 为什么是 SQLite

你的项目是“自托管本地/小团队 + 多设备 Web 控制台”。关键是：**多设备不是多台机器直接写同一个 SQLite 文件**，而是多台浏览器/设备连到同一个 Codex Remote 服务，由服务端串行/集中访问数据库。

这正好落在 SQLite 的强项里。SQLite 官方把它定位为本地数据存储，强调可靠、简单、无需独立数据库服务；也明确说它适合中低流量网站，保守估计每天 10 万 hits 以下通常没有问题。它的边界也很清楚：不要让很多机器通过网络文件系统同时直接访问同一个 DB 文件；如果需要多个服务端高并发写入，应该选 client/server DB。SQLite 同时支持无限读者，但同一时间只有一个写者；对任务看板、设备注册、conversation 映射、审计事件这类低写入密度数据，通常不是瓶颈。([SQLite][1])

实际部署上，SQLite 的优势是明显的：一个文件、无数据库守护进程、备份简单、迁移/测试成本低。开启 WAL 后，读不会阻塞写、写也不会阻塞读，但 WAL 不适合放在网络文件系统上，这进一步支持“一个自托管服务进程拥有本地 DB 文件”的部署模型。([SQLite][2])

---

## Drizzle vs Kysely：核心差别

### 1. 你的“唯一事实源”要求更贴近 Drizzle

Drizzle 的文档明确支持 **codebase-first** 流程：用 TypeScript 写 Drizzle schema，Drizzle Kit 读取 schema，生成 SQL migration，再执行 migration。它还支持 `generate`、`migrate`、`push`、`pull` 等命令；团队场景下常见流程是生成 SQL migration、提交到仓库、部署时迁移。([Drizzle ORM][3])

这和你的原则非常匹配：

```ts
// packages/db/src/schema/devices.ts
export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
});

export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
```

也就是说，业务类型可以显式从 schema 派生，而不是手写 DTO。Drizzle 的 SQLite 文档也覆盖了 SQLite 类型映射，包括 `integer` 的 boolean/timestamp 模式、`text` enum、JSON 映射和 `$type<>` 这类编译期类型约束。([Drizzle ORM][4])

严格说，这里的“唯一事实源”是：**`packages/db/src/schema` 是持久化结构的唯一作者源，`migrations/` 是它生成出来并经 review 的数据库变更记录**。这比“运行中的数据库 introspection 才是唯一事实源”更适合 monorepo、CI、代码评审和类型派生。

### 2. Kysely 更像“类型安全 SQL builder”，不是 schema-first ORM

Kysely 的强项是轻量、SQL 风格、类型安全 query builder。它官方也说自己是 thin abstraction，接近 SQL，编译结果和你写的 SQL 结构基本一一对应；它还支持 SQLite、PostgreSQL、MySQL、MSSQL、PGlite 等 dialect。([Kysely][5])

但 Kysely 默认要求你提供 `Database` TypeScript 类型。官方建议生产应用自动生成数据库 schema 类型，常用方式是 `kysely-codegen` 从数据库 introspect 生成类型。([Kysely][6])

这就带来一个额外闭环：

```text
SQL migrations / live DB
        ↓ introspect
kysely-codegen
        ↓
generated Database types
        ↓
Kysely queries
```

`kysely-codegen` 有 `--verify`，可以在 CI 中检查生成类型是否最新；这很好，但它是一个额外生成步骤。([GitHub][7])

Kysely 的 migration 也可用，但更偏手写迁移：你写 `up/down`，用 `db.schema.createTable()` 或 SQL 执行，再通过 migrator 跑到最新版本。它也允许自定义 `MigrationProvider`，所以灵活，但没有 Drizzle 那种从 TS schema diff 生成 SQL migration 的默认体验。([Kysely][8])

**所以：如果你特别坚持“数据库实际结构/SQL migrations 是唯一事实源，TypeScript 类型必须由 DB introspection 生成”，Kysely + SQL migrations + `kysely-codegen --verify` 是更纯的选择。**
但对 Codex Remote 当前阶段，它比 Drizzle 多一个 codegen 产物和校验步骤，schema 演进成本更高。

---

## 逐项比较

| 维度           |                     SQLite + Drizzle |                     SQLite + Kysely | PostgreSQL + Drizzle/Kysely |      Prisma + SQLite |       libSQL/Turso |
| ------------ | -----------------------------------: | ----------------------------------: | --------------------------: | -------------------: | -----------------: |
| 本地自托管复杂度     |                                **低** |                                   低 |                          中高 |                    中 |                  中 |
| schema 唯一事实源 | **强：TS schema → migrations → types** | 强但偏 DB-first：SQL/DB → codegen types |                     强，取决于工具 | Prisma schema 会成为事实源 | 取决于 Drizzle/Kysely |
| 类型派生         |   **直接 `$inferSelect/$inferInsert`** |         需要 `Database` 类型，通常 codegen |                          同左 |     Prisma Client 生成 |   同 Drizzle/Kysely |
| migration 体验 |   **schema diff 生成 SQL，适合 monorepo** |                    手写 migration 更自然 |                 成熟但需要 DB 服务 |            体验好但模型层更重 |  额外 remote/sync 语义 |
| 测试           |        **`:memory:` 或 temp file，简单** |                     简单，但要处理 codegen |    可用 PGlite/Testcontainers |                   简单 |            集成测试更复杂 |
| 备份           |  **一个文件 + online backup/Litestream** |                                  同左 |            pg_dump/WAL/托管备份 |             同 SQLite |              取决于部署 |
| 多设备 Web 控制台  |                               **足够** |                                  足够 |                       足够但偏重 |                   足够 |                 足够 |
| 多实例/多写者扩展    |                                  有边界 |                                 有边界 |                      **最好** |               取决于 DB |         Turso 方向更好 |
| 当前推荐度        |                               **最高** |                                  次选 |                      后续扩展选项 |                  不推荐 |            可作为未来通道 |

---

## 迁移方案比较

### Drizzle

Drizzle 最适合你的 Turborepo 结构。推荐流程：

```text
packages/db/src/schema/*.ts
        ↓
drizzle-kit generate
        ↓
packages/db/migrations/*.sql
        ↓
review + commit
        ↓
deploy/install 时 drizzle migrate
```

Drizzle Kit 会读取当前 schema 和上一份 schema 快照，生成 SQL migration；执行迁移时会读取 migration 文件和数据库内的迁移记录，只应用新的迁移。([Drizzle ORM][3])

建议约束：

* **开发期可以用 `push` 快速试验，但不要把 `push` 当生产迁移机制。**
* 生产/用户数据版本升级只跑已提交的 SQL migrations。
* 涉及数据搬迁、字段拆分、枚举重构时，手写 SQL migration 或在 migration 中加入受控 backfill。
* 所有 schema 修改必须从 `packages/db/src/schema` 发起，禁止业务包定义持久化字段。

### Kysely

Kysely 的迁移更适合你想手写 SQL 或手写 migration builder 的场景。它的好处是透明，SQL 感更强；坏处是没有天然的“schema diff → SQL migration → 类型派生”一体体验。([Kysely][8])

如果选 Kysely，建议必须加：

```text
migrations/*.ts 或 migrations/*.sql
        ↓
启动/部署 migrateToLatest
        ↓
kysely-codegen
        ↓
CI: kysely-codegen --verify
```

否则 `Database` 类型很容易和真实 DB 漂移。

---

## 类型生成与业务类型

你的原则是“数据库 schema 是持久化字段唯一事实源，业务类型从 schema 显式派生”。这点 Drizzle 更直接：

```ts
export type Device = typeof devices.$inferSelect;
export type InsertDevice = typeof devices.$inferInsert;
```

再配合领域层类型时，可以只做显式投影：

```ts
export type DeviceView = Pick<Device, "id" | "name" | "lastSeenAt">;
```

这能避免三套类型：

```text
DB schema
ORM model
业务 DTO
```

Kysely 也能类型安全，但你通常会维护/generated 一个 `Database` interface，然后业务类型从 `Selectable<Database["devices"]>`、`Insertable<...>` 派生。它也可行，只是多了 codegen 和校验链路。Kysely 官方也明确说明它只处理 TypeScript 层面的类型，运行时类型来自底层 driver。([Kysely][9])

---

## 测试成本

SQLite 对你这类项目的测试非常友好：

```text
每个测试文件一个 :memory: DB
或
每个测试 worker 一个临时 .sqlite 文件
```

建议测试策略：

```text
unit test:
  create in-memory/temp DB
  run migrations
  seed minimal fixtures
  test repositories/services

integration test:
  temp file SQLite
  WAL on
  same migration path as production
```

SQLite 官方也把它列为 enterprise DB 的测试/演示替身之一。([SQLite][1])

Drizzle 在这里的优势是：测试和生产都从同一份 schema/migration 走，不需要先生成 Kysely Database 类型。Kysely 的测试也没问题，但 CI 里要保证 migrations、真实 DB、`kysely-codegen` 输出三者一致。

---

## 备份与恢复

SQLite 的备份是这个项目的重要加分项。不要直接复制一个正在写入的 `.sqlite` 文件；应使用 SQLite Online Backup API 或 driver 封装。

SQLite 官方的 Online Backup API 允许在备份过程中继续使用源数据库，备份得到的是源库在某个时间点的一致快照。([SQLite][10])

Node 侧也有可用路径：

* `better-sqlite3` 提供 `backup()`，备份过程中数据库仍可正常打开使用，但如果另一个连接持续修改数据库，备份可能重试，官方建议最好只有一个 mutating connection。([GitHub][11])
* Node 内置 `node:sqlite` 也有 `sqlite.backup()` Promise API，但 `node:sqlite` 在当前文档里仍标记为 release candidate/实验性阶段，不建议作为你现在的默认生产依赖。([Node.js][12])
* 后续可以接 Litestream。Litestream 是 SQLite 的独立灾备工具，可作为后台进程把 SQLite 变更增量复制到另一个文件或 S3 类对象存储，且通过 SQLite API 工作，不需要改应用代码。([Litestream][13])

推荐备份层级：

```text
MVP:
  每日/每次升级前 hot backup 到 backups/
  保留最近 N 份
  支持 CLI restore

小团队:
  hot backup + 压缩 + 上传 S3/B2/MinIO

更稳:
  Litestream 连续复制 + 定期 restore 演练
```

---

## 多设备与未来扩展成本

### 你现在的多设备场景

如果架构是：

```text
Phone / Laptop / Tablet browser
        ↓ HTTP/WebSocket
Codex Remote server
        ↓
local SQLite file
```

SQLite 是合理选择。设备数量增加主要增加 API 连接和读请求，不等于多个 writer 直接竞争 DB 文件。

### 不建议的场景

不建议这样部署：

```text
App server A ─┐
App server B ─┼── network filesystem ── codex-remote.sqlite
App server C ─┘
```

SQLite 官方明确不建议多个客户端程序通过网络直接访问同一个 DB，WAL 也不适用于网络文件系统。([SQLite][1])

### 到什么程度应该换 PostgreSQL

当你出现这些信号时，再迁移 PostgreSQL：

```text
需要多个 Codex Remote server 实例主动写同一个数据库
需要复杂队列/锁/高并发写入
审计/诊断事件量变成高频日志系统
需要跨主机事务、权限、连接池、SQL observability
DB 文件接近几十 GB 且写入持续增长
```

SQLite 官方也把“很多并发写者”“数据和应用分离在网络上”“多个服务器写同一数据库”列为更适合 client/server DB 的场景。([SQLite][1])

---

## 关于 driver：`better-sqlite3`、`@libsql/client`、`node:sqlite`

Drizzle SQLite 支持多个 driver，包括 `libsql`、`node:sqlite`、`better-sqlite3`；`@libsql/client` 支持 `:memory:`、`file:`、`wss:`、`http:`、`turso:` 等 URL。([Drizzle ORM][14])

我的建议：

### 默认稳妥：`better-sqlite3`

优点：

* 成熟、简单、同步 API
* 支持 transaction、backup、WAL
* 本地 self-host 场景非常直接

注意点：

* 是 native dependency，pnpm/Turborepo/CI/Docker 要确保构建环境稳定
* 官方也明确说它不适合高并发读写、巨大数据集或社交媒体级写入，这和 SQLite 边界一致。([GitHub][15])

### 预留未来 remote：`@libsql/client`

优点：

* 现在可用 `file:` 本地 SQLite
* 未来可切到 libSQL/Turso remote、embedded replica 路径
* Drizzle schema/query 层改动较小

注意点：

* 一旦使用 remote/replica/sync，复杂度不再是“一个本地 SQLite 文件”
* Turso embedded replica 是本地读、远程写再同步；文档也提示同步中的本地 DB 不应被其他进程打开，否则可能导致损坏。([Turso][16])

### 暂不默认：`node:sqlite`

Node 内置 `node:sqlite` 很有吸引力，因为少一个 native 依赖；但官方文档当前仍把它标为 release candidate/实验性阶段，作为库的默认生产选择还偏早。([Node.js][12])

---

## 为什么不建议 Prisma

Prisma 的迁移和生成体验很好：它有 Prisma schema、Prisma Migrate、Prisma Client、Studio。官方也把 Prisma Client 描述为自动生成的类型安全 query builder，Prisma Migrate 用声明式 schema 管理迁移。([GitHub][17])

但它和你的关键原则冲突较大：

```text
你想要：
DB schema 是唯一事实源
业务类型从 schema 显式派生

Prisma 实际上会引入：
schema.prisma 作为模型事实源
Prisma Client 作为生成访问层
```

此外，Prisma SQLite connector 的文档也提到 SQLite enum 不会在数据库层强制约束，非法值可能到 Prisma Client 层才失败。([Prisma][18])

Prisma 适合想要完整 ORM DX、Studio、关系模型抽象的团队；不适合你这个“schema 明确、类型显式派生、轻量自托管”的方向。

---

## 为什么不建议现在上 PostgreSQL

PostgreSQL 是最强的未来扩展选项，但不是当前最优默认项。它解决的是：

```text
多实例写入
高并发写
更复杂权限/连接池/观测
大规模数据
集中式团队部署
```

你的当前数据类型更像控制台元数据：

```text
devices
tasks
task_conversations
audit_events
diagnostic_events
settings
```

这类数据的本地自托管体验，SQLite 会显著简单。PostgreSQL 会提前引入：

```text
Docker compose / external service
用户安装复杂度
备份与恢复文档
连接字符串和权限
migration 执行顺序
测试容器或 PGlite/Testcontainers
```

如果未来要迁移，Drizzle/Kysely 都能支持 PostgreSQL。现在可以通过 schema 设计保持可迁移性：少用 SQLite 特有 trick，所有时间字段统一策略，JSON 字段只放诊断/扩展元数据，不把核心关系藏进 JSON。

---

## PGlite、LiteFS、rqlite、Turso Sync 的位置

### PGlite

PGlite 是 Postgres 的 WASM/TypeScript 形态，可在 Node、Bun、浏览器中运行，适合单元测试、CI、本地开发、嵌入式 Postgres 场景。([PGlite][19])

但它不是你现在最自然的 production DB。它有单连接/多连接限制和特定 server 模式语义，作为“未来如果选 Postgres 后的测试工具”更合适。([PGlite][20])

### LiteFS

LiteFS 是分布式文件系统，透明复制 SQLite 数据库，适合边缘/多节点场景；但它仍是额外基础设施，且文档提示项目仍 pre-1.0，并强调要做 regular off-site backups。([Fly.io][21])

不建议 Codex Remote MVP 引入它。

### rqlite

rqlite 用 Raft 日志复制 SQLite 命令，Raft log 是系统变更的权威记录。([rqlite][22])
它解决的是分布式一致性数据库问题，不是一个自托管控制台的默认问题。

### Turso/libSQL

libSQL/Turso 值得作为未来路径关注，尤其是你希望：

```text
本地读
远程主库
embedded replica
多地点部署
```

libSQL 是 SQLite fork，Turso/libSQL 生态提供远程访问、embedded replicas、不同语言 client 等能力。([GitHub][23])

但对本地 self-host 默认部署，先用 SQLite 文件更干净。可以通过 `@libsql/client` 预留切换空间，而不是一开始把 sync/replica 作为核心架构。

---

## 推荐的 `packages/db` 结构

```text
packages/db/
  drizzle.config.ts
  migrations/
  src/
    client.ts
    migrate.ts
    schema/
      devices.ts
      tasks.ts
      conversations.ts
      audit.ts
      index.ts
    types.ts
    repositories/
      devices.repo.ts
      tasks.repo.ts
      conversations.repo.ts
```

建议 package 边界：

```text
packages/db
  负责 schema、migration、DB client、repository、DB-derived types

apps/web 或 apps/server
  只调用 repository/service
  不直接 import table schema 做任意查询，除非你明确允许
```

推荐 scripts：

```json
{
  "db:generate": "drizzle-kit generate --config packages/db/drizzle.config.ts",
  "db:migrate": "tsx packages/db/src/migrate.ts",
  "db:studio": "drizzle-kit studio --config packages/db/drizzle.config.ts"
}
```

初始表建议：

```text
devices
  id
  display_name
  public_key / token_hash
  status
  capabilities_json
  registered_at
  last_seen_at
  revoked_at

tasks
  id
  title
  status
  priority
  source
  created_at
  updated_at
  archived_at

conversations
  id
  provider
  external_conversation_id
  title
  metadata_json
  created_at
  updated_at

task_conversations
  task_id
  conversation_id
  role / relation_type
  created_at

audit_events
  id
  actor_device_id
  event_type
  entity_type
  entity_id
  payload_json
  created_at

diagnostic_events
  id
  level
  component
  message
  payload_json
  created_at
```

审计/诊断建议采用 append-only event 表，核心查询字段独立列化，扩展信息放 JSON。这样后续迁移 PostgreSQL 时也比较顺。

---

## 最终建议

采用：

```text
SQLite + Drizzle
```

并按这个优先级落地：

```text
1. packages/db 建 Drizzle schema
2. 业务类型只从 schema 显式派生
3. migrations 生成后提交，不在生产用 push
4. 本地 DB 文件 + WAL + busy_timeout + foreign_keys
5. 测试使用 :memory: 或 temp file，并跑同一套 migrations
6. 备份使用 driver/SQLite online backup，不直接复制热 DB
7. 未来需要多实例写入时，再迁移 PostgreSQL 或评估 libSQL/Turso
```

简化判断：

```text
现在：SQLite + Drizzle
偏 SQL 手写、DB introspection 洁癖：SQLite + Kysely + kysely-codegen
未来多实例/高并发写：PostgreSQL
未来边缘读/remote replica：libSQL/Turso
不建议默认：Prisma、LiteFS、rqlite、PGlite production
```

[1]: https://sqlite.org/whentouse.html "Appropriate Uses For SQLite"
[2]: https://sqlite.org/wal.html "Write-Ahead Logging"
[3]: https://orm.drizzle.team/docs/migrations "Drizzle ORM - Migrations"
[4]: https://orm.drizzle.team/docs/column-types/sqlite "Drizzle ORM - SQLite column types"
[5]: https://kysely.dev/ "Kysely"
[6]: https://kysely.dev/docs/generating-types "Generating types | Kysely"
[7]: https://github.com/RobinBlomberg/kysely-codegen "GitHub - RobinBlomberg/kysely-codegen: Generate Kysely type definitions from your database. · GitHub"
[8]: https://kysely.dev/docs/migrations "Migrations | Kysely"
[9]: https://kysely.dev/docs/getting-started "Getting started | Kysely"
[10]: https://sqlite.org/backup.html "SQLite Backup API"
[11]: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md "better-sqlite3/docs/api.md at master · WiseLibs/better-sqlite3 · GitHub"
[12]: https://nodejs.org/api/sqlite.html "SQLite | Node.js v26.3.1 Documentation"
[13]: https://litestream.io/ "Litestream - Streaming SQLite Replication"
[14]: https://orm.drizzle.team/docs/get-started-sqlite "Drizzle ORM - SQLite"
[15]: https://github.com/WiseLibs/better-sqlite3 "GitHub - WiseLibs/better-sqlite3: The fastest and simplest library for SQLite3 in Node.js. · GitHub"
[16]: https://docs.turso.tech/features/embedded-replicas/introduction "Embedded Replicas - Turso"
[17]: https://github.com/prisma/prisma?utm_source=chatgpt.com "prisma/prisma: Next-generation ORM ..."
[18]: https://www.prisma.io/docs/orm/core-concepts/supported-databases/sqlite?utm_source=chatgpt.com "SQLite database connector | Prisma Documentation"
[19]: https://pglite.dev/docs/about "What is PGlite | PGlite"
[20]: https://pglite.dev/docs/pglite-socket "PGlite Socket | PGlite"
[21]: https://fly.io/docs/litefs/ "LiteFS - Distributed SQLite · Fly Docs"
[22]: https://rqlite.io/docs/design/ "rqlite Design | rqlite"
[23]: https://github.com/tursodatabase/libsql "GitHub - tursodatabase/libsql: libSQL is a fork of SQLite that is both Open Source, and Open Contributions. · GitHub"
