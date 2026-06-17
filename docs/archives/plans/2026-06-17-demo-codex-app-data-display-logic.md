# Demo Codex App Data Display Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current Web demo reliably display captured Codex App app-server data without silently converting missing, unknown, or failed data into normal-looking UI states.

**Architecture:** Keep the implementation scoped to the existing Web demo and fixture adapter. Do not introduce Control Plane, Worker, DB, or generated protocol packages in this plan; instead, harden the current snapshot-to-view-model path so the demo remains truthful and stable.

**Tech Stack:** TypeScript, Next.js client components, Node test runner, pnpm, Turborepo.

---

## File Structure

- Modify `apps/web/src/mockData.ts`: extend demo view-model status unions and search result shape.
- Modify `apps/web/src/appServerSnapshotTypes.ts`: add the minimum raw fields currently consumed by the demo adapter, including object-shaped statuses, read errors, tool output/result/error, and turn error.
- Modify `apps/web/src/appServerMockAdapter.ts`: improve status normalization, assistant thread load state, search data, and avoid silent fallback for missing reads.
- Modify `apps/web/src/assistantTimeline.ts`: carry tool output/result/error and turn errors into detail targets; render context compaction as a semantic node.
- Modify `apps/web/src/components/codex-assistant-thread.tsx`: render read-state-aware empty/error states.
- Modify `apps/web/src/components/codex-tool-call-row.tsx`: show tool diagnostic detail for failed and output-bearing tools.
- Modify `apps/web/src/components/detail-workspace.tsx`: render richer tool diagnostics.
- Modify `apps/web/src/components/main-panels.tsx`: make search results selectable and disable unavailable device actions.
- Modify `apps/web/src/components/action-menu.tsx`: disable unavailable menu actions instead of closing silently.
- Modify tests:
  - `apps/web/src/appServerMockAdapter.test.ts`
  - `apps/web/src/assistantTimeline.test.ts`
  - `apps/web/src/sidebarModel.test.ts`
  - `apps/web/src/appLayout.test.ts`

## Task 1: Demo Status And Read State

**Files:**
- Modify: `apps/web/src/mockData.ts`
- Modify: `apps/web/src/appServerSnapshotTypes.ts`
- Modify: `apps/web/src/appServerMockAdapter.ts`
- Test: `apps/web/src/appServerMockAdapter.test.ts`

- [x] **Step 1: Write failing tests for app-server object statuses and missing reads**

Add tests to `apps/web/src/appServerMockAdapter.test.ts`:

```ts
test("when app-server status is active, should derive running or waiting instead of done", () => {
  const syntheticList: RawThreadListFixture = {
    projectCwd: "/workspace/demo",
    capturedAt: "2026-06-17T00:00:00.000Z",
    pages: [
      {
        data: [
          {
            id: "thread-running",
            cwd: "/workspace/demo",
            name: "Running thread",
            status: { type: "active", activeFlags: [] },
            updatedAt: 1_782_000_000,
          } as unknown as RawCodexThread,
          {
            id: "thread-waiting",
            cwd: "/workspace/demo",
            name: "Waiting thread",
            status: { type: "active", activeFlags: ["waitingOnApproval"] },
            updatedAt: 1_782_000_100,
          } as unknown as RawCodexThread,
        ],
      },
    ],
  };
  const syntheticReads: RawThreadReadFixture = {
    projectCwd: syntheticList.projectCwd,
    capturedAt: syntheticList.capturedAt,
    threads: {},
  };

  const data = createAppServerMockData({ list: syntheticList, reads: syntheticReads });

  assert.deepEqual(
    data.conversations.map((conversation) => ({ id: conversation.id, status: conversation.status })),
    [
      { id: "thread-running", status: "running" },
      { id: "thread-waiting", status: "waiting" },
    ],
  );
});

test("when thread/read is missing for a listed thread, should expose missingRead instead of an empty loaded timeline", () => {
  const syntheticList: RawThreadListFixture = {
    projectCwd: "/workspace/demo",
    capturedAt: "2026-06-17T00:00:00.000Z",
    pages: [
      {
        data: [
          {
            id: "thread-without-read",
            cwd: "/workspace/demo",
            name: "Listed only",
            status: { type: "notLoaded" },
            updatedAt: 1_782_000_000,
          } as unknown as RawCodexThread,
        ],
      },
    ],
  };
  const syntheticReads: RawThreadReadFixture = {
    projectCwd: syntheticList.projectCwd,
    capturedAt: syntheticList.capturedAt,
    threads: {},
  };

  const data = createAppServerMockData({ list: syntheticList, reads: syntheticReads });

  assert.equal(data.assistantThreads[0]?.loadState, "missingRead");
  assert.deepEqual(data.assistantThreads[0]?.timeline.turns, []);
});
```

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @codex-remote/web test -- appServerMockAdapter.test.ts
```

Expected: FAIL because `ConversationStatus` does not include `unknown`/object handling and `AssistantThreadSnapshot` does not expose `loadState`.

- [x] **Step 3: Implement minimal status/read-state changes**

Update `mockData.ts`:

```ts
export type ConversationStatus = "running" | "waiting" | "done" | "failed" | "unknown";
```

Update `appServerSnapshotTypes.ts`:

```ts
export interface RawThreadReadResult {
  thread?: RawCodexThread;
  error?: unknown;
}

export interface RawCodexThread {
  id?: string;
  sessionId?: string;
  forkedFromId?: string | null;
  parentThreadId?: string | null;
  preview?: string;
  modelProvider?: string;
  createdAt?: number;
  updatedAt?: number;
  status?: string | { type?: string; activeFlags?: string[] };
  cwd?: string;
  name?: string | null;
  turns?: RawCodexTurn[];
}
```

Update `appServerMockAdapter.ts`:

```ts
export type AssistantThreadLoadState = "empty" | "loaded" | "missingRead" | "readError";

export interface AssistantThreadSnapshot {
  id: string;
  title: string;
  deviceId: string;
  projectId: string;
  projectName: string;
  status: ConversationStatus;
  updatedAt: string;
  forkedFromId: string | null;
  parentThreadId: string | null;
  loadState: AssistantThreadLoadState;
  timeline: AssistantTimeline;
}
```

Use a helper when building `assistantThreads`:

```ts
function getThreadReadState(threadId: string, reads: RawThreadReadFixture): AssistantThreadLoadState {
  const result = reads.threads[threadId];
  if (!result) {
    return "missingRead";
  }
  if (typeof result.error !== "undefined") {
    return "readError";
  }
  if ((result.thread?.turns ?? []).length === 0) {
    return "empty";
  }
  return "loaded";
}
```

Replace `normalizeConversationStatus` body with explicit object-aware logic:

```ts
function normalizeConversationStatus(status: unknown): ConversationStatus {
  const activeFlags = getStatusActiveFlags(status);
  const statusType = normalizeStatusText(extractStatusType(status));

  if (
    activeFlags.some((flag) => {
      const normalizedFlag = normalizeStatusText(flag);
      return normalizedFlag.includes("waiting") || normalizedFlag.includes("approval") || normalizedFlag.includes("input");
    })
  ) {
    return "waiting";
  }

  if (statusType.includes("active") || statusType.includes("running") || statusType.includes("inprogress") || statusType.includes("processing")) {
    return "running";
  }

  if (statusType.includes("waiting") || statusType.includes("approval") || statusType.includes("blocked")) {
    return "waiting";
  }

  if (statusType.includes("failed") || statusType.includes("error")) {
    return "failed";
  }

  if (statusType.includes("complete") || statusType.includes("done") || statusType.includes("idle") || statusType.includes("notloaded")) {
    return "done";
  }

  return "unknown";
}

function getStatusActiveFlags(status: unknown): string[] {
  if (!isRecord(status)) {
    return [];
  }
  const activeFlags = status["activeFlags"];
  return Array.isArray(activeFlags) ? activeFlags.filter((flag): flag is string => typeof flag === "string") : [];
}
```

- [x] **Step 4: Run focused tests**

Run:

```bash
pnpm --filter @codex-remote/web test -- appServerMockAdapter.test.ts
```

Expected: PASS for app-server adapter tests.

## Task 2: Timeline Diagnostics And Compaction

**Files:**
- Modify: `apps/web/src/appServerSnapshotTypes.ts`
- Modify: `apps/web/src/assistantTimeline.ts`
- Modify: `apps/web/src/components/codex-tool-call-row.tsx`
- Modify: `apps/web/src/components/detail-workspace.tsx`
- Test: `apps/web/src/assistantTimeline.test.ts`

- [x] **Step 1: Write failing tests for tool diagnostics and context compaction**

Add tests to `apps/web/src/assistantTimeline.test.ts`:

```ts
test("when tool item has output result and error, should preserve diagnostics in detail target", () => {
  const timeline = deriveAssistantTimeline({
    id: "thread-diagnostics",
    turns: [
      {
        id: "turn-diagnostics",
        status: "failed",
        items: [
          {
            type: "mcpToolCall",
            id: "tool-diagnostics",
            arguments: { cmd: "pnpm test" },
            status: "failed",
            output: "stdout line",
            result: { passed: false },
            error: { message: "test failed" },
          },
        ],
      },
    ],
  } as RawCodexThread);
  const node = timeline.turns[0]?.nodes[0];

  assertToolCall(node);
  assert.equal(node.detailTarget.type, "tool");
  assert.match(node.detailTarget.detail, /pnpm test/);
  assert.match(node.detailTarget.detail, /stdout line/);
  assert.match(node.detailTarget.detail, /"passed": false/);
  assert.match(node.detailTarget.detail, /test failed/);
});

test("when item is context compaction without text, should render semantic compaction text", () => {
  const timeline = deriveAssistantTimeline({
    id: "thread-compaction",
    turns: [
      {
        id: "turn-compaction",
        items: [{ id: "compact-a", type: "contextCompaction" }],
      },
    ],
  });

  assert.deepEqual(timeline.turns[0]?.nodes[0], {
    type: "contextCompaction",
    id: "compact-a",
    turnId: "turn-compaction",
    sourceItemIds: ["compact-a"],
    text: "上下文已压缩",
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @codex-remote/web test -- assistantTimeline.test.ts
```

Expected: FAIL because diagnostics are not included and compaction text currently falls back to unsupported item text.

- [x] **Step 3: Implement timeline diagnostics**

Update `RawCodexTurn` / `RawCodexItem` if needed so `error`, `output`, and `result` remain typed as `unknown`.

In `assistantTimeline.ts`, update the context compaction branch:

```ts
text: getItemText(item, { fallback: "上下文已压缩" }),
```

Change `getItemText` signature:

```ts
function getItemText(item: RawCodexItem, options: { fallback?: string } = {}): string {
  ...
  return options.fallback ?? `Unsupported Codex item: ${getNonEmptyString(item.type) ?? "unknown"}`;
}
```

Update tool detail creation:

```ts
function createToolDetail(item: RawCodexItem): string {
  const parts = [
    getCommandText(item) || getItemText(item),
    formatDiagnosticBlock("output", item.output),
    formatDiagnosticBlock("result", item.result),
    formatDiagnosticBlock("error", item.error),
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

  return parts.join("\n\n");
}

function formatDiagnosticBlock(label: string, value: unknown): string | null {
  if (typeof value === "undefined" || value === null) {
    return null;
  }
  if (typeof value === "string") {
    return `${label}:\n${value}`;
  }
  return `${label}:\n${JSON.stringify(value, null, 2)}`;
}
```

Use `createToolDetail(item)` in `createDetailTarget` for tool calls.

- [x] **Step 4: Run focused tests**

Run:

```bash
pnpm --filter @codex-remote/web test -- assistantTimeline.test.ts
```

Expected: PASS for assistant timeline tests.

## Task 3: UI Empty States, Search, And Unavailable Actions

**Files:**
- Modify: `apps/web/src/appServerMockAdapter.ts`
- Modify: `apps/web/src/components/codex-assistant-thread.tsx`
- Modify: `apps/web/src/components/main-panels.tsx`
- Modify: `apps/web/src/components/action-menu.tsx`
- Test: `apps/web/src/appServerMockAdapter.test.ts`
- Test: `apps/web/src/appLayout.test.ts`

- [x] **Step 1: Write failing tests for search IDs and disabled unavailable actions**

Add to `apps/web/src/appServerMockAdapter.test.ts`:

```ts
test("when deriving search recents, should include conversation ids without fixed active state", () => {
  const data = createAppServerMockData({ list, reads, sidebarState });

  assert.equal(data.searchRecents.length, data.conversations.length);
  assert.deepEqual(
    data.searchRecents.map((item) => item.conversationId),
    data.conversations.map((conversation) => conversation.id),
  );
  assert.equal(data.searchRecents.some((item) => item.active === true), false);
});
```

Add to `apps/web/src/appLayout.test.ts`:

```ts
test("when demo actions are unavailable, should render disabled controls instead of clickable no-op actions", () => {
  const actionMenu = readFileSync(new URL("./components/action-menu.tsx", import.meta.url), "utf8");
  const mainPanels = readFileSync(new URL("./components/main-panels.tsx", import.meta.url), "utf8");

  assert.match(actionMenu, /disabled: true/);
  assert.match(actionMenu, /aria-disabled=\{action.disabled/);
  assert.match(mainPanels, /aria-label="新增设备"[^>]*disabled/s);
  assert.match(mainPanels, /aria-label="编辑设备"[^>]*disabled/s);
  assert.match(mainPanels, /aria-label="删除设备"[^>]*disabled/s);
});
```

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @codex-remote/web test -- appServerMockAdapter.test.ts appLayout.test.ts
```

Expected: FAIL because search recents do not include `conversationId` and no-op controls are still enabled.

- [x] **Step 3: Implement search IDs and disabled unavailable actions**

Update `SearchRecent`:

```ts
export interface SearchRecent {
  conversationId: string;
  title: string;
  project: string;
  active?: boolean;
  marker?: boolean;
}
```

Update search recent derivation:

```ts
searchRecents: conversations.map((conversation) => ({
  conversationId: conversation.id,
  title: conversation.title,
  project: conversation.projectName,
  ...(conversation.status === "waiting" ? { marker: true } : {}),
})),
```

Update `SearchDialogProps` and `SearchDialog` to accept selected id and callback:

```ts
interface SearchDialogProps {
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
  open: boolean;
  selectedConversationId: string | null;
}
```

On result click:

```tsx
onClick={() => {
  onSelectConversation(item.conversationId);
  onClose();
}}
```

Use active state:

```tsx
className={`search-result${item.conversationId === selectedConversationId ? " is-active" : ""}`}
```

Update `ActionMenuItem`:

```ts
interface ActionMenuItem {
  disabled?: boolean;
  icon: IconName;
  label: string;
}
```

Mark all current demo actions disabled:

```ts
{ icon: "message-circle-plus", label: "新对话", disabled: true }
```

Render disabled action buttons:

```tsx
<button
  aria-disabled={action.disabled === true}
  disabled={action.disabled === true}
  key={action.label}
  onClick={() => {
    if (!action.disabled) {
      setOpen(false);
    }
  }}
  role="menuitem"
  type="button"
>
```

Disable device management buttons in `main-panels.tsx` with `disabled` attributes.

- [x] **Step 4: Run focused tests**

Run:

```bash
pnpm --filter @codex-remote/web test -- appServerMockAdapter.test.ts appLayout.test.ts
```

Expected: PASS for adapter and layout tests.

## Task 4: Empty Conversation Safety

**Files:**
- Modify: `apps/web/src/components/codex-remote-app.tsx`
- Modify: `apps/web/src/components/main-panels.tsx`
- Test: `apps/web/src/appLayout.test.ts`

- [x] **Step 1: Write failing source-level safety test**

Add to `apps/web/src/appLayout.test.ts`:

```ts
test("when conversations are empty, app shell should allow null selected conversation instead of non-null assertions", () => {
  const app = readFileSync(new URL("./components/codex-remote-app.tsx", import.meta.url), "utf8");

  assert.match(app, /useState<string \| null>/);
  assert.doesNotMatch(app, /conversations\[0\]!\.id/);
  assert.match(app, /conversation === null/);
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @codex-remote/web test -- appLayout.test.ts
```

Expected: FAIL because the app still uses `conversations[0]!.id`.

- [x] **Step 3: Implement null-safe selection**

Update selected conversation state:

```ts
const [selectedConversationId, setSelectedConversationId] = useState<string | null>(() => conversations[0]?.id ?? null);
```

Resolve conversation as nullable:

```ts
const conversation =
  conversations.find((conversationItem) => conversationItem.id === selectedConversationId) ??
  conversations.find((conversationItem) => conversationItem.deviceId === selectedDeviceId) ??
  conversations[0] ??
  null;
const assistantThread = conversation ? assistantThreads.find((thread) => thread.id === conversation.id) ?? null : null;
```

When selecting a device:

```ts
setSelectedConversationId(
  conversations.find((conversationItem) => conversationItem.deviceId === nextDeviceId)?.id ?? selectedConversationId,
);
```

Guard conversation main content:

```tsx
if (conversation === null) {
  return {
    detail: <ConversationDetailPane ... target={null} />,
    main: <ConversationMain assistantThread={null} conversation={null} ... />,
  };
}
```

Update `ConversationMainProps` to accept `conversation: Conversation | null` and render title `对话` plus empty body when null.

- [x] **Step 4: Run focused test**

Run:

```bash
pnpm --filter @codex-remote/web test -- appLayout.test.ts
```

Expected: PASS for app layout tests.

## Task 5: Final Verification

**Files:**
- Verify changed code only; no new files.

- [x] **Step 1: Run full verification**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 2: Inspect git diff**

Run:

```bash
git diff -- apps/web/src docs/plans/2026-06-17-demo-codex-app-data-display-logic.md
```

Expected: diff only contains planned demo display logic and the plan document.

## Self-Review

- Spec coverage: The plan covers demo truthfulness for Codex App data display: status mapping, missing reads, empty snapshots, tool diagnostics, semantic compaction, search selection, and unavailable actions.
- Deliberate gaps: This plan intentionally does not implement Worker, Control Plane, generated app-server protocol types, DB, live streaming, follow-up, interrupt, or pairing. Those are architectural MVP tasks, not required for the current demo display goal.
- Placeholder scan: No task uses placeholder implementation text. Every code-changing task includes concrete code snippets and verification commands.
- Type consistency: `AssistantThreadLoadState`, `ConversationStatus`, and `SearchRecent.conversationId` are defined before use in later tasks.
