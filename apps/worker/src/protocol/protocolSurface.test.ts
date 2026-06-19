import assert from "node:assert/strict";
import test from "node:test";

import type { ClientRequest } from "@codex-remote/codex-protocol";

const readOnlyProtocolMethods = [
  "initialize",
  "model/list",
  "thread/list",
  "thread/read",
] as const satisfies readonly ClientRequest["method"][];
const stage4WriteProtocolMethods = [
  "thread/start",
  "turn/start",
] as const satisfies readonly ClientRequest["method"][];

test("when checking read-only protocol methods, generated ClientRequest should expose supported methods", () => {
  assert.deepEqual([...readOnlyProtocolMethods], [
    "initialize",
    "model/list",
    "thread/list",
    "thread/read",
  ]);
});

test("when checking stage 4 write protocol methods, generated ClientRequest should expose supported methods", () => {
  assert.deepEqual([...stage4WriteProtocolMethods], [
    "thread/start",
    "turn/start",
  ]);
});

// @ts-expect-error Current generated protocol does not expose thread/turns/list.
const missingThreadTurnsList: ClientRequest["method"] = "thread/turns/list";

void missingThreadTurnsList;

type ReadOnlyRequestMethod = Parameters<import("../app-server/appServerRpcClient.ts").AppServerRpcClient["request"]>[0];

const stage4RuntimeMethod: ReadOnlyRequestMethod = "turn/start";

void stage4RuntimeMethod;

// @ts-expect-error AppServerRpcClient request surface does not expose steer in Stage 4.
const invalidRuntimeMethod: ReadOnlyRequestMethod = "turn/steer";

void invalidRuntimeMethod;

type ReadOnlyHandlerClient = import("../http/readOnlyHandlers.ts").WorkerReadOnlyAppServerClient;
type ReadOnlySessionClient = import("../app-server/readOnlyAppServerSession.ts").ReadOnlyAppServerSession["client"];
type WriteHandlerClient = import("../http/writeHandlers.ts").WorkerWriteAppServerClient;

// @ts-expect-error Read-only handler client must not expose thread/start.
type ReadOnlyHandlerStartThread = ReadOnlyHandlerClient["startThread"];

// @ts-expect-error Read-only handler client must not expose turn/start.
type ReadOnlyHandlerStartTurn = ReadOnlyHandlerClient["startTurn"];

// @ts-expect-error Read-only app-server session client must not expose thread/start.
type ReadOnlySessionStartThread = ReadOnlySessionClient["startThread"];

// @ts-expect-error Read-only app-server session client must not expose turn/start.
type ReadOnlySessionStartTurn = ReadOnlySessionClient["startTurn"];

type WriteHandlerStartThread = WriteHandlerClient["startThread"];
type WriteHandlerStartTurn = WriteHandlerClient["startTurn"];

void (undefined as unknown as WriteHandlerStartThread);
void (undefined as unknown as WriteHandlerStartTurn);
