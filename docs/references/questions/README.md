# Research Answers

Start with `SYNTHESIS.md`. It is the maintained index of adopted decisions and remaining local verification work.

## Retained Answers

These answers still provide useful detail for upcoming stage specs:

| Question | Answer file | Why retained |
| --- | --- | --- |
| Q1 | `q01-codex-app-server-local-transport.md` | Stage 2 transport and app-server lifecycle |
| Q2 | `q02-thread-turns-list-protocol-gap.md` | timeline fallback and experimental protocol handling |
| Q4 | `q04-worker-readonly-http-api-endpoints.md` | Worker HTTP API read-only shape |
| Q5 | `q05-app-server-streaming-events.md` | future streaming and event projection |
| Q6 | `q06-thread-start-resume-turn-start.md` | future write/follow-up modeling |
| Q7 | `q07-approval-request-lifecycle.md` | approval registry and decision lifecycle |
| Q9 | `q09-control-plane-auth-device-pairing.md` | device pairing and Control Plane auth |
| Q11 | `q11-ios-api-contract-constraints.md` | future iOS API guardrails |
| Q12 | `q12-device-worker-installation-management.md` | Worker productization |
| Q14 | `q14-db-driver-selection.md` | Stage 7 SQLite driver decision |
| Q15 | `q15-control-plane-reverse-connection-transport.md` | Stage 6 reverse connection |
| Q16 | `q16-device-bound-token-mvp.md` | Stage 6 auth threat model input |
| Q17 | `q17-cross-platform-secret-storage.md` | Worker identity secret storage |
| Q18 | `q18-worker-app-server-session-lifecycle.md` | Worker 连接生命周期与 initialize/initialized 顺序 |
| Q19 | `q19-public-project-identity-and-discovery.md` | project/projectId 身份映射与隐私边界 |
| Q20 | `q20-owned-app-server-transport-choice.md` | Worker-owned app-server 传输策略与 debug fallback |
| Q21 | `q21-real-command-control-protocol-compatibility.md` | write/follow-up/interrupt/steer 可复现能力核验 |
| Q22 | `q22-safe-active-turn-and-pending-approval-scenarios.md` | active turn 与 pending approval 安全策略 |
| Q23 | `q23-thread-list-cwd-scope-and-pagination-behavior.md` | thread/list(cwd/pagination) 语义 |
| Q24 | `q24-control-plane-degraded-versus-empty-data-semantics.md` | 空态与退化态语义分离 |
| Q25 | `q25-real-web-e2e-gate-and-playwright-decision.md` | web real:check 中的 E2E 最小门禁 |
| Q26 | `q26-calibration-report-destination-and-secret-scanning.md` | 校准产物落地与扫描边界 |
| Q27 | `q27-task-link-integrity-checks.md` | task-link 数据一致性校验规则 |
| Q28 | `q28-local-self-hosted-external-asset-policy.md` | self-hosted 资源请求与离线策略 |

## Archived Process Material

Low-value or fully absorbed material was moved to `docs/archives/references/questions/`:

- `q03-worker-http-api-stack.md`
- `q08-turn-interrupt-steer-races.md`
- `q10-db-stack-selection.md`
- `q13-e2e-playwright-introduction.md`
- `research-prompts-archive.md`
- `import*.json`

Those files are retained for auditability but are not part of the active reference set.
