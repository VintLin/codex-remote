# Loading States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the startup connection entry show detailed child progress under each of the four major steps, while keeping non-core workbench panels locally loaded after entry.

**Architecture:** Keep `connectionEntry.ts` as the single pure model for the startup gate. Add child steps to each existing major step and render them inside the current connection step list. Do not add a global loading manager or new app-wide state machine.

**Tech Stack:** TypeScript, React, Next.js app code, `node:test`, shared CSS in `packages/ui`.

## Global Constraints

- No global loading manager.
- No new app-wide state machine.
- No mock or fake conversation fallback.
- Connection entry gates only the core workbench.
- The homepage never appears after only step 2.
- The homepage does not wait for non-core local panels.
- User-facing copy uses product terms: 控制中心, 设备目录, 本机 Codex 服务, 对话记录, 工作区.
- User-facing copy must not expose Control Plane, Worker, runtime, JSON-RPC, app-server, or raw protocol names.
- Keep the implementation in the existing files unless a test proves the file is no longer readable.
- Child-step progress in this plan is inferred visual progress inside the current major step. It is not real per-request event tracing.
- Do not add timers, polling, new request events, or simulated async state for child steps.

---

## File Map

- Modify: `apps/web/src/domain/connection/connectionEntry.ts`
  - Owns `ConnectionEntryModel`, major step status, child step status, and failure mapping.
- Modify: `apps/web/src/i18n/dictionaries/zh-CN.ts`
  - Adds Chinese child-step copy.
- Modify: `apps/web/src/i18n/dictionaries/en-US.ts`
  - Adds English child-step copy so `WebDictionary` stays compatible.
- Modify: `apps/web/src/components/shell/connection-entry.tsx`
  - Renders child steps inside each major step.
- Modify: `packages/ui/src/styles.css`
  - Styles child-step rows using existing design tokens and active spinner.
- Modify: `apps/web/src/domain/connection/connectionEntry.test.ts`
  - Proves the model exposes child steps and maps active/failed states.
- Modify: `apps/web/src/components/shell/connectionEntryLayout.test.ts`
  - Proves the component and CSS render child progress and avoid internal terms.

---

## Implementation Notes For Junior Agents

- Work only on the files listed in each task. The worktree is already dirty; do not revert or reformat unrelated files.
- Preserve existing import style, quote style, and CSS token usage.
- When the plan says "inside `connection`", insert near the existing `loadingDetails` and `stepDescriptions` fields so the dictionary remains readable.
- The child step states are intentionally coarse:
  - A `done` major step has all child steps `done`.
  - A `pending` major step has all child steps `pending`.
  - An `active` major step shows the first child as `done`, the second child as `active`, and the rest as `pending`.
  - A `failed` major step marks the second-to-last child as `failed`, earlier children as `done`, and later children as `pending`.
- Do not try to make each child step correspond to a real HTTP request in this iteration.

---

### Task 1: Add Child Steps To The Connection Model

**Files:**
- Modify: `apps/web/src/domain/connection/connectionEntry.ts`
- Modify: `apps/web/src/i18n/dictionaries/zh-CN.ts`
- Modify: `apps/web/src/i18n/dictionaries/en-US.ts`
- Test: `apps/web/src/domain/connection/connectionEntry.test.ts`

**Interfaces:**
- Consumes: `WebDictionary["connection"]`.
- Produces:
  - `WebDictionary["connection"]["stepDetails"]` with keys `control_center`, `device`, `codex_service`, `workspace`.
  - `export type ConnectionStepDetailStatus = "active" | "done" | "failed" | "pending";`
  - `export interface ConnectionStepDetail { label: string; status: ConnectionStepDetailStatus; }`
  - `ConnectionEntryStep.details: ConnectionStepDetail[]`

- [ ] **Step 1: Write failing tests for child steps**

Add these assertions to the existing `"when connecting, should show the selected device first and only expose three devices"` test in `apps/web/src/domain/connection/connectionEntry.test.ts`:

```ts
  assert.deepEqual(
    model.steps.map((step) => step.details.map((detail) => detail.label)),
    [
      ["读取连接配置", "校验访问凭证", "读取设备目录"],
      ["查找上次选择的设备", "确认设备在线状态", "保留设备切换入口"],
      ["建立设备连接", "检查本机 Codex 服务响应", "确认当前工作目录可访问"],
      ["读取项目列表", "读取对话列表", "载入当前对话时间线", "准备侧边栏与主内容区"],
    ],
  );
  assert.deepEqual(model.steps[0]?.details.map((detail) => detail.status), ["done", "done", "done"]);
  assert.deepEqual(model.steps[1]?.details.map((detail) => detail.status), ["done", "active", "pending"]);
  assert.deepEqual(model.steps[2]?.details.map((detail) => detail.status), ["pending", "pending", "pending"]);
```

Add this assertion to `"when the timeline cannot be read, should fail at the workspace step"`:

```ts
  assert.deepEqual(model.steps[3]?.details.map((detail) => detail.status), ["done", "done", "failed", "pending"]);
```

- [ ] **Step 2: Run the focused model test and confirm it fails**

Run:

```bash
pnpm --filter @codex-remote/web test -- src/domain/connection/connectionEntry.test.ts
```

Expected: FAIL because `ConnectionEntryStep` does not have `details`.

- [ ] **Step 3: Add dictionary copy**

In `apps/web/src/i18n/dictionaries/zh-CN.ts`, inside `connection`, insert `stepDetails` immediately after the existing `loadingDetails` block and before `stepDescriptions`:

```ts
    stepDetails: {
      control_center: ["读取连接配置", "校验访问凭证", "读取设备目录"],
      device: ["查找上次选择的设备", "确认设备在线状态", "保留设备切换入口"],
      codex_service: ["建立设备连接", "检查本机 Codex 服务响应", "确认当前工作目录可访问"],
      workspace: ["读取项目列表", "读取对话列表", "载入当前对话时间线", "准备侧边栏与主内容区"],
    },
```

In `apps/web/src/i18n/dictionaries/en-US.ts`, inside `connection`, insert `stepDetails` immediately after the existing `loadingDetails` block and before `stepDescriptions`:

```ts
    stepDetails: {
      control_center: ["Read connection settings", "Verify access credential", "Read device directory"],
      device: ["Find the last selected device", "Confirm device availability", "Keep device switching available"],
      codex_service: ["Establish device connection", "Check local Codex service response", "Confirm current workspace access"],
      workspace: ["Read projects", "Read conversations", "Load current conversation timeline", "Prepare sidebar and main content"],
    },
```

- [ ] **Step 4: Add the minimal model implementation**

In `apps/web/src/domain/connection/connectionEntry.ts`, add this type and interface directly after `export type ConnectionStepStatus = "active" | "done" | "failed" | "pending";`:

```ts
export type ConnectionStepDetailStatus = "active" | "done" | "failed" | "pending";

export interface ConnectionStepDetail {
  label: string;
  status: ConnectionStepDetailStatus;
}
```

Replace the existing `ConnectionEntryStep` interface with:

```ts
export interface ConnectionEntryStep {
  description: string;
  details: ConnectionStepDetail[];
  id: ConnectionStepId;
  label: string;
  status: ConnectionStepStatus;
}
```

Add these helper functions directly above `function createConnectionSteps`:

```ts
function createConnectionStepDetails(
  copy: WebDictionary["connection"],
  stepId: ConnectionStepId,
  stepStatus: ConnectionStepStatus,
): ConnectionStepDetail[] {
  const labels = copy.stepDetails[stepId];
  return labels.map((label, index) => ({
    label,
    status: resolveConnectionStepDetailStatus(stepStatus, index, labels.length),
  }));
}

function resolveConnectionStepDetailStatus(
  stepStatus: ConnectionStepStatus,
  index: number,
  count: number,
): ConnectionStepDetailStatus {
  if (stepStatus === "done") {
    return "done";
  }
  if (stepStatus === "pending") {
    return "pending";
  }
  if (stepStatus === "failed") {
    return index === Math.max(0, count - 2) ? "failed" : index < Math.max(0, count - 2) ? "done" : "pending";
  }
  return index === 0 ? "done" : index === 1 ? "active" : "pending";
}
```

Replace the entire existing `createConnectionSteps` function with this full function. Do not patch its branches one by one:

```ts
function createConnectionSteps(
  copy: WebDictionary["connection"],
  status: ConnectionEntryStatus,
  failedStepId: ConnectionStepId | null,
  hasDevices: boolean,
): ConnectionEntryStep[] {
  const connectionSteps = getConnectionSteps(copy);
  if (status === "connected") {
    return connectionSteps.map((step) => ({
      ...step,
      details: createConnectionStepDetails(copy, step.id, "done"),
      status: "done",
    }));
  }
  if (status === "connecting") {
    const activeIndex = hasDevices ? 1 : 0;
    return connectionSteps.map((step, index) => {
      const stepStatus = index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
      return {
        ...step,
        details: createConnectionStepDetails(copy, step.id, stepStatus),
        status: stepStatus,
      };
    });
  }

  const failedIndex = connectionSteps.findIndex((step) => step.id === failedStepId);
  return connectionSteps.map((step, index) => {
    const stepStatus = index < failedIndex ? "done" : index === failedIndex ? "failed" : "pending";
    return {
      ...step,
      details: createConnectionStepDetails(copy, step.id, stepStatus),
      status: stepStatus,
    };
  });
}
```

- [ ] **Step 5: Run the focused model test and typecheck**

Run:

```bash
pnpm --filter @codex-remote/web test -- src/domain/connection/connectionEntry.test.ts
pnpm --filter @codex-remote/web typecheck
```

Expected: PASS for both commands.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/domain/connection/connectionEntry.ts apps/web/src/domain/connection/connectionEntry.test.ts apps/web/src/i18n/dictionaries/zh-CN.ts apps/web/src/i18n/dictionaries/en-US.ts
git commit -m "feat: model startup child progress"
```

---

### Task 2: Render Child Steps In The Connection Entry

**Files:**
- Modify: `apps/web/src/components/shell/connection-entry.tsx`
- Modify: `packages/ui/src/styles.css`
- Test: `apps/web/src/components/shell/connectionEntryLayout.test.ts`

**Interfaces:**
- Consumes: `model.steps[].details`.
- Produces: DOM classes:
  - `connection-entry-step-details`
  - `connection-entry-step-detail`
  - `connection-entry-step-detail-dot`
  - `connection-entry-step-detail-label`

- [ ] **Step 1: Write failing layout assertions**

In `apps/web/src/components/shell/connectionEntryLayout.test.ts`, add to `"when the workbench is not connected, should render the unified connection entry model"`:

```ts
  assert.match(connectionEntryComponent, /model\.steps\.map/);
  assert.match(connectionEntryComponent, /step\.details\.map/);
  assert.match(connectionEntryComponent, /connection-entry-step-details/);
  assert.match(connectionEntryComponent, /connection-entry-step-detail-dot/);
```

Add to `"when connection entry styles are rendered, should use existing design tokens"`:

```ts
  assert.match(styles, /\.connection-entry-step-details\s*\{/);
  assert.match(styles, /\.connection-entry-step-detail\.is-active\s+\.connection-entry-step-detail-dot\s*\{[^}]*animation:\s*connection-entry-spin/s);
```

- [ ] **Step 2: Run layout test and confirm it fails**

Run:

```bash
pnpm --filter @codex-remote/web test -- src/components/shell/connectionEntryLayout.test.ts
```

Expected: FAIL because the component and CSS do not render child step details.

- [ ] **Step 3: Render details in the component**

In `apps/web/src/components/shell/connection-entry.tsx`, find this existing block:

```tsx
                  <span className="connection-entry-step-copy">
                    <span className="connection-entry-step-title">{step.label}</span>
                    <span className="connection-entry-step-description">{step.description}</span>
                  </span>
```

Replace it with:

```tsx
                  <span className="connection-entry-step-copy">
                    <span className="connection-entry-step-title">{step.label}</span>
                    <span className="connection-entry-step-description">{step.description}</span>
                    <span className="connection-entry-step-details">
                      {step.details.map((detail) => (
                        <span className={`connection-entry-step-detail is-${detail.status}`} key={detail.label}>
                          <span aria-hidden="true" className="connection-entry-step-detail-dot" />
                          <span className="connection-entry-step-detail-label">{detail.label}</span>
                        </span>
                      ))}
                    </span>
                  </span>
```

- [ ] **Step 4: Add minimal CSS**

In `packages/ui/src/styles.css`, add this CSS immediately after the existing `.connection-entry-step-title` rule and before `.connection-entry-retry`:

```css
.connection-entry-step-details {
  display: grid;
  min-width: 0;
  gap: 5px;
  padding-top: 4px;
}

.connection-entry-step-detail {
  display: grid;
  min-width: 0;
  grid-template-columns: 8px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  color: var(--cr-muted);
  font-size: var(--cr-text-meta);
  line-height: 1.35;
}

.connection-entry-step-detail-label {
  min-width: 0;
  overflow-wrap: anywhere;
}

.connection-entry-step-detail-dot {
  width: 6px;
  height: 6px;
  border: var(--cr-stroke);
  border-radius: var(--cr-pill-radius);
  background: var(--cr-bg);
}

.connection-entry-step-detail.is-done .connection-entry-step-detail-dot {
  border-color: var(--cr-success);
  background: var(--cr-success);
}

.connection-entry-step-detail.is-active {
  color: var(--cr-ink);
}

.connection-entry-step-detail.is-active .connection-entry-step-detail-dot {
  border-color: var(--cr-accent);
  border-top-color: color-mix(in oklch, var(--cr-accent) 24%, var(--cr-line));
  animation: connection-entry-spin 0.8s linear infinite;
}

.connection-entry-step-detail.is-failed {
  color: var(--cr-danger-ink);
}

.connection-entry-step-detail.is-failed .connection-entry-step-detail-dot {
  border-color: var(--cr-danger);
  background: var(--cr-danger);
}
```

- [ ] **Step 5: Run layout test and confirm it passes**

Run:

```bash
pnpm --filter @codex-remote/web test -- src/components/shell/connectionEntryLayout.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/shell/connection-entry.tsx packages/ui/src/styles.css apps/web/src/components/shell/connectionEntryLayout.test.ts
git commit -m "feat: render startup child progress"
```

---

### Task 3: Verify Startup Gate And Browser Behavior

**Files:**
- Modify only if verification reveals a real bug:
  - `apps/web/src/components/shell/codex-remote-app.tsx`
  - `apps/web/src/data/workbenchData.ts`
  - `apps/web/src/data/workerApi/client.ts`

**Interfaces:**
- Consumes: the child-step model and rendered connection entry from Tasks 1-2.
- Produces: verified behavior only. Do not refactor startup loading unless a test or browser run proves it is needed.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm --filter @codex-remote/web test -- src/domain/connection/connectionEntry.test.ts src/components/shell/connectionEntryLayout.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run package checks**

Run:

```bash
pnpm --filter @codex-remote/web typecheck
pnpm --filter @codex-remote/ui lint
```

Expected: PASS.

- [ ] **Step 3: Start or confirm the dev server**

Run:

```bash
pnpm web:status || pnpm web:start
```

Expected: the app is available at `http://127.0.0.1:5173`.

- [ ] **Step 4: Browser smoke the connection entry**

Open:

```text
http://127.0.0.1:5173/zh-CN?reload=startup-child-progress
```

Verify in the browser:

- The connection entry appears before the workbench.
- Four major steps are visible.
- The active major step shows child rows underneath it.
- At least one child row has visible active loading.
- The top summary still exists, but it is not the only visible progress text.
- After startup completes, the workbench opens with Sidebar and main content.

Run this in the browser console while the connection entry is visible:

```js
({
  majorSteps: document.querySelectorAll(".connection-entry-step").length,
  detailGroups: document.querySelectorAll(".connection-entry-step-details").length,
  detailRows: document.querySelectorAll(".connection-entry-step-detail").length,
  activeDetails: document.querySelectorAll(".connection-entry-step-detail.is-active").length,
  hasOnlySummary: document.querySelectorAll(".connection-entry-summary-details span").length > 0
    && document.querySelectorAll(".connection-entry-step-detail").length === 0,
})
```

Expected object while loading:

```js
{
  majorSteps: 4,
  detailGroups: 4,
  detailRows: 13,
  activeDetails: 1,
  hasOnlySummary: false,
}
```

After the app enters the workbench, run:

```js
({
  connectionEntryVisible: document.querySelector(".connection-entry-shell") !== null,
  workbenchVisible: document.querySelector(".workspace-shell, .resizable-workspace-shell, aside, main") !== null,
})
```

Expected:

```js
{
  connectionEntryVisible: false,
  workbenchVisible: true,
}
```

- [ ] **Step 5: Commit only if Task 3 changed code**

If Step 4 required fixes, commit only the changed files:

```bash
git add apps/web/src/components/shell/codex-remote-app.tsx apps/web/src/data/workbenchData.ts apps/web/src/data/workerApi/client.ts
git commit -m "fix: align startup gate with child progress"
```

If no code changed, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Core startup gate remains in `connectionEntry.ts`: Tasks 1 and 3.
- Four major steps get visible child steps: Tasks 1 and 2.
- Active child progress is visible, not only a top summary sentence: Tasks 1 and 2.
- Non-core panels remain locally loaded and are not moved into startup gate: Global Constraints and Task 3.
- User-facing copy avoids internal terms: Task 1 and layout test in Task 2.

Placeholder scan:

- No `TBD`, `TODO`, "implement later", or "similar to" instructions are present.
- Every code-changing step includes exact code or exact assertions.

Type consistency:

- `ConnectionStepDetailStatus`, `ConnectionStepDetail`, and `ConnectionEntryStep.details` are defined in Task 1 and consumed in Task 2.
- `stepDetails` is produced by dictionaries and consumed by the model in Task 1.
