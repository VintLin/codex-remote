---
title: "Q23：thread/list cwd scope and pagination behavior"
source_url: "https://chatgpt.com/c/6a364d16-5190-83e8-b8ed-59a612dd50d2"
exported_at: "2026-06-20T17:08:07"
open_method: "anchor"
clicked_copy: "False"
used_fallback_text: "True"
---

结论先行

thread/list(cwd=allowedProjectRoot) 应按 exact cwd filter 理解：它不是 prefix/subtree filter，不会自动覆盖 allowedProjectRoot/**，也不会自动覆盖 sibling worktree。当前仓库文档和生成 schema 明确写的是“exactly matches”，而源码观察显示实现会做一定路径归一化后再比较；但官方没有承诺 canonical realpath / symlink / Windows↔WSL 路径等价。因此最安全分类是：exact-after-normalization；非 prefix；canonical realpath unknown / not guaranteed。
OpenAI Developers
+2
GitHub
+2

不能只扫前三页作为 authorization guard 的依据。官方文档说 filters apply before pagination、nextCursor: null 才表示最后一页；源码当前默认 limit 是 25、最大 clamp 到 100，且 issue 中已有“只取全局最近窗口导致旧项目会话不可见”的复现报告。
GitHub
+3
OpenAI Developers
+3
GitHub
+3

1. thread/list 的 cwd 语义
官方事实

OpenAI Developers 的 Codex App Server 文档写明：cwd 会“restrict results to threads whose session cwd exactly matches this path”，并且所有 filters 在 pagination 之前应用。
OpenAI Developers

OpenAI/Codex 仓库 README 里的 app-server 文档更新得更细：cwd 可以是单个 path 或 path array；匹配语义是“exactly matches this path or one of the paths”；relative path 会先相对 app-server 进程 cwd resolve，再进行匹配。
GitHub

生成的 JSON/TypeScript schema 也支持 cwd: string | string[]，描述同样是 exact match one-of-paths。
GitHub
+1

源码观察

当前源码中，thread/list 会先把传入的 cwd 通过 AbsolutePathBuf::relative_to_current_dir(...) 归一成绝对路径；随后在列表过滤时用 path_utils::paths_match_after_normalization(&it.cwd, expected_cwd) 比较存储的 thread cwd 与 expected cwd。源码同时把 limit 默认值、clamp、sort、cursor、filter loop 放在同一路径里处理。
GitHub
+2
GitHub
+2

分类
语义项 结论 说明
exact 是 官方文档、README、schema 都写 exact match。
prefix / subtree 否 没有官方文档或源码证据表明 cwd=/repo 会包含 /repo/subdir。
cwd array 是 README/schema 支持多个 exact cwd。
relative path 是，但相对 app-server 进程 cwd 不是相对 repo root，容易误用。
normalization 实现中存在 源码有 normalization helper，但它不是 prefix。
canonical realpath / symlink 等价 unknown / not guaranteed 官方没有承诺；Windows/WSL 路径错配已有用户报告。

Windows/WSL 路径问题尤其不能假设会自动 canonicalize。有 issue 报告旧 sessions 存成 Windows path，WSL app-server 把 Windows path 当相对路径处理，导致 project-scoped thread/list 返回空；把 persisted cwd 转成 WSL path 后恢复。
GitHub

2. sourceKinds、archived、limit、cursor、sortDirection 的实际影响
sourceKinds

官方文档说：sourceKinds 省略或 [] 时，默认只包含 interactive sources，即 cli 和 vscode。文档列出的 source kinds 包括 cli、vscode、exec、appServer、多个 sub-agent 相关 kind，以及 unknown。
OpenAI Developers
+1

对 inventory / authorization guard 来说，不要依赖省略 sourceKinds 的默认行为，否则可能漏掉 exec、appServer、sub-agent、unknown 来源的历史 thread。应显式传入所有你认为可被 guard 纳入的 source kinds；如果只想枚举人工交互历史，才使用默认 interactive-only。

需要注意一个边界：README 写明，在 parentThreadId 场景下，如果省略 sourceKinds，会包含 every source kind；但一旦显式传 filter，仍按普通 filter 行为执行。这个例外不应被推广到普通 project inventory。
GitHub

archived

archived: true 返回 archived-only；archived: false、null 或省略返回 non-archived 默认集合。README 还明确说 archived thread 不会出现，除非请求 archived: true。
OpenAI Developers
+1

所以历史会话 inventory 若要覆盖“可恢复但已归档”的合法历史，必须分别扫：

JSON
{"archived": false}
{"archived": true}

不能指望一次请求同时返回 archived 与 unarchived。

limit

官方文档只说 server 会默认一个 reasonable page size；源码当前定义是 default 25，max 100，并在请求处理中把 page size clamp 到 1..=100。schema 层面虽显示 unsigned integer minimum 0，但实际处理路径会 clamp。
GitHub
+3
OpenAI Developers
+3
GitHub
+3

工程上应直接用 limit: 100 做 inventory，减少分页次数；不要假设 limit 可以一次拿完，也不要依赖默认 page size。

cursor

cursor 是 opaque string；第一页省略；响应里的 nextCursor 用于继续同一方向分页；nextCursor: null 表示最后一页。README 还记录了 backwardsCursor：它用于反转 sortDirection 后从当前窗口向反方向翻页。
OpenAI Developers
+1

authorization guard 的关键点：只扫前三页不是完整扫描。即使用 limit: 100，前三页也只是当前 filter + sort 下最多 300 条。已有 issue 报告桌面端只拿最近窗口导致旧项目会话不可见，且用户确认底层 sqlite/sessions/unarchived 数据仍存在。
GitHub

sortDirection / sortKey

官方文档与 README 均写 sortDirection 支持 desc 默认和 asc；sortKey 支持 created_at 默认、updated_at、recency_at。源码当前 match 也包含 CreatedAt、UpdatedAt、RecencyAt。生成 schema 中有一个版本只枚举 created_at/updated_at，因此以 README/源码为准，但要在本机验证当前安装版本。
GitHub
+3
OpenAI Developers
+3
GitHub
+3

3. 对项目发现、多 root、worktree、子目录会话的影响
repo root 与 subdir

如果一个 session 的 stored cwd 是：

/repo/subdir

那么用：

JSON
{"cwd": "/repo"}

按官方语义不应返回该 session。应额外查询 /repo/subdir，或不要用 cwd=/repo 作为唯一发现条件。结论依据是 exact cwd，而不是 prefix。
OpenAI Developers
+1

这对 Remote Worker 很关键：用户可能在 repo root 启动一次 Codex，也可能在 packages/api、apps/web、src 等子目录启动。若 guard 只用 allowed project root 查 thread/list，会把合法历史会话误判为不可见。

多 root

README/schema 支持 cwd array，因此多 root 可以合并成一个 exact-match one-of 查询，例如：

JSON
{
 "cwd": ["/repo", "/repo/packages/api", "/repo/apps/web"]
}

但这仍然是多个 exact cwd，不是 subtree search。
GitHub
+1

Git worktree

Codex app 文档提到 app 有 built-in worktree support；但 worktree 在文件系统上通常是独立 path，例如 /repo 与 /repo-wt/feature-x。cwd=/repo 不会自动匹配 sibling worktree cwd。
OpenAI Developers
+1

因此 Worker 做 project discovery 时，应把每个 allowed worktree root 当作独立 exact cwd 候选，而不是把它当作原 repo root 的子目录。实际实现上可以从 git worktree list --porcelain、项目配置、Worker allowlist、历史 thread metadata 中收集这些 roots。

CLI resume/list 的对照信号

Codex CLI 官方文档说明：codex resume 会显示最近 interactive sessions；codex resume --all 会显示 current working directory 之外的 sessions；codex resume --last 默认 scoped to current cwd，加 --all 后忽略 cwd filter。
OpenAI Developers
+1

这说明 CLI 层面也区分“当前 cwd scoped inventory”和“全局 inventory”。所以 app-server 的 cwd scoped list 不能被当作“这个用户所有合法历史会话”的完备来源。

4. Worker 授权 guard 如何避免漏掉合法历史会话
不要把“不在前三页”解释成 unauthorized

thread/list 是分页 API，nextCursor: null 才表示该 filter 下扫描完成。已有用户报告“项目 A 的旧会话被项目 B 后来的大量会话挤出最近窗口后不可见”，这正是固定页数扫描的典型 false negative。
OpenAI Developers
+2
GitHub
+2

推荐 guard 策略

把 thread/list 当 inventory，不当最终授权事实。
如果用户提供具体 thread id，应优先 direct lookup/read/resume 该 thread 的 metadata，然后验证其 cwd / git root / worktree identity 是否落在 allowlist 内。列表扫描找不到只能表示“inventory 未覆盖”，不能直接表示“非法”。

对 path 做 Worker 自己的 canonicalization。
对 allowlist roots 维护：

realpath；

symlink alias；

container mount path；

Windows path 与 WSL path 等价映射；

Git worktree roots；

monorepo 常用子目录 roots。
这一步不能完全交给 app-server，因为官方只承诺 exact path，Windows/WSL 兼容问题已有复现。
GitHub

inventory 请求使用 explicit broad filters。
建议基线参数：

JSON
{
 "cwd": [
 "/abs/repo",
 "/abs/repo/packages/api",
 "/abs/repo/apps/web",
 "/abs/repo-wt/feature-x"
 ],
 "limit": 100,
 "sortKey": "updated_at",
 "sortDirection": "desc",
 "sourceKinds": [
 "cli",
 "vscode",
 "exec",
 "appServer",
 "subAgent",
 "subAgentReview",
 "subAgentCompact",
 "subAgentThreadSpawn",
 "subAgentOther",
 "unknown"
 ],
 "archived": false,
 "modelProviders": []
}

modelProviders: [] 虽不在你的问题重点里，但对 inventory 更安全：官方文档把 unset/null/[] 解释为 all providers；源码中 empty provider filter 也会变成 no provider restriction。考虑到实现历史上有 provider filter nuance，显式传空数组更适合作为“全 provider inventory”意图。
OpenAI Developers
+1

分页必须扫到 nextCursor: null。
对每组 {cwd-set, archived, sourceKinds, sortKey/sortDirection}，循环请求直到 nextCursor 为 null。若因为超时、错误、页数上限中断，应把结果标为 inventory_incomplete，不要把未出现的历史 thread 直接判成 unauthorized。

archived 单独扫。
如果 guard 的业务语义允许恢复/引用 archived 历史，会话 inventory 必须再扫 archived: true。否则 archived 合法历史会被漏掉。
GitHub

子目录与 worktree 用 allowlist expansion，而不是 prefix query。
因为 cwd 不是 subtree filter，所以应扩展候选 exact cwd。对于 monorepo，可以把“曾经启动过 Codex 的 cwd”写入 Worker 自己的 index，后续增量查询这些 cwd。

授权判定建议三态化。

authorized: direct metadata 或完整 inventory 证明 thread cwd/git identity 在 allowlist 内。

unauthorized: direct metadata 证明 thread cwd/git identity 不在 allowlist 内。

indeterminate: inventory 不完整、路径无法 canonicalize、thread metadata 不足、app-server 返回不一致。
indeterminate 不应被展示成“历史不存在”；安全侧可以拒绝执行敏感动作，但 UI/日志应明确是“未能验证”，不是“非法”。

5. 本机验证矩阵

下面矩阵用于验证你当前安装的 Codex 版本，因为 app-server 文档、README、生成 schema 与源码可能随 release 变化。OpenAI/Codex changelog 近期确实多次改过 app-server、thread inventory、resume/fork、diagnostics 等相关路径。
OpenAI Developers
+1

维度 准备 请求 预期 / 判定
repo root exact 在 /repo 启动一个 CLI session thread/list {"cwd":"/repo"} 应返回该 thread。
subdir 在 /repo/packages/api 启动 session cwd="/repo"；再 cwd="/repo/packages/api" 前者按文档不应返回；后者应返回。若前者返回，说明版本行为已变成 prefix 或有特殊归并。
cwd array root 与 subdir 各有 session cwd:["/repo","/repo/packages/api"] 应返回两个 exact cwd 的 union。
sibling worktree git worktree add ../repo-wt branch-x，在 worktree 启动 session cwd="/repo"；再 cwd="/repo-wt" /repo 不应覆盖 /repo-wt；worktree root 应返回。
symlink alias 通过 /link-to-repo 启动 session 分别查 realpath 与 symlink path 记录是否等价；官方未保证 canonical realpath。
Windows/WSL 制造或保留 C:\... cwd 与 /mnt/c/... cwd sessions 分别用 Windows path、WSL path 查询 验证是否存在路径错配；若一边空一边有，Worker 必须自建 path alias。
sourceKinds 默认 创建 CLI/VSCODE/exec/appServer/subAgent 类型 session 省略 sourceKinds、sourceKinds:[]、显式 all kinds 省略/空数组应主要返回 interactive；显式 all 才适合完整 inventory。
archived 创建 session 后 archive archived:false；再 archived:true false/省略不应返回 archived；true 应返回 archived-only。
limit default 不传 limit 观察 data 长度 当前源码预期默认最多 25。
limit max 创建 >120 条匹配 threads limit:100；limit:500 当前源码预期最多 100；大值被 clamp。
cursor 完整性 创建 >100 条匹配 threads 循环使用 nextCursor 直到 nextCursor:null 才完整；总数应等于匹配集合。
前三页风险 创建 >300 条较新的其他项目 sessions，再保留旧项目 session 只扫全局前三页 vs cwd-filter 完整分页 全局前三页可能漏旧项目；cwd-filter 完整分页应找回。
sortDirection 同一集合用 desc 与 asc 比较首尾 created/updated 时间 顺序应反转；可测试 backwardsCursor 是否能反向翻页。
CLI 对照 在 cwd A、cwd B 各建 sessions codex resume、codex resume --all --all 应显示 cwd 外 sessions；用于确认 CLI scoped/unscoped 差异。

建议把验证脚本的通过条件写成：列表找不到不等于不存在；只有完整分页 + 正确 cwd/source/archive/provider filter 才能证明某个 filter 下不可见。
