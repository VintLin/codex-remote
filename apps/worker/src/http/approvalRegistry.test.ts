import assert from "node:assert/strict";
import test from "node:test";

import type { PendingApproval } from "@codex-remote/api-contract";
import type { ServerRequest } from "@codex-remote/codex-protocol";

import { createWorkerApprovalRegistry, type PublicApprovalDecision } from "./approvalRegistry.ts";

test("worker approval registry when capturing server requests, should expose only supported approval kinds", () => {
  const registry = createWorkerApprovalRegistry();

  const captured = [
    registry.captureServerRequest(createCommandExecutionRequest("jsonrpc-command")),
    registry.captureServerRequest(createFileChangeRequest("jsonrpc-file")),
    registry.captureServerRequest(createLegacyExecRequest("jsonrpc-exec")),
    registry.captureServerRequest(createLegacyApplyPatchRequest("jsonrpc-patch")),
    registry.captureServerRequest(createPermissionsRequest("jsonrpc-permissions")),
    registry.captureServerRequest(createUnsupportedToolInputRequest("jsonrpc-tool-input")),
  ];

  assert.deepEqual(
    captured.map((approval) => approval?.kind ?? null),
    ["command_execution", "file_change", "legacy_exec", "legacy_apply_patch", null, null],
  );
  assert.deepEqual(
    registry.listPendingApprovals("thread-1").map((approval) => approval.kind),
    ["command_execution", "file_change", "legacy_exec", "legacy_apply_patch"],
  );
});

test("worker approval registry when permissions approval is captured, should not expose it publicly", () => {
  const registry = createWorkerApprovalRegistry();

  const captured = registry.captureServerRequest(createPermissionsRequest("jsonrpc-permissions"));

  assert.equal(captured, null);
  assert.deepEqual(registry.listPendingApprovals("thread-1"), []);
});

test("worker approval registry when projecting pending approval, should exclude raw command, cwd, patch, ids, tokens, urls, stack, cause, and private paths", () => {
  const registry = createWorkerApprovalRegistry();
  registry.captureServerRequest(createCommandExecutionRequest("jsonrpc-secret"));
  registry.captureServerRequest(createLegacyApplyPatchRequest("jsonrpc-patch-secret"));

  const serialized = JSON.stringify(registry.listPendingApprovals("thread-1"));

  for (const marker of [
    "jsonrpc-secret",
    "jsonrpc-patch-secret",
    "echo SECRET_TOKEN",
    "SECRET_TOKEN",
    "/Users/vint/private/project",
    "/Users/vint/private/project/file.txt",
    "@@ -1 +1 @@",
    "https://secret.example",
    "ws://127.0.0.1:4321",
    "stack",
    "cause",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const approvals = registry.listPendingApprovals("thread-1");
  assert.ok(approvals.length > 0);
  for (const approval of approvals) {
    assertPublicApprovalShape(approval);
  }
});

test("worker approval registry when deciding supported approvals, should map public decisions to explicit generated response shapes", () => {
  const cases: Array<{
    expectedResults: Record<PublicApprovalDecision, unknown>;
    request: ServerRequest;
  }> = [
    {
      request: createCommandExecutionRequest("jsonrpc-command"),
      expectedResults: {
        accept: { decision: "accept" },
        decline: { decision: "decline" },
        cancel: { decision: "cancel" },
      },
    },
    {
      request: createFileChangeRequest("jsonrpc-file"),
      expectedResults: {
        accept: { decision: "accept" },
        decline: { decision: "decline" },
        cancel: { decision: "cancel" },
      },
    },
    {
      request: createLegacyExecRequest("jsonrpc-exec"),
      expectedResults: {
        accept: { decision: "approved" },
        decline: { decision: "denied" },
        cancel: { decision: "abort" },
      },
    },
    {
      request: createLegacyApplyPatchRequest("jsonrpc-patch"),
      expectedResults: {
        accept: { decision: "approved" },
        decline: { decision: "denied" },
        cancel: { decision: "abort" },
      },
    },
  ];

  for (const { request, expectedResults } of cases) {
    for (const decision of ["accept", "decline", "cancel"] as const) {
      const registry = createWorkerApprovalRegistry();
      const pending = registry.captureServerRequest(request);
      assert.ok(pending);

      const response = registry.resolveApproval({
        approvalRequestId: pending.id,
        conversationId: pending.conversationId,
        decision,
        expectedApprovalRequestId: pending.id,
        expectedTurnId: pending.turnId,
      });

      assert.deepEqual(response, {
        requestId: request.id,
        result: expectedResults[decision],
      });
      assert.equal(registry.listPendingApprovals(pending.conversationId).length, 1);
      registry.completeApproval(pending.id);
      assert.deepEqual(registry.listPendingApprovals(pending.conversationId), []);
    }
  }
});

test("worker approval registry when approval start time is unknown, should use capture time", () => {
  const registry = createWorkerApprovalRegistry({ now: () => "2026-06-20T12:34:56.000Z" });

  registry.captureServerRequest(createLegacyExecRequest("jsonrpc-exec"));

  assert.equal(registry.listPendingApprovals("thread-1")[0]?.startedAt, "2026-06-20T12:34:56.000Z");
});

test("worker approval registry when decision guard mismatches or approval is missing or resolved, should fail closed", () => {
  const registry = createWorkerApprovalRegistry();
  const pending = registry.captureServerRequest(createCommandExecutionRequest("jsonrpc-command"));
  assert.ok(pending);

  const invalidAttempts = [
    { conversationId: "other-thread", expectedTurnId: pending.turnId, expectedApprovalRequestId: pending.id },
    { conversationId: pending.conversationId, expectedTurnId: "other-turn", expectedApprovalRequestId: pending.id },
    { conversationId: pending.conversationId, expectedTurnId: pending.turnId, expectedApprovalRequestId: "other-approval" },
    { conversationId: pending.conversationId, expectedTurnId: pending.turnId, expectedApprovalRequestId: pending.id, approvalRequestId: "missing-approval" },
  ];

  for (const attempt of invalidAttempts) {
    assert.throws(
      () => {
        registry.resolveApproval({
          approvalRequestId: attempt.approvalRequestId ?? pending.id,
          conversationId: attempt.conversationId,
          decision: "accept",
          expectedApprovalRequestId: attempt.expectedApprovalRequestId,
          expectedTurnId: attempt.expectedTurnId,
        });
      },
      /approval_not_found|invalid_request/,
    );
  }

  registry.markResolved({ threadId: pending.conversationId, requestId: "jsonrpc-command" });
  assert.throws(
    () => {
      registry.resolveApproval({
        approvalRequestId: pending.id,
        conversationId: pending.conversationId,
        decision: "accept",
        expectedApprovalRequestId: pending.id,
        expectedTurnId: pending.turnId,
      });
    },
    /approval_not_found/,
  );
});

function assertPublicApprovalShape(approval: PendingApproval): void {
  assert.match(approval.id, /^[A-Za-z0-9_.:-]+$/);
  assert.equal(approval.conversationId, "thread-1");
  assert.equal(approval.status, "pending");
  assert.match(approval.startedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(["command_execution", "file_change", "legacy_exec", "legacy_apply_patch"].includes(approval.kind));
  assert.ok(["low", "medium", "high", "unknown"].includes(approval.risk));
}

function createCommandExecutionRequest(id: string): ServerRequest {
  return {
    id,
    method: "item/commandExecution/requestApproval",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-command",
      startedAtMs: 1_718_791_200_000,
      command: "echo SECRET_TOKEN && curl https://secret.example",
      cwd: "/Users/vint/private/project",
      reason: "needs network",
    },
  };
}

function createFileChangeRequest(id: string): ServerRequest {
  return {
    id,
    method: "item/fileChange/requestApproval",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-file",
      startedAtMs: 1_718_791_201_000,
      grantRoot: "/Users/vint/private/project",
      reason: "change file",
    },
  };
}

function createLegacyExecRequest(id: string): ServerRequest {
  return {
    id,
    method: "execCommandApproval",
    params: {
      conversationId: "thread-1",
      callId: "legacy-exec-call",
      approvalId: "legacy-exec-approval",
      command: ["sh", "-lc", "echo SECRET_TOKEN"],
      cwd: "/Users/vint/private/project",
      parsedCmd: [],
      reason: "legacy exec",
    },
  };
}

function createLegacyApplyPatchRequest(id: string): ServerRequest {
  return {
    id,
    method: "applyPatchApproval",
    params: {
      conversationId: "thread-1",
      callId: "legacy-patch-call",
      fileChanges: {
        "/Users/vint/private/project/file.txt": {
          type: "update",
          unified_diff: "@@ -1 +1 @@\n-secret\n+SECRET_TOKEN",
          move_path: null,
        },
      },
      grantRoot: "/Users/vint/private/project",
      reason: "patch",
    },
  };
}

function createPermissionsRequest(id: string): ServerRequest {
  return {
    id,
    method: "item/permissions/requestApproval",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-permissions",
      environmentId: null,
      startedAtMs: 1_718_791_202_000,
      cwd: "/Users/vint/private/project",
      reason: "grant broad permissions",
      permissions: { network: null, fileSystem: null },
    },
  };
}

function createUnsupportedToolInputRequest(id: string): ServerRequest {
  return {
    id,
    method: "item/tool/requestUserInput",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-tool",
      questions: [],
    },
  };
}
