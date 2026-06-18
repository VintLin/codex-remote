import assert from "node:assert/strict";
import test from "node:test";

import type { ClientRequest } from "@codex-remote/codex-protocol";
import { AppServerRpcClient } from "../app-server/appServerRpcClient.ts";

const readOnlyProtocolMethods = [
  "initialize",
  "model/list",
  "thread/list",
  "thread/read",
] as const satisfies readonly ClientRequest["method"][];

test("when checking read-only protocol methods, generated ClientRequest should expose supported methods", () => {
  assert.deepEqual([...readOnlyProtocolMethods], [
    "initialize",
    "model/list",
    "thread/list",
    "thread/read",
  ]);
});

// @ts-expect-error Current generated protocol does not expose thread/turns/list.
const missingThreadTurnsList: ClientRequest["method"] = "thread/turns/list";

void missingThreadTurnsList;

const rpcClient = new AppServerRpcClient({
  addEventListener() {},
  close() {},
  send() {},
});

// @ts-expect-error AppServerRpcClient request surface is intentionally limited to read-only methods.
void rpcClient.request("turn/start", {});
