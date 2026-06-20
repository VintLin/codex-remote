---
title: "Q26：Calibration report destination and secret scanning"
source_url: "https://chatgpt.com/c/6a364e06-845c-83ee-a710-b3b608c62790"
exported_at: "2026-06-20T17:08:31"
open_method: "anchor"
clicked_copy: "False"
used_fallback_text: "True"
---

结论

最小可维护方案：real:check 默认写入本地、被 Git 忽略的 artifact 目录；stdout 只输出短摘要/报告路径；docs/references/ 只接收显式生成的二次 sanitized evidence。

推荐默认路径：

logs/real-check/<utc-timestamp>-<run-id>.json
logs/real-check/latest.json

前提是 logs/real-check/ 明确在 .gitignore 中；如果这是 Codex 内部态而不是项目态，也可以优先写到 ${CODEX_HOME}/real-check/ 这类 repo 外目录，因为 Codex 文档说明 CODEX_HOME 是 Codex state 根目录，包含 config、auth、logs、sessions 等状态。
OpenAI Developers
 Git 本身把 .gitignore 用于“有意不跟踪”的生成文件；项目级生成报告放在被忽略目录是最符合这个语义的做法。
Git

1. 默认报告落点建议：logs vs stdout vs tracked docs
落点 建议 原因
logs/real-check/*.json 默认 本机校准报告是调试/审计 artifact，不应自动进入长期分发面；只要被 .gitignore 忽略、权限本地化、并在发布包中排除，就是最小状态方案。OWASP 也提醒日志不应放在 Web 可访问位置，且日志访问权限应受限。
cheatsheetseries.owasp.org

stdout 只输出短摘要；不要默认输出完整报告 CLI 约定是：主结果/机器可读输出走 stdout，日志、错误、诊断走 stderr；但 CI/stdout 往往会被永久保存，所以 stdout 只放 status、report_path、evidence_id、redaction=passed 这类低敏字段。
clig.dev

docs/references/ 禁止默认写入；只允许显式 evidence export tracked docs 是长期传播面，会被 PR、包、搜索、fork、镜像复制。GitHub secret scanning 能扫描默认/自定义模式，也能启用 push protection 阻止 secret 推入仓库；不要把真实校准报告直接变成 tracked docs。
GitHub Docs
+1

推荐命令语义：

Bash
npm run real:check
# stdout: real:check PASS report=logs/real-check/2026-06-20T...Z-abc123.json evidence=rc_7f31b9 sanitized=true

npm run real:check -- --json
# stdout: 仅输出同一 allowlisted sanitized schema，不输出 raw command/stdout/stderr/prompt/stack/jsonrpc

npm run real:check:evidence -- --out docs/references/codex-remote-real-check.md
# 显式把最终 sanitized evidence 写入 tracked docs

不要把 docs/** 加入 GitHub secret scanning 的 paths-ignore。GitHub 支持排除目录，但其最佳实践是排除项要最小化、精确化并解释原因；本场景下 docs/references/ 恰恰是需要扫描的高传播路径。
GitHub Docs

2. 哪些字段允许进入报告，哪些必须禁止
允许进入本地 sanitized report 的字段

只允许结构化 allowlist，不要把任意对象 JSON.stringify() 进报告。

JSON
{
 "schema_version": "real-check-report/v1",
 "generated_at": "2026-06-20T00:00:00.000Z",
 "tool": {
 "name": "codex-remote",
 "version": "x.y.z",
 "redaction_policy": "v1"
 },
 "run": {
 "run_id": "uuid-or-random-id",
 "conversation_ref": "hmac12:...",
 "turn_ref": "hmac12:...",
 "task_ref": "hmac12:..."
 },
 "repo": {
 "commit": "short-sha",
 "dirty": false
 },
 "environment": {
 "os_family": "darwin|linux|win32",
 "node_version": "vXX.YY.ZZ",
 "package_manager": "npm|pnpm|yarn"
 },
 "checks": [
 {
 "name": "calibration",
 "status": "pass|fail|skip",
 "duration_ms": 1234,
 "error_code": null,
 "sanitized_error": null
 }
 ],
 "summary": {
 "passed": 1,
 "failed": 0,
 "skipped": 0
 }
}

字段原则：

conversation id、turn id、task id：不允许 raw 值；只允许 HMAC-SHA256(raw_id, local_salt).slice(0, 12) 这种不可逆别名。OWASP 对 session identification values 的建议是移除、mask、sanitize、hash 或加密；这些 id 在这里应按 session/correlation identifiers 处理。
cheatsheetseries.owasp.org

时间戳：允许 UTC ISO-8601；不要写本地时区、用户名、主机名组合。

错误：只允许 error_code、error_class、sanitized_error_summary；不要写 raw exception。

路径：只允许 repo-relative path，例如 src/checks/calibration.ts；repo 外路径写成 [external-path:<hash>]。

命令结果：只允许命令名的逻辑标签、exit code、duration、pass/fail；不要写 raw stdout/stderr。

必须禁止进入任何报告/文档的字段

这些字段应在 schema 层直接拒绝，不能只靠正则替换：

raw_prompt
messages
conversation_id
turn_id
task_id
command
argv
cwd
home
env
process.env
stdout
stderr
output
raw_output
jsonrpc
params
result
headers
authorization
cookie
set-cookie
stack
trace
exception
request
response
openai_api_key
github_token
npm_token
_authToken
password
secret
privateKey
connectionString

必须禁止的内容类别：

OpenAI/GitHub/npm/CI token、API key、OAuth refresh token、session cookie、.npmrc _authToken、.env 内容。OpenAI API key 安全文档明确建议不要把 API key commit 到仓库，并使用环境变量保存。
OpenAI Help Center

raw prompt、conversation transcript、tool messages、JSON-RPC params/result、MCP payload。

raw command output，包括测试输出、安装输出、npm ERR! 全量输出、shell trace。

raw stack trace。CodeQL 的 JS/TS 规则说明，stack trace 会暴露函数名、内部组件、服务端文件名甚至 SQL 等信息；更通用的错误信息应替代 stack trace。
codeql.github.com

私有绝对路径、用户名、主机名、repo 外路径、file:// URL。

源码片段。OWASP logging cheat sheet 将 application source code、access tokens、session identifiers、DB connection strings、encryption keys 等列为通常不应直接记录的内容，并要求对跨信任区日志数据做 input validation、sanitization、正确编码以避免 log injection。
cheatsheetseries.owasp.org

Node 项目里如果用 Pino 之类结构化 logger，可以把 redaction 放在 logger 层；Pino 文档支持用 redact 指定敏感 key path 并替换输出值。
GitHub
 但这里仍应以报告 schema allowlist为主，logger redaction 只是第二道防线。

3. product readiness / secret scan 应覆盖哪些路径和模式
路径覆盖

CI/product readiness 至少覆盖四类路径：

# 1. 当前 Git 内容与历史/变更
.
src/**
scripts/**
package.json
package-lock.json / pnpm-lock.yaml / yarn.lock
.github/**
.codex/**
AGENTS.md

# 2. 文档传播面
README*
CHANGELOG*
docs/**
references/**

# 3. 生成的本地报告与临时 evidence
logs/real-check/**
tmp/real-check/**
artifacts/**
coverage/**
test-results/**

# 4. 发布包内容
npm pack / npm publish dry-run 的文件列表与生成 tarball

npm 文档建议用 npm pack --dry-run 查看会被包含进包的文件；如果 package.json 有 files list，则只包含列出的文件/目录，.gitignore/.npmignore 也会影响包内容。
docs.npmjs.com
 npm 也提醒默认几乎整个目录都会暴露，若有 secret 内容应通过 .npmignore 或 fresh checkout 避免发布。
docs.npmjs.com
 因此 Node 项目最小方案是使用 package.json#files allowlist，而不是靠不断补 .npmignore 黑名单。

扫描模式

推荐组合：

Bash
# Git 历史/当前仓库扫描
gitleaks git --redact=100 --report-format=sarif --report-path=tmp/gitleaks-git.sarif .

# ignored/generated artifacts 扫描
gitleaks dir --redact=100 --report-format=json --report-path=tmp/gitleaks-artifacts.json logs/real-check docs references

# stdout/管道扫描，用于检查 --json 输出
npm run real:check -- --json | tee tmp/real-check-stdout.json | gitleaks stdin --redact=100

Gitleaks 官方文档列出 git、dir、stdin 三种扫描模式，并支持 --redact=100 对 logs/stdout 中发现的 secret 做完全遮蔽；也支持 JSON、SARIF 等报告格式。
GitHub
 GitHub secret scanning 应作为远端防线，启用 push protection；它会在命令行 push、GitHub UI commit、文件上传、REST API 等入口阻止检测到的 secret 进入仓库。
GitHub Docs
 自定义组织模式可覆盖默认 provider patterns 不覆盖的内部 token/报告泄露格式；GitHub 文档说明 custom pattern 会扫描仓库 Git 历史和所有分支。
GitHub Docs

需要额外检测的非 secret 泄露模式

Secret scanner 不一定能识别 raw prompt、stack trace、私有路径、JSON-RPC payload，因此再加一个轻量 grep/AST guard，专门扫生成报告和 docs：

raw_prompt|messages|conversation_id|turn_id|task_id
"jsonrpc"\s*:\s*"2\.0"
"params"\s*:
"result"\s*:
"stdout"\s*:
"stderr"\s*:
"stack"\s*:
"trace"\s*:
/Users/[^/\s]+
/home/[^/\s]+
C:\\Users\\
file://
process\.env
\.env
\.npmrc
_authToken
Authorization:
Bearer\s+[A-Za-z0-9._~+/-]+

CodeQL 也值得纳入 readiness，尤其是 JavaScript/TypeScript 的 clear-text logging 和 stack trace exposure 规则；CodeQL 文档明确指出敏感数据写入日志会让攻击者在获得日志访问时取得用户数据、完整路径、用户名和密码等信息。
codeql.github.com

4. 如何让 real:check 默认不污染工作树，同时还能把最终 sanitized evidence 纳入文档

采用“两阶段产物”：

阶段 A：默认本机报告，不写 tracked 文件
Bash
npm run real:check

行为：

运行前记录 git status --porcelain。

生成报告对象时只用 allowlisted schema。

写入 logs/real-check/*.json。

stdout 只打印一行摘要和报告路径。

stderr 只打印用户可读状态，不打印 raw error/stack/output。

运行后再次检查 git status --porcelain；如果出现除 ignored logs/real-check/** 之外的新文件，real:check fail。

.gitignore：

gitignore
# local calibration artifacts; never tracked
logs/
tmp/
artifacts/

# local env/secrets
.env
.env.*
!.env.example
.npmrc

package.json 建议：

JSON
{
 "files": [
 "dist",
 "README.md",
 "LICENSE",
 "CHANGELOG.md"
 ]
}

这样发布包默认只允许必要文件进入，而不是依赖黑名单排除日志。npm 文档也建议在 .npmignore 难维护时使用 package.json#files 这种 allowlist。
docs.npmjs.com

阶段 B：显式生成 tracked evidence
Bash
npm run real:check:evidence -- --from logs/real-check/latest.json --out docs/references/codex-remote-real-check.md

行为：

读取本地 sanitized report。

再跑一次 schema validation：拒绝未知字段。

再跑 redaction scanner：拒绝 token、raw prompt、raw JSON-RPC、stack、absolute path、stdout/stderr。

生成文档只包含最终结论、check matrix、sanitized error codes、evidence digest。

文档里不要写本地 report path；只写 evidence_id/hash，例如：

Markdown
# Codex Remote real:check Evidence

Generated: 2026-06-20T00:00:00Z 
Evidence ID: rc_7f31b9c02a44 
Redaction policy: real-check-redaction/v1 
Secret scan: passed

| Check | Status | Evidence |
|---|---|---|
| calibration | pass | exit_code=0, duration_ms=1234 |

这让 tracked docs 保持可审阅、可 diff、可长期保存，同时不把原始本机调试材料放进仓库。Codex 安全文档也强调网络访问会带来 prompt injection、代码或 secret 外传等风险；real:check 不应为了上传/同步 evidence 默认启用网络或外发日志。
OpenAI Developers

5. 最小实现步骤
Step 1：定义唯一 report schema

用 Zod/TypeBox/JSON Schema 定义 RealCheckReportV1，strict() 拒绝未知字段。

核心规则：

TypeScript
// 伪代码
const Report = z.object({
 schema_version: z.literal("real-check-report/v1"),
 generated_at: z.string().datetime(),
 tool: z.object({
 name: z.literal("codex-remote"),
 version: z.string(),
 redaction_policy: z.string()
 }),
 run: z.object({
 run_id: z.string(),
 conversation_ref: z.string().optional(),
 turn_ref: z.string().optional(),
 task_ref: z.string().optional()
 }),
 checks: z.array(Check),
 summary: Summary
}).strict();

不要让 Error、process.env、RPC request、child process result 直接进入 schema。

Step 2：实现 sanitizeError() 和 safeRef()
TypeScript
function safeRef(raw: string | undefined, salt: Buffer): string | undefined {
 if (!raw) return undefined;
 return "hmac12:" + hmacSha256(salt, raw).slice(0, 12);
}

function sanitizeError(err: unknown): { code: string; class: string; message: string } {
 return {
 code: classifyError(err),
 class: safeErrorClass(err),
 message: scrubOneLine(safeErrorMessage(err), 240)
 };
}

禁止返回 err.stack、err.cause、raw message、raw command output。

Step 3：命令执行只保留派生事实
TypeScript
type CommandEvidence = {
 check: string;
 exit_code: number;
 duration_ms: number;
 status: "pass" | "fail";
};

不要持久化：

TypeScript
child.stdout
child.stderr
child.spawnargs
process.cwd()
process.env

允许解析白名单输出，例如 node --version、npm --version，但不要保存任意命令输出。

Step 4：默认写 ignored logs，stdout 只写短摘要
TypeScript
const outDir = process.env.REAL_CHECK_REPORT_DIR ?? "logs/real-check";
const reportPath = path.join(outDir, `${timestamp}-${runId}.json`);

writeJsonAtomic(reportPath, report);
console.log(`real:check ${status} report=${reportPath} evidence=${evidenceId} sanitized=true`);

--json 也只输出 sanitized schema；不要让 --verbose 改变安全边界。需要本地深度 debug 时，使用显式 --unsafe-debug-local，并写 repo 外临时目录，且永不进入 docs/export。

Step 5：加 report leakage tests

测试输入里故意放：

sk-...
github_pat_...
npm_...
/Users/vint/private
/home/alice/private
C:\Users\alice\private
raw_prompt
"jsonrpc":"2.0"
"stdout":"..."
"stderr":"..."
Error: boom
 at /Users/alice/project/src/x.ts:1:1

断言 real:check 输出、logs/real-check/*.json、docs/references/*.md 均不包含这些原文。

Step 6：加 readiness script
JSON
{
 "scripts": {
 "real:check": "node scripts/real-check.mjs",
 "real:check:evidence": "node scripts/real-check-evidence.mjs",
 "scan:secrets:git": "gitleaks git --redact=100 --report-format=sarif --report-path=tmp/gitleaks-git.sarif .",
 "scan:secrets:artifacts": "gitleaks dir --redact=100 --report-format=json --report-path=tmp/gitleaks-artifacts.json logs/real-check docs references",
 "pack:check": "npm pack --dry-run",
 "ready": "npm test && npm run real:check && npm run scan:secrets:git && npm run scan:secrets:artifacts && npm run pack:check"
 }
}
Step 7：GitHub 侧启用 secret scanning + push protection + custom patterns

至少启用：

GitHub default supported secret patterns。

Push protection。

Custom patterns：内部 token、raw_prompt、jsonrpc params/result、conversation_id/turn_id/task_id raw 字段、stdout/stderr/stack 出现在 logs/real-check export 或 docs/references 中。

不对 docs/**、references/** 做 secret scanning exclude。

Step 8：文档更新必须走显式 export

PR 中允许出现：

docs/references/codex-remote-real-check.md

但不允许出现：

logs/**
tmp/**
*.real-check.json
raw-report.json

最终规则可以收敛成一句工程规范：

real:check 产物默认是 local ignored artifact；tracked docs 只能包含由 strict schema 生成、经过 redaction tests 与 secret scan 的 sanitized evidence。
