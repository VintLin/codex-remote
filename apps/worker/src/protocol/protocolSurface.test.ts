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
const stage5ControlProtocolMethods = [
  "turn/interrupt",
  "turn/steer",
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

test("when checking stage 5 control protocol methods, generated ClientRequest should expose supported methods", () => {
  assert.deepEqual([...stage5ControlProtocolMethods], [
    "turn/interrupt",
    "turn/steer",
  ]);
});

// @ts-expect-error Current generated protocol does not expose thread/turns/list.
const missingThreadTurnsList: ClientRequest["method"] = "thread/turns/list";

void missingThreadTurnsList;

type ReadOnlyRequestMethod = Parameters<import("../app-server/appServerRpcClient.ts").AppServerRpcClient["request"]>[0];

const stage4RuntimeMethod: ReadOnlyRequestMethod = "turn/start";
const stage5InterruptRuntimeMethod: ReadOnlyRequestMethod = "turn/interrupt";
const stage5SteerRuntimeMethod: ReadOnlyRequestMethod = "turn/steer";

void stage4RuntimeMethod;
void stage5InterruptRuntimeMethod;
void stage5SteerRuntimeMethod;

type ReadOnlyHandlerClient = import("../http/readOnlyHandlers.ts").WorkerReadOnlyAppServerClient;
type ReadOnlySessionClient = import("../app-server/readOnlyAppServerSession.ts").ReadOnlyAppServerSession["client"];
type WriteHandlerClient = import("../http/writeHandlers.ts").WorkerWriteAppServerClient;
type ControlHandlerClient = import("../http/controlHandlers.ts").WorkerControlAppServerClient;

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

// @ts-expect-error Write handler client must not expose turn/interrupt.
type WriteHandlerInterruptTurn = WriteHandlerClient["interruptTurn"];

// @ts-expect-error Write handler client must not expose turn/steer.
type WriteHandlerSteerTurn = WriteHandlerClient["steerTurn"];

// @ts-expect-error Read-only handler client must not expose approval responses.
type ReadOnlyHandlerSendApprovalResponse = ReadOnlyHandlerClient["sendApprovalResponse"];

type ControlHandlerInterruptTurn = ControlHandlerClient["interruptTurn"];
type ControlHandlerSteerTurn = ControlHandlerClient["steerTurn"];
type ControlHandlerSendApprovalResponse = ControlHandlerClient["sendApprovalResponse"];

void (undefined as unknown as ControlHandlerInterruptTurn);
void (undefined as unknown as ControlHandlerSteerTurn);
void (undefined as unknown as ControlHandlerSendApprovalResponse);
