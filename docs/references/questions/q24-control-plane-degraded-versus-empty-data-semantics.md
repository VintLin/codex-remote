---
title: "Q24：Control Plane degraded versus empty-data semantics"
source_url: "https://chatgpt.com/c/6a364d63-1f00-83ee-864a-d9ea79ee3ab2"
exported_at: "2026-06-20T17:08:15"
open_method: "anchor"
clicked_copy: "False"
used_fallback_text: "True"
---

调研结论

本项目的 Control Plane 本质上是一个 aggregation/control-plane API：Web 调一次 /v1/devices 或 /v1/conversations，Control Plane fan-out 到多个 Worker，再合并结果。类似模式里，聚合层必须显式处理“部分失败、超时、依赖不可用”，而不是把下游失败吞成空结果。Azure Gateway Aggregation 明确建议：下游超时或错误时，可以在业务允许时返回 partial response；如果完整一致数据是必需的，则应失败整个请求，并通过 telemetry 标明哪个依赖导致 partial/failed response。
Microsoft Learn
+1

HTTP 语义上，401/403 应只表达 Web → Control Plane 的认证/授权问题；503/504/424 才适合表达 Control Plane 因 Worker 依赖无法完成请求。RFC 9110 定义了 401、403、503、504 的含义，RFC 4918 定义了 424 Failed Dependency，RFC 9457 建议用 Problem Details 作为机器可读错误体。
IETF Datatracker
+2
IETF
+2

1. 三个 endpoint 在 all-down、partial-down、unauthorized、timeout 时应返回什么

以下假设 /v1/control-plane/health 是 readiness + dependency summary，不是单纯 liveness。Kubernetes API health endpoint 的实践是：机器应依赖 HTTP status，200 表示 ready/live/healthy，失败状态表示不能接流量；详细检查结果主要给人和调试工具看。
Kubernetes

/v1/control-plane/health
场景 推荐 HTTP body 语义 说明
所有 Worker 正常 200 status: "healthy" Control Plane 可聚合完整真实数据。
partial-down：部分 Worker 断线、超时、401、5xx 200 status: "degraded"，degraded: true，列出失败 Worker Control Plane 仍可服务部分真实数据。健康状态是 degraded，不是 unhealthy。
all-down：所有 Worker 网络不可达 / connection refused / 5xx 503 status: "unhealthy"，reason: "all_workers_unavailable" 这是 readiness 失败。可加 Retry-After。
Web → CP unauthorized：缺 token / token 无效 401 application/problem+json，code: "UNAUTHENTICATED" 不暴露 Worker 细节。401 应带 WWW-Authenticate。
IETF Datatracker

Web → CP forbidden：token 有效但无 scope 403 application/problem+json，code: "FORBIDDEN" 不应让 Web 重复使用同一凭证重试。
IETF Datatracker

CP → Worker token 错误，但至少一个 Worker 正常 200 status: "degraded"，失败 Worker 标 unauthorized / forbidden 不能把它变成 top-level 401，否则 Web 会误以为用户登录失效。
CP → Worker token 全错 503 for health status: "unhealthy"，reason: "dependency_unauthorized" 对 health/readiness 来说，Control Plane 已不能提供真实聚合能力。
timeout：部分 Worker 超时 200 status: "degraded"，timedOutWorkers: [...] 健康端点仍返回 degraded。
timeout：所有 Worker 超时 503 for health status: "unhealthy"，reason: "all_workers_timeout" health endpoint 不建议用 504，因为监控/编排主要关心 ready/not ready。
/v1/devices 和 /v1/conversations

这两个是集合查询 endpoint。核心规则：data: [] 只表示“所有参与聚合的真实 Worker 都成功响应，且确实没有数据”。任何 Worker 失败都必须进入 meta 或 problem response。

场景 推荐 HTTP response Web 应解释为
所有 Worker 成功，且都无数据 200 { data: [], meta: { state: "empty", complete: true } } 真实 empty
所有 Worker 成功，部分有数据 200 { data: [...], meta: { state: "loaded", complete: true } } 完整 loaded
partial-down：至少一个 Worker 成功，至少一个失败 200 { data: [...], meta: { state: "degraded", complete: false, workers: [...] } } partial data；显示降级提示
all-down：无 Worker 成功，网络/进程不可用 503 application/problem+json，code: "ALL_WORKERS_UNAVAILABLE" unavailable；不要显示 empty
Web → CP token 缺失/无效 401 application/problem+json，code: "UNAUTHENTICATED" 进入登录/重新认证流程
Web → CP token 有效但无权限 403 application/problem+json，code: "FORBIDDEN" 权限不足，不应重试同一 token
CP → Worker token 错误，部分 Worker 成功 200 state: "degraded"，失败 Worker 标 unauthorized / forbidden partial data；不是用户登出
CP → Worker token 全错，或请求指定的 Worker token 错 424 application/problem+json，code: "WORKER_AUTH_FAILED" dependency misconfigured / failed dependency
partial timeout 200 state: "degraded"，失败 Worker 标 timeout partial data
all timeout / required Worker timeout 504 application/problem+json，code: "UPSTREAM_TIMEOUT" unavailable，可重试
Control Plane 自身未配置 Worker registry 503 application/problem+json，code: "NOT_CONFIGURED" not_configured
fallback 到示例数据 200 only if explicitly enabled { data: [...], meta: { state: "example", source: "example" } } example；必须显示“示例数据”

/v1/conversations 如果带 deviceId、workerId 或能唯一映射到某个 Worker，则该 Worker 是 required dependency。此时不能拿其他 Worker 的结果冒充 partial；应按该 Worker 的实际失败类型返回 424/503/504。

2. 何时返回 200 + degraded metadata，何时返回 424/503/401/403
返回 200 + degraded metadata

条件同时满足：

至少一个真实 Worker 成功返回；

失败 Worker 对当前请求不是 required dependency；

Web 可以正确展示 partial data；

response 明确包含 complete: false、失败 Worker 列表、失败原因；

不自动混入 example data。

示例：

JSON
{
 "data": [
 { "id": "dev_1", "name": "Pixel 8", "workerId": "worker-a" }
 ],
 "meta": {
 "state": "degraded",
 "complete": false,
 "source": "control_plane",
 "requestId": "req_01J...",
 "generatedAt": "2026-06-20T10:30:00.000Z",
 "workers": [
 {
 "id": "worker-a",
 "status": "ok",
 "itemCount": 1,
 "latencyMs": 42
 },
 {
 "id": "worker-b",
 "status": "timeout",
 "errorCode": "WORKER_TIMEOUT",
 "timeoutMs": 1500
 }
 ]
 }
}

健康建模里常见的三态是 Healthy / Degraded / Unhealthy：degraded 表示功能仍可用但性能或能力下降，unhealthy 才表示不可用或不可接受。这个模型适合本项目的 partial Worker 情况。
Microsoft Learn
+1

返回 401

只用于 Web → Control Plane：

缺少 token；

token 格式错误；

token 过期；

signature 无效；

issuer/audience 不匹配。

不要把 CP → Worker 401 透传成 top-level 401，否则 Web 会错误地清用户 session。

返回 403

只用于 Web → Control Plane 已认证但无权限：

用户 token 有效，但缺少 devices:read / conversations:read；

当前 user/tenant 不允许访问该 Control Plane；

请求某个 device/conversation 但 user 无授权。

返回 424 Failed Dependency

建议只在你们愿意把 424 纳入 API contract 时使用。适用场景：

Web 请求本身合法、已认证；

Control Plane 正常运行；

但 required Worker dependency 因配置/token/协议前置条件失败，导致请求无法完成；

同一 Web 请求立即重试通常无效，需要修 Control Plane 或 Worker 配置。

典型：

JSON
{
 "type": "https://codex.example/problems/worker-auth-failed",
 "title": "Worker authentication failed",
 "status": 424,
 "code": "WORKER_AUTH_FAILED",
 "detail": "Control Plane could not authenticate to the required Worker.",
 "requestId": "req_01J...",
 "sourceState": "unavailable",
 "workers": [
 {
 "id": "worker-a",
 "status": "unauthorized",
 "errorCode": "WORKER_UNAUTHORIZED"
 }
 ]
}

424 来自 WebDAV，但语义正好是“当前方法依赖的另一个动作失败，所以无法执行”。它不如 503/504 常见，因此如果客户端或网关生态不支持 424，可以退而使用 503，但必须用 problem.code = "WORKER_AUTH_FAILED" 区分。
IETF

返回 503 Service Unavailable

用于 Control Plane 当前不能提供该能力，但通常是服务/依赖可用性问题：

all workers down；

worker registry 为空或未配置；

Control Plane degraded 到低于服务阈值；

downstream pool 全部不可用；

maintenance / overload；

health/readiness 失败。

503 按 RFC 语义是服务当前无法处理请求，可能是临时过载或维护，并可带 Retry-After。
IETF Datatracker

timeout 建议返回 504 Gateway Timeout

虽然你的问题列了 424/503/401/403，但对 /v1/devices 和 /v1/conversations，如果 Control Plane 作为 gateway/aggregator 等待 Worker 超时且无法返回 partial，504 比 503 更精确。RFC 9110 对 504 的定义就是 gateway/proxy 没有从 upstream server 及时收到响应。
IETF Datatracker

对 /v1/control-plane/health，建议仍用 503 表示 not ready，因为 health/readiness 通常只需要机器可判定的 ready/not-ready。

3. Web source taxonomy 建议

建议 Web 的 data source state 独立于 React/SWR/TanStack 的 loading/error 状态，专门表达“数据来源可信度”。

state 含义 何时进入 UI 行为
loaded 真实数据，完整加载 200，meta.complete: true，data.length > 0，source: "control_plane" 正常展示
empty 真实查询成功，但没有数据 200，meta.complete: true，data.length === 0 显示 empty state，例如“没有 conversations”
degraded 有真实 partial data，但不完整 200，meta.complete: false 展示数据 + warning：“部分 Worker 不可用，结果可能不完整”
unavailable 没有可信真实数据 503/504/424，或 200 但没有真实 source 不应出现 显示错误/重试，不显示 empty
not_configured Control Plane URL、worker registry、token binding 等未配置 problem code: "NOT_CONFIGURED"；或 Web 本地 env 缺失 显示 setup/config error
example 示例/mock/demo 数据 200 且 meta.source: "example" / meta.state: "example" 必须显示“示例数据”；不得标为 loaded

补充建议：401/403 不要塞进 source taxonomy。它们是 session/permission 状态，不是数据源状态。如果必须统一进 source state，可映射成 unavailable，但 UI 分支仍应按 auth error 处理。

4. 最小 API schema 变更建议

目标是避免过度设计：不改现有 data item shape，只给 collection response 增加 meta，给失败 response 统一 problem+json。

4.1 Collection success response

用于 /v1/devices 和 /v1/conversations 的 2xx response：

TypeScript
type CollectionResponse<T> = {
 data: T[];
 meta: {
 state: "loaded" | "empty" | "degraded" | "example";
 complete: boolean;
 source: "control_plane" | "example";
 requestId: string;
 generatedAt: string;
 workers?: WorkerResultSummary[];
 };
};

type WorkerResultSummary = {
 id: string;
 status:
 | "ok"
 | "empty"
 | "unavailable"
 | "timeout"
 | "unauthorized"
 | "forbidden"
 | "invalid_response"
 | "error";
 itemCount?: number;
 latencyMs?: number;
 timeoutMs?: number;
 errorCode?: string;
};

规则：

state: "empty" 要求所有 required/participating Worker 都成功，且总 data.length === 0。

state: "degraded" 要求至少一个真实 Worker 成功，且至少一个非 required Worker 失败。

state: "example" 必须 source: "example"。

complete: false 时 Web 不能展示“没有数据”，只能展示 partial/degraded。

不要在 WorkerResultSummary 里放 token、raw stack、完整 URL、内部 IP。最多放 sanitized worker id 和 error code。

4.2 Health response
TypeScript
type ControlPlaneHealth = {
 status: "healthy" | "degraded" | "unhealthy" | "not_configured";
 requestId: string;
 timestamp: string;
 version?: string;
 workerSummary: {
 total: number;
 ok: number;
 failed: number;
 timedOut: number;
 unauthorized: number;
 };
 checks: Array<{
 name: string; // e.g. "worker:worker-a"
 status:
 | "ok"
 | "degraded"
 | "unavailable"
 | "timeout"
 | "unauthorized"
 | "forbidden"
 | "error";
 latencyMs?: number;
 errorCode?: string;
 }>;
};

Health endpoint 可返回 200 with status: "degraded"，但 all-down/not-configured 应返回 503。Azure health endpoint guidance 也强调 health endpoint 应执行必要检查，并用 response code 表示应用状态，同时可在内容里提供组件/依赖状态。
Microsoft Learn

4.3 Error response：统一 Problem Details

用 application/problem+json：

TypeScript
type ProblemResponse = {
 type: string;
 title: string;
 status: number;
 detail?: string;
 code:
 | "UNAUTHENTICATED"
 | "FORBIDDEN"
 | "NOT_CONFIGURED"
 | "ALL_WORKERS_UNAVAILABLE"
 | "WORKER_AUTH_FAILED"
 | "UPSTREAM_TIMEOUT"
 | "INVALID_WORKER_RESPONSE"
 | "CONTROL_PLANE_UNAVAILABLE";
 requestId: string;
 sourceState: "unavailable" | "not_configured";
 workers?: WorkerResultSummary[];
};

RFC 9457 的目的就是避免每个 HTTP API 自创错误格式，让错误可机器读取、可扩展。
IETF Datatracker

4.4 Hono 落地建议

用 Promise.allSettled() 聚合 Worker 调用，禁止 catch(() => [])。

每个 Worker 调用用 AbortController 设置 per-worker timeout。

Hono 里用 HTTPException 或统一 app.onError 返回 status + custom response；Hono 文档支持抛出带 status/custom response 的 HTTPException，也支持 app.onError 统一处理未捕获错误。
hono.dev
+1

Hono timeout middleware 可设置最大请求时长并自定义 timeout response；用于兜底，避免请求挂死。
hono.dev

增加 X-Request-ID；可选 Server-Timing 或 metrics 记录每个 Worker latency。Hono 也有 Server-Timing middleware 可输出性能指标。
hono.dev

5. 验证用例清单
ID 场景 期望
V1 所有 Worker 返回 200 [] /v1/devices 返回 200，data: []，meta.state: "empty"，complete: true。
V2 Worker A 返回 1 个 device，Worker B 返回 [] 200，state: "loaded"，complete: true，data.length === 1。
V3 Worker A 返回数据，Worker B connection refused 200，state: "degraded"，complete: false，B 标 unavailable；Web 不显示 empty。
V4 所有 Worker connection refused /v1/devices、/v1/conversations 返回 503 problem+json，code: "ALL_WORKERS_UNAVAILABLE"；/health 返回 503 unhealthy。
V5 Worker A 正常，Worker B 返回 401 collection 返回 200 degraded，B 标 unauthorized；top-level 不能是 401。
V6 所有 Worker 都返回 401 collection 返回 424 problem+json，code: "WORKER_AUTH_FAILED"；health 返回 503，body reason 为 dependency_unauthorized。
V7 Web 请求缺少 Control Plane token 返回 401，带 WWW-Authenticate，不调用任何 Worker。
V8 Web token 有效但缺少 devices:read 返回 403，不调用任何 Worker。
V9 Worker A 正常，Worker B 超过 per-worker timeout collection 返回 200 degraded，B 标 timeout，包含 timeoutMs。
V10 所有 Worker timeout collection 返回 504 problem+json，code: "UPSTREAM_TIMEOUT"；health 返回 503 unhealthy。
V11 /v1/conversations?deviceId=dev_1 映射到 Worker B，Worker B down 不允许用 Worker A 的 conversations 顶替；按 B 的失败返回 503/504/424。
V12 Worker 返回 invalid JSON / schema 不匹配 如果有其他 Worker 成功，返回 200 degraded，该 Worker 标 invalid_response；如果 required/all failed，返回 502 或 503，code: "INVALID_WORKER_RESPONSE"。
V13 Worker registry 为空，example disabled /health 返回 503 not_configured；collection 返回 503 problem+json，code: "NOT_CONFIGURED"；Web state 为 not_configured。
V14 example mode enabled collection 返回 200，meta.state: "example"，source: "example"；Web 显示“示例数据”。
V15 real source configured 但 all-down，同时 example fallback 存在 默认不得自动返回 example。若产品要求 fallback，必须 state: "example" 且 fallbackFrom: "unavailable"，不能标 loaded。
V16 回归测试：某 Worker fetch reject 断言 reject 不会变成该 Worker 的 []；必须出现在 meta.workers[].status 或 problem workers[]。
V17 request id 所有 success/degraded/error response 都包含 requestId，日志能按 requestId 查到每个 Worker 的结果。
V18 安全 problem/details 不泄露 Worker token、完整内部 URL、stack trace。
V19 cache degraded、unavailable、not_configured response 默认 Cache-Control: no-store，避免 Web 缓存故障状态。
V20 Hono route timeout 超过 route-level timeout 时返回统一 problem+json，不是默认 HTML/text，也不是空数组。

最小可执行变更就是：保留 data，新增 meta；错误统一 problem+json；把 Worker 聚合从 catch(() => []) 改成 all-settled + typed worker status。
