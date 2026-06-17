# App-Server Snapshot Mock And Assistant UI Design

## Purpose

Use real, unarchived Codex app-server data from the `050_codex_remote` project as the first useful data source for the Web prototype, then render the main conversation area with `assistant-ui` and Vercel AI SDK primitives.

This is a prototype bridge toward the later Worker / Control Plane architecture. It must make real Codex history visible now without making the browser directly responsible for long-lived app-server ownership.

## Scope

Current implementation target:

- Fetch a one-time app-server snapshot for `/workspace/codex-remote`.
- Preserve raw app-server responses as JSON fixtures.
- Derive sidebar projects, conversation rows, search recents, and assistant thread messages from that single raw source.
- Replace the hand-written main message stack with an `assistant-ui` thread surface.
- Support static historical messages and a Composer shell.

Designed but not required in the first implementation pass:

- Codex app-server streaming transport through Vercel AI SDK UIMessage streams.
- Tool call UI beyond basic/fallback rendering.
- Attachments, branches, stream resume, and durable history persistence.

Out of scope:

- Full Worker / Control Plane API implementation.
- Web runtime directly connecting to Codex app-server.
- Archiving, mutating, or renaming real Codex threads.
- Provider-proxy or non-Codex model streaming.

## Single Source Of Truth

The only factual source for Codex conversation history in this prototype is the app-server raw thread snapshot.

For the current snapshot prototype, the source of truth is:

- `apps/web/src/fixtures/app-server/demo.thread-list.json`
- `apps/web/src/fixtures/app-server/demo.thread-read.json`

For the future live implementation, the same logical source will become the Worker / Control Plane response that wraps Codex app-server data. UI-facing shapes must still be derived through the same adapter boundary.

The following data must not be manually redefined in parallel:

- Sidebar projects for `050_codex_remote`.
- Conversation ids, titles, status, summaries, and updated times.
- Assistant thread ids.
- Assistant messages derived from turns/items.
- Search recent rows for the same project.

All UI data must be derived by adapter functions from the source snapshot:

```text
app-server raw snapshot
  -> codexThreadAdapter
  -> sidebar model data
  -> assistant-ui thread/message data
  -> search recents
```

Manual fallback constants are allowed only for fields app-server does not currently expose in a stable way, such as demo device metadata, default sandbox label, or default approval label. These fallback constants must live in the adapter module, not inside page components.

## App-Server Snapshot

The snapshot is collected from Codex app-server with `thread/list`:

```json
{
  "cwd": "/workspace/codex-remote",
  "archived": false
}
```

For every returned thread, call `thread/read` with `includeTurns: true` and preserve the complete response. The raw fixture must retain all fields returned by app-server, including `turns` and nested `items`.

Pagination must be handled if `thread/list` returns a cursor. The fixture represents the full unarchived result set for the cwd at capture time.

## Adapter Design

Create `apps/web/src/appServerMockAdapter.ts` as the only module allowed to turn raw app-server fixture data into UI data.

Responsibilities:

- Normalize app-server `Thread` records into the existing `Conversation` model.
- Generate a single `SidebarProject` for `050_codex_remote`.
- Generate assistant thread/message initial state from `Thread.turns`.
- Generate `searchRecents` from the same conversations.
- Provide stable fallback text for missing names, previews, turns, or item text.
- Map app-server thread status into current UI statuses:
  - active/running statuses -> `running`
  - approval/waiting statuses -> `waiting`
  - completed/idle statuses -> `done`
  - failed/canceled/error statuses -> `failed`
- Keep device fallback metadata in one exported adapter result.

Adapter output is a single object, for example:

```ts
type AppServerMockData = {
  devices: Device[];
  sidebarProjects: SidebarProject[];
  conversations: Conversation[];
  assistantThreads: AssistantThreadSnapshot[];
  searchRecents: SearchRecent[];
  tasks: BoardTask[];
};
```

Existing UI modules consume this output rather than importing raw fixtures directly.

## Assistant UI Integration

The main content area moves from hand-written message cards to an `assistant-ui` thread surface.

Use `assistant-ui` for:

- Thread container.
- Message rendering.
- Composer.
- Basic thread runtime state.

Use Vercel AI SDK for:

- UI message compatibility.
- Future custom transport for streaming app-server notifications.

The first implementation pass uses historical fixture messages as initial thread state. Composer is visible but disabled until the live app-server streaming transport is implemented. The disabled state must be explicit in the UI copy or control state.

## Future Streaming Transport

The future streaming path is:

```text
assistant-ui Composer
  -> Vercel AI SDK custom transport
  -> Next route or Worker-backed API
  -> Codex app-server thread/resume + turn/start
  -> app-server turn/item notifications
  -> AI SDK UIMessage stream
  -> assistant-ui Message and tool UI
```

The browser must not own direct app-server transport. A route handler, Worker, or Control Plane bridge owns app-server JSON-RPC details.

## Tool Calls, Attachments, Branches, Persistence

Tool calls:

- First pass: render known command/file-change/approval-like items when the adapter can identify them.
- Unknown item types render through a generic fallback card.
- Unknown raw data must not crash the thread.

Attachments:

- First pass: preserve attachment-like raw data if present and display a static unsupported-attachment row.
- Upload and app-server attachment mutation are out of scope.

Branches:

- First pass: expose `forkedFromId` and `parentThreadId` if present.
- Creating new branches from the UI is out of scope.

Persistence:

- First pass: raw fixture is read-only history.
- Live messages may stay in client runtime only until Worker / Control Plane storage exists.
- Future durable history must be implemented behind a history adapter and must not write duplicate hand-authored mock records.

## UI Behavior

Initial page load:

- Show device metadata from adapter fallback.
- Show one project named `050_codex_remote`.
- Show every unarchived thread from the snapshot under that project.
- Select the newest or first adapter-defined conversation by default.
- Render historical messages in the main assistant thread.

Empty snapshot:

- Keep the `050_codex_remote` project visible.
- Show `暂无对话` in its conversation area.
- Render an empty assistant thread state.

Malformed thread:

- Keep raw fixture data unchanged.
- Adapter renders a safe fallback conversation for malformed threads that still contain an id.
- Adapter skips malformed records only when no stable thread id is present.

## Testing

Add adapter tests covering:

- Raw thread count equals derived conversation count for valid threads.
- All derived conversations use app-server thread ids.
- All derived conversations belong to the generated `050_codex_remote` project.
- Title fallback order: `name`, then first usable preview line, then `Untitled thread`.
- Empty turns and unknown items do not throw.
- Assistant message derivation returns stable message ids and roles.
- Search recents are derived from conversations, not separately hand-written.

Keep existing sidebar model tests. Update them only if fixture-derived conversation ids require new expectations.

Run verification:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Browser verification:

- The left sidebar shows `050_codex_remote` with real unarchived app-server conversations.
- Selecting a conversation changes the assistant thread.
- The main content uses assistant-ui visual/runtime structure.
- Composer state is explicit when live streaming is unavailable.

## Risks

- App-server schema can change. Raw fixtures must remain isolated behind adapter tests.
- Fixture files may be large. This is acceptable for the prototype because preserving all data is required.
- assistant-ui and AI SDK version compatibility may shift. Pin compatible versions during implementation and keep integration isolated in a small runtime module.
- Some Codex turn items may not map cleanly to assistant-ui messages. Unknown item fallback is required.

## Implementation Order

1. Capture app-server raw fixture for `050_codex_remote`.
2. Add adapter and tests.
3. Swap `mockData.ts` to consume adapter-derived data.
4. Install and integrate assistant-ui + Vercel AI SDK for static historical thread rendering.
5. Add a disabled Composer state with explicit unavailable-streaming copy.
6. Verify with tests, build, and browser.
7. Design the live app-server streaming transport as the next implementation slice.
