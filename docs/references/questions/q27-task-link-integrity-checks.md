---
title: "Q27：Task link integrity checks"
source_url: "https://chatgpt.com/c/6a364e52-e4e4-83ee-b731-2fb8900cf384"
exported_at: "2026-06-20T17:08:39"
open_method: "anchor"
clicked_copy: "False"
used_fallback_text: "True"
---

结论

Control Plane 必须验证自己权威范围内的资源存在与项目归属，但不应把 Worker 在线状态作为 link 写入的同步前置条件。

更精确地说：

Control Plane 不能把 API 客户端提交的任意 device_id / conversation_id / project_id 直接保存为“已验证 link”。它可以保存外部引用，但只能以 pending / unverified 状态保存，直到权威来源确认。跨服务/远端资源关系本来就不能完全靠本地数据库强制；Microsoft 的微服务数据设计文档明确指出，跨服务数据关系无法用传统数据管理技术强制，需要定义一致性级别、单一事实来源，并在可接受处使用 eventual consistency。DDD 里也推荐跨 Aggregate 只保存全局 identity，而不是直接对象引用。
Microsoft Learn
+1

1. link API 的返回建议

建议统一使用 application/problem+json 错误体。RFC 9457 定义了 Problem Details，包含 type/status/title/detail/instance，也允许扩展字段如 code、target、retryable。
IETF Datatracker
+1

场景 推荐返回 是否写入 link 说明
task_id 不存在 404 Not Found 否 parent resource 不存在。
missing device：device_id 在 Control Plane 设备注册表中不存在 404 Not Found 否 device 是 Control Plane 可验证的本地资源；不要保存为 pending。JSON:API 对“引用不存在的 related resource”也要求 404。
JSON:API

device 存在，但 Worker unavailable / offline 默认 202 Accepted 是，verification_state=pending 或 delivery_state=queued/offline Worker 离线是可恢复的运行时状态，不等于 device 不存在。RFC 9110 对 202 的定义正是“请求已接受，但处理尚未完成，之后可能成功或失败”。
IETF Datatracker

device 存在，但调用方显式要求同步验证，例如 requireVerified=true 503 Service Unavailable + 可选 Retry-After 通常否 只有当 API 契约明确要求“现在必须验证/派发”时才用 503。RFC 9110 把 503 定义为临时无法处理，并允许 Retry-After。
IETF Datatracker

conversation not found，且权威来源已经确认不存在 404 Not Found 否；若已有 pending link，则转为 invalid 不要把 authoritative negative 保存为 verified。
conversation 无法确认，因为目标 Worker 离线/超时 202 Accepted 是，verification_state=pending “无法确认”不是 “not found”。后续 verifier 把状态转为 verified 或 invalid。
project 不存在 404 Not Found 否 project 若是 Control Plane/Auth/catalog 权威资源，应同步验证。
project mismatch：task 属于 project A，但 link 指向 project B 或 conversation 属于 project B 409 Conflict 否 资源存在，但与当前 task 状态冲突。RFC 9110 将 409 定义为请求与目标资源当前状态冲突，并要求响应包含足够信息帮助识别冲突来源。
IETF Datatracker

ID 格式非法、枚举非法、body 结构正确但语义字段非法 422 Unprocessable Content 否 例如 target_kind="foo"、空 ID、ID 格式不符合约定。RFC 9110 对 422 的语义是语法正确但无法处理其中指令。
IETF Datatracker

推荐错误体示例：

JSON
{
 "type": "https://api.example.com/problems/project-mismatch",
 "title": "Project mismatch",
 "status": 409,
 "code": "project_mismatch",
 "detail": "Task belongs to project proj_a, but the requested conversation belongs to proj_b.",
 "target": {
 "kind": "conversation",
 "id": "conv_123"
 },
 "expectedProjectId": "proj_a",
 "actualProjectId": "proj_b",
 "retryable": false
}

Worker offline 的成功但未完成响应：

JSON
{
 "id": "tasklink_123",
 "taskId": "task_abc",
 "target": {
 "kind": "conversation",
 "id": "conv_123"
 },
 "projectId": "proj_a",
 "verificationState": "pending",
 "verificationReason": "worker_unavailable",
 "retryable": true
}
2. 是否需要同步验证 Worker

不需要把 Worker 同步验证放在 link 主写路径上。

应同步验证这些内容：

task_id 是否存在。

调用方是否有权限访问该 task/project/device。

device_id 是否存在于 Control Plane 设备注册表。

project_id 是否存在。

project_id 是否与 task 的 canonical project 匹配。

请求 body 的结构、枚举、ID 格式是否有效。

唯一性与幂等性：同一 task 不应重复 link 同一 target。

应异步验证这些内容：

Worker 是否在线。

conversation 是否确实存在于某台设备/Worker。

conversation 是否仍属于某 project。

远端 Worker 是否能接受后续派发。

本地缓存/镜像是否过期。

原因是：多设备 Worker 可能长期离线。如果 link 写入强依赖 Worker 当前在线，Control Plane 的可用性会被最慢/离线设备拖垮。微服务资料也建议跨服务更新不要直接访问别的服务存储或依赖分布式事务，而是用异步通信和 eventual consistency。
Microsoft Learn

推荐状态机：

pending -> verified
pending -> invalid
verified -> stale // 可选：远端之后失效
stale -> verified // 可选：重新验证成功
stale -> invalid // 可选：确认失效

最小实现可以只有：

pending | verified | invalid

关键契约：pending 不等于 active。调度、派发、强一致 UI 展示只能使用 verified link；pending 只能用于“已记录，等待验证”。

3. SQLite schema / constraint 最小建议

SQLite 外键适合强制 Control Plane 本地拥有的关系。SQLite 文档明确说外键用于强制表之间的 “exists” 关系；但 SQLite 的外键默认关闭，需要对每个连接执行 PRAGMA foreign_keys = ON。
SQLite
+1

Drizzle 里要区分两件事：relations 只是应用层查询抽象，不会隐式创建数据库外键；真正的数据库约束需要 .references() 或 foreignKey()。
Drizzle ORM
+1

最小 schema 建议：

SQL
PRAGMA foreign_keys = ON;

CREATE TABLE projects (
 id TEXT PRIMARY KEY,
 created_at INTEGER NOT NULL
);

CREATE TABLE devices (
 id TEXT PRIMARY KEY,
 last_seen_at INTEGER,
 created_at INTEGER NOT NULL
);

CREATE TABLE tasks (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,

 -- 用于让 link 表通过 composite FK 强制 project 与 task 一致
 UNIQUE (id, project_id)
);

-- 如果 task 只能属于一个 project，tasks.project_id 已经是 task-project link。
-- 不建议再建 task_project_links，除非产品语义确实需要“多 project link”。
CREATE TABLE task_device_links (
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
 delivery_state TEXT NOT NULL DEFAULT 'queued'
 CHECK (delivery_state IN ('queued', 'delivered', 'offline', 'failed')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,

 PRIMARY KEY (task_id, device_id)
);

CREATE TABLE task_conversation_links (
 task_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL,
 device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,

 verification_state TEXT NOT NULL DEFAULT 'pending'
 CHECK (verification_state IN ('pending', 'verified', 'invalid')),

 verification_error TEXT,
 verified_at INTEGER,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,

 -- 同时保证 task 存在，并且 link.project_id 必须等于 task.project_id。
 FOREIGN KEY (task_id, project_id)
 REFERENCES tasks(id, project_id)
 ON DELETE CASCADE,

 PRIMARY KEY (task_id, conversation_id),

 CHECK (
 verification_state != 'verified'
 OR verified_at IS NOT NULL
 )
);

CREATE INDEX task_conversation_links_pending_idx
 ON task_conversation_links(verification_state)
 WHERE verification_state = 'pending';

CREATE INDEX task_conversation_links_project_idx
 ON task_conversation_links(project_id);

这套设计的边界：

tasks.project_id 是本地强约束。

task_device_links.device_id 是本地强约束。

task_conversation_links.conversation_id 是外部 identity，不做 FK，靠 verification_state 表达真实性。

task_conversation_links.project_id 通过 (task_id, project_id) composite FK 绑定到 task 的 project，防止 project mismatch 写入。

不需要为了 conversation 建完整镜像表，除非 Control Plane 真的成为 conversation catalog 的权威或准权威缓存。

SQLite 支持 composite foreign key，并要求 parent key 是 primary key 或 unique；文档也建议为 child key 建索引以避免约束检查退化为线性扫描。
SQLite
+1
 Drizzle 也支持用 foreignKey() 声明多列外键。
Drizzle ORM

不要用 deferred foreign key 解决 Worker offline。SQLite 的 deferred FK 只是在事务 commit 时检查本地数据库约束；它不能表达“远端 Worker 暂时不可验证”。
SQLite

4. 未来 iOS / API 客户端需要的契约保证

建议把以下保证写入 API contract：

服务端是最终校验点。 Web guard 只是 UX，不是完整性边界。API 客户端提交任意 ID 时，Control Plane 仍会验证本地权威资源和项目归属。

link API 幂等。 推荐使用：

http
PUT /tasks/{taskId}/links/device/{deviceId}
PUT /tasks/{taskId}/links/conversations/{conversationId}

或者保留 POST，但要求 Idempotency-Key / clientRequestId。HTTP 规范定义 PUT 是 idempotent；JSON:API 对 relationship add 也建议“已存在则仍成功”，以避免重复请求和竞态。
IETF Datatracker
+1

Worker offline 不等于失败。 默认返回 202 + pending，客户端可以显示“已记录，等待设备在线验证”。只有调用方显式要求同步验证时，才返回 503。

pending 不可当作 verified 使用。 iOS 可以乐观展示 pending link，但不能把它当作可派发、可恢复、可打开 conversation 的强保证。

错误 code 稳定。 至少固定：

task_not_found
device_not_found
project_not_found
conversation_not_found
project_mismatch
worker_unavailable
invalid_reference
duplicate_link
unauthorized_or_not_found

project scope 由服务端 canonicalize。 客户端可以提交 projectId，但服务端必须以 tasks.project_id 为准；不一致返回 409 project_mismatch。

查询 API 必须暴露验证状态。

JSON
{
 "target": { "kind": "conversation", "id": "conv_123" },
 "verificationState": "pending",
 "verificationError": null,
 "verifiedAt": null
}

权限隐藏策略固定。 如果资源存在但用户无权访问，可以统一返回 404，避免泄露资源存在性。RFC 9110 允许服务端用 404 隐藏 forbidden target 的存在。
IETF Datatracker

5. Stage 9 calibration task-link pass 判定标准

建议 Stage 9 pass 以这些测试通过为准：

API 行为

link task -> missing device 返回 404 device_not_found，数据库没有新增 verified/pending link。

link task -> known device 不需要 Worker 在线；device-only link 返回 201 Created、200 OK 或 204 No Content，并设置 delivery_state=queued/offline。

link task -> conversation 且 Worker offline 返回 202 Accepted，写入 verification_state=pending，响应包含 Location 或 link id。

requireVerified=true 且 Worker offline 返回 503 worker_unavailable，可带 Retry-After。

Worker 权威确认 conversation 不存在时返回 404 conversation_not_found；若之前已有 pending link，则转为 invalid，不能转为 verified。

task project 与 link project 不一致时返回 409 project_mismatch，无写入。

重复 link 同一 target 不产生重复行；返回已有 link 或 204。

数据完整性

SQLite 每个连接都执行并验证 PRAGMA foreign_keys = ON。

tasks.project_id FK 到 projects.id。

task_device_links.device_id FK 到 devices.id。

task_conversation_links(task_id, project_id) composite FK 到 tasks(id, project_id)，防止 project mismatch。

conversation_id 不强行 FK，除非 Control Plane 已经拥有权威 conversation catalog。

Drizzle relations 不被当作约束；实际 schema 使用 .references() / foreignKey() / uniqueIndex()。

状态语义

pending link 不参与强派发、不作为“conversation exists”的证明。

verifier 可以把 pending -> verified 或 pending -> invalid。

invalid link 对客户端可见，包含稳定 verification_error，但不被 active task board 使用。

Web guard 被绕过时，API 仍然拒绝 missing local resources 与 project mismatch。

最终判定：Control Plane 需要验证本地权威资源；允许远端外部引用，但只能以 pending/unverified 形式保存。Worker 不应成为 link 写入的同步依赖。
