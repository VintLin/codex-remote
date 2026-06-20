# Local Self-Hosting Runbook

This runbook describes the local development posture for Codex Remote. It is not an installer, production deployment guide, or secret-storage policy.

## Topology

```mermaid
flowchart LR
  Web["Web 127.0.0.1:5173"]
  CP["Control Plane 127.0.0.1:8786"]
  WorkerA["Worker A 127.0.0.1:8787"]
  WorkerB["Worker B 127.0.0.1:8788"]
  DB["SQLite task DB"]
  AppServer["Codex app-server"]

  Web --> CP
  CP --> WorkerA
  CP --> WorkerB
  CP --> DB
  WorkerA --> AppServer
  WorkerB --> AppServer
```

## Secret Rules

- Keep real tokens in the shell environment or an operator-chosen local secret manager.
- Do not commit tokens, provider keys, Codex auth, ChatGPT auth, service arguments with secrets, raw upstream URLs with credentials, raw protocol frames, prompts, command output, full diffs, stack traces, or private paths.
- Use only placeholders in repo docs and examples: `REDACTED` or `example-token`.
- Current bearer tokens are a local development posture, not device-bound auth.

## Worker

Required environment:

```bash
export CODEX_REMOTE_WORKER_TOKEN=example-token
export CODEX_REMOTE_ALLOWED_ORIGINS=http://127.0.0.1:8786
export CODEX_REMOTE_ALLOWED_PROJECT_ROOT=.
export CODEX_REMOTE_DEVICE_ID=local-device
export CODEX_REMOTE_HTTP_PORT=8787
```

Start:

```bash
pnpm --filter @codex-remote/worker serve:read
```

Notes:

- Worker must bind loopback.
- Worker is the only app that talks to Codex app-server.
- `CODEX_REMOTE_START_APP_SERVER=true` may start the local app-server through the Worker boundary.

## Control Plane

Required environment:

```bash
export CODEX_REMOTE_CONTROL_PLANE_CONFIG='{"publicToken":"example-token","taskDatabasePath":"./logs/codex-remote-tasks.sqlite","devices":[{"id":"local-device","name":"Local Device","baseUrl":"http://127.0.0.1:8787","token":"example-token"}]}'
```

Start:

```bash
pnpm --filter @codex-remote/control-plane serve
```

Notes:

- Control Plane must bind loopback.
- Worker upstream URLs and bearer tokens stay in process memory.
- Control Plane persists only task board data in SQLite at this stage.

## Web

Start:

```bash
CODEX_REMOTE_CONTROL_PLANE_BASE_URL=http://127.0.0.1:8786 \
CODEX_REMOTE_CONTROL_PLANE_TOKEN=example-token \
pnpm web:start
```

Status and stop:

```bash
pnpm web:status
pnpm web:stop
```

Open the Web workbench at `http://127.0.0.1:5173`.

## Validation

Run the product readiness check before using the local stack:

```bash
pnpm product:check
```

Run the repository gate before committing:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Troubleshooting

- Worker unavailable: device status should degrade without exposing Worker token or upstream URL.
- Invalid Control Plane config: startup should fail with a sanitized config error.
- Empty task DB: Web task board should show an empty state, not mock persisted tasks.
- Control Plane unavailable: Web should show a sanitized unavailable or fallback state without raw URLs, tokens, paths, protocol frames, prompts, command output, full diffs, or stack traces.

## Later Work

These are not part of the current local readiness slice:

- OS installer, LaunchAgent, systemd user service, Windows Scheduled Task, auto-update, or notarization.
- OS keychain, pairing, token rotation, revocation, device-bound auth, or audit log.
- Reverse WSS, relay server, public tunnel, cloud deployment, production TLS, or multi-tenant hosting.
- Full iOS app, mobile sync, or native build pipeline.
