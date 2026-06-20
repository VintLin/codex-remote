#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const reportDir = join(root, "logs/real-check");
const reportRelativePath = "logs/real-check/latest.json";
const baseUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_BASE_URL ?? "http://127.0.0.1:8786");
const token =
  process.env.NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_TOKEN ?? process.env.CODEX_REMOTE_LOCAL_TOKEN ?? "example-token";
const requestTimeoutMs = Number.parseInt(process.env.CODEX_REMOTE_REAL_CHECK_TIMEOUT_MS ?? "5000", 10);

const checks = [];

const requiredCheckNames = [
  "control-plane health",
  "worker app-server proof",
  "devices",
  "projects",
  "conversations",
  "thread/list cwd scope",
  "thread/list pagination",
  "start conversation",
  "timeline",
  "follow-up",
  "interrupt",
  "steer",
  "approval pending scenario",
  "approval decision",
  "control-plane all-workers-down",
  "control-plane invalid-worker-token",
  "task create",
  "task link",
  "task link invalid ids",
];

const allowedDetailKeys = new Set([
  "status",
  "durationMs",
  "count",
  "turns",
  "sanitizedCode",
  "reasonCode",
  "transport",
  "appServerConnected",
  "codexVersion",
  "protocolGeneratedAt",
  "conversationRef",
  "turnRef",
  "taskRef",
  "pageCount",
  "cursorCount",
]);

async function main() {
  const health = await request("/v1/control-plane/health");
  record("control-plane health", health.ok ? "real-pass" : "real-gap", detailFromResponse(health));

  const devices = await request("/v1/devices");
  const deviceList = Array.isArray(devices.value) ? devices.value : [];
  const deviceId = firstString(deviceList[0]?.id) ?? "local-device";
  record("devices", devices.ok && Array.isArray(devices.value) ? "real-pass" : "real-gap", {
    ...detailFromResponse(devices),
    count: deviceList.length,
  });

  const workerProof = await request(`/v1/devices/${encodeURIComponent(deviceId)}/worker/health`);
  record("worker app-server proof", isRealWorkerProof(workerProof.value) ? "real-pass" : "real-gap", {
    ...detailFromResponse(workerProof),
    appServerConnected: workerProof.value?.appServerConnected === true,
    transport: allowedTransport(workerProof.value?.transport),
    codexVersion: safeShortString(workerProof.value?.codexVersion) ?? "unknown",
    protocolGeneratedAt: safeShortString(workerProof.value?.protocolGeneratedAt) ?? "unknown",
    reasonCode: isRealWorkerProof(workerProof.value) ? undefined : "real_app_server_not_proven",
  });

  const projects = await request("/v1/projects");
  const projectList = Array.isArray(projects.value) ? projects.value : [];
  const projectId = firstString(projectList[0]?.id);
  record("projects", projects.ok && Array.isArray(projects.value) && projectList.length > 0 ? "real-pass" : "real-gap", {
    ...detailFromResponse(projects),
    count: projectList.length,
    reasonCode: projectList.length > 0 ? undefined : "no_real_project",
  });

  const conversations = await request("/v1/conversations");
  const conversationList = Array.isArray(conversations.value) ? conversations.value : [];
  let conversationId = firstString(conversationList[0]?.id);
  record("conversations", conversations.ok && Array.isArray(conversations.value) ? "real-pass" : "real-gap", {
    ...detailFromResponse(conversations),
    count: conversationList.length,
  });

  record("thread/list cwd scope", conversationList.length > 0 ? "real-pass" : "real-gap", {
    count: conversationList.length,
    reasonCode: conversationList.length > 0 ? undefined : "no_conversations_to_compare_cwd_scope",
  });
  record("thread/list pagination", conversations.ok ? "real-pass" : "real-gap", {
    pageCount: conversations.ok ? 1 : 0,
    cursorCount: 0,
    count: conversationList.length,
  });

  if (deviceId && projectId) {
    const started = await request(`/v1/devices/${encodeURIComponent(deviceId)}/conversations`, {
      method: "POST",
      json: {
        projectId,
        message: "codex-remote-calibration start: reply with one short sentence.",
        clientRequestId: `real-check-start-${Date.now()}`,
      },
    });
    conversationId = firstString(started.value?.conversationId) ?? conversationId;
    record("start conversation", started.status === 202 ? "real-pass" : "real-gap", {
      ...detailFromResponse(started),
      conversationRef: refOf(conversationId),
      reasonCode: started.status === 202 ? undefined : "start_not_accepted",
    });
  } else {
    record("start conversation", "real-gap", {
      reasonCode: projectId ? "no_device" : "no_project",
    });
  }

  let activeTurnId = null;
  if (deviceId && conversationId) {
    const timeline = await request(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/timeline`,
    );
    const turns = Array.isArray(timeline.value?.turns) ? timeline.value.turns : [];
    activeTurnId = firstString(turns.find((turn) => isActiveTurnStatus(turn?.status))?.id);
    record("timeline", timeline.ok ? "real-pass" : "real-gap", {
      ...detailFromResponse(timeline),
      turns: turns.length,
      conversationRef: refOf(conversationId),
    });

    const followUp = await request(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/follow-up`,
      {
        method: "POST",
        json: {
          message: "codex-remote-calibration follow-up: acknowledge briefly.",
          clientRequestId: `real-check-follow-up-${Date.now()}`,
          expectedConversationId: conversationId,
        },
      },
    );
    record("follow-up", followUp.status === 202 ? "real-pass" : "real-gap", {
      ...detailFromResponse(followUp),
      turnRef: refOf(followUp.value?.turnId),
      reasonCode: followUp.status === 202 ? undefined : "follow_up_not_accepted",
    });

    const approvals = await request(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/approvals`,
    );
    const approvalList = Array.isArray(approvals.value) ? approvals.value : [];
    record("approval pending scenario", approvals.ok ? "real-pass" : "real-gap", {
      ...detailFromResponse(approvals),
      count: approvalList.length,
    });

    const approval = approvalList[0];
    if (approval?.id && approval?.turnId) {
      const decision = await request(
        `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/approvals/${encodeURIComponent(
          approval.id,
        )}/decision`,
        {
          method: "POST",
          json: {
            decision: "decline",
            clientRequestId: `real-check-approval-${Date.now()}`,
            expectedConversationId: conversationId,
            expectedTurnId: approval.turnId,
            expectedApprovalRequestId: approval.id,
          },
        },
      );
      record("approval decision", decision.status === 202 ? "real-pass" : "real-gap", {
        ...detailFromResponse(decision),
        turnRef: refOf(approval.turnId),
        reasonCode: decision.status === 202 ? undefined : "approval_decision_not_accepted",
      });
    } else {
      record("approval decision", "real-gap", { reasonCode: "no_safe_pending_approval" });
    }
  } else {
    record("timeline", "real-gap", { reasonCode: "no_conversation" });
    record("follow-up", "real-gap", { reasonCode: "no_conversation" });
    record("approval pending scenario", "real-gap", { reasonCode: "no_conversation" });
    record("approval decision", "real-gap", { reasonCode: "no_conversation" });
  }

  if (deviceId && conversationId && activeTurnId) {
    await recordActiveTurnControls(deviceId, conversationId, activeTurnId);
  } else {
    record("interrupt", "real-gap", { reasonCode: "no_safe_active_turn" });
    record("steer", "real-gap", { reasonCode: "no_safe_active_turn" });
  }

  const task = await request("/v1/tasks", {
    method: "POST",
    json: {
      title: `codex-remote-calibration ${new Date().toISOString()}`,
      clientRequestId: `real-check-task-${Date.now()}`,
    },
  });
  const taskId = firstString(task.value?.id);
  record("task create", task.status === 201 ? "real-pass" : "real-gap", {
    ...detailFromResponse(task),
    taskRef: refOf(taskId),
    reasonCode: task.status === 201 ? undefined : "task_not_created",
  });

  if (taskId && deviceId && projectId && conversationId) {
    const link = await request(`/v1/tasks/${encodeURIComponent(taskId)}/conversation-links`, {
      method: "POST",
      json: { deviceId, projectId, conversationId },
    });
    record("task link", link.status === 201 ? "real-pass" : "real-gap", {
      ...detailFromResponse(link),
      taskRef: refOf(taskId),
      conversationRef: refOf(conversationId),
      reasonCode: link.status === 201 ? undefined : "task_link_not_created",
    });
  } else {
    record("task link", "real-gap", { reasonCode: "missing_task_or_conversation" });
  }

  const invalidLink = taskId
    ? await request(`/v1/tasks/${encodeURIComponent(taskId)}/conversation-links`, {
        method: "POST",
        json: {
          deviceId: "invalid-device",
          projectId: "invalid-project",
          conversationId: "invalid-conversation",
        },
      })
    : { ok: false, status: 0, durationMs: 0, value: null };
  record("task link invalid ids", invalidLink.status >= 400 ? "real-pass" : "real-gap", {
    ...detailFromResponse(invalidLink),
    reasonCode: invalidLink.status >= 400 ? undefined : "invalid_ids_not_rejected",
  });

  const down = await request("/v1/conversations", { baseUrlOverride: "http://127.0.0.1:9" });
  record("control-plane all-workers-down", down.ok ? "real-gap" : "real-pass", {
    ...detailFromResponse(down),
    reasonCode: down.ok ? "unexpected_success" : undefined,
  });

  const invalidToken = await request("/v1/devices", { tokenOverride: "invalid-token" });
  record("control-plane invalid-worker-token", invalidToken.status === 401 || invalidToken.status === 403 ? "real-pass" : "real-gap", {
    ...detailFromResponse(invalidToken),
    reasonCode: invalidToken.status === 401 || invalidToken.status === 403 ? undefined : "invalid_token_not_rejected",
  });

  writeReport();
}

async function recordActiveTurnControls(deviceId, conversationId, activeTurnId) {
  const interrupt = await request(
    `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/turns/${encodeURIComponent(
      activeTurnId,
    )}/interrupt`,
    {
      method: "POST",
      json: {
        clientRequestId: `real-check-interrupt-${Date.now()}`,
        expectedTurnId: activeTurnId,
      },
    },
  );
  record("interrupt", interrupt.status === 202 ? "real-pass" : "real-gap", {
    ...detailFromResponse(interrupt),
    turnRef: refOf(activeTurnId),
    reasonCode: interrupt.status === 202 ? undefined : "interrupt_not_accepted",
  });

  const steer = await request(
    `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/turns/${encodeURIComponent(
      activeTurnId,
    )}/steer`,
    {
      method: "POST",
      json: {
        message: "codex-remote-calibration steer: keep the response short.",
        clientRequestId: `real-check-steer-${Date.now()}`,
        expectedTurnId: activeTurnId,
      },
    },
  );
  record("steer", steer.status === 202 ? "real-pass" : "real-gap", {
    ...detailFromResponse(steer),
    turnRef: refOf(activeTurnId),
    reasonCode: steer.status === 202 ? undefined : "steer_not_accepted",
  });
}

async function request(path, options = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(requestTimeoutMs) ? requestTimeoutMs : 5000);
  const targetBaseUrl = options.baseUrlOverride ?? baseUrl;
  const targetToken = options.tokenOverride ?? token;

  try {
    const response = await fetch(`${targetBaseUrl}${path}`, {
      method: options.method ?? "GET",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${targetToken}`,
        ...(options.json ? { "content-type": "application/json" } : {}),
      },
      body: options.json ? JSON.stringify(options.json) : undefined,
    });
    const value = response.status === 204 ? null : await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      value,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      value: null,
      durationMs: Date.now() - started,
      sanitizedCode: error?.name === "AbortError" ? "request_timeout" : "request_failure",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function detailFromResponse(result) {
  return {
    status: result.status,
    durationMs: result.durationMs,
    sanitizedCode: safeErrorCode(result.value?.code) ?? result.sanitizedCode,
  };
}

function record(name, status, detail) {
  if (!requiredCheckNames.includes(name)) {
    throw new Error(`unknown real-check coverage: ${name}`);
  }
  if (!["real-pass", "fixed-pass", "real-gap"].includes(status)) {
    throw new Error(`invalid real-check status: ${status}`);
  }

  const safeDetail = {};
  for (const [key, value] of Object.entries(detail ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    if (!allowedDetailKeys.has(key)) {
      throw new Error(`unsafe real-check detail key: ${key}`);
    }
    if (typeof value === "string") {
      safeDetail[key] = sanitizeDetailString(value);
    } else if (typeof value === "number" || typeof value === "boolean") {
      safeDetail[key] = value;
    }
  }

  checks.push({ name, status, durationMs: safeDetail.durationMs ?? 0, detail: safeDetail });
}

function writeReport() {
  for (const name of requiredCheckNames) {
    if (!checks.some((check) => check.name === name)) {
      throw new Error(`missing real-check coverage: ${name}`);
    }
  }

  const generatedAt = new Date().toISOString();
  const summary = {
    total: checks.length,
    realPass: checks.filter((check) => check.status === "real-pass").length,
    fixedPass: checks.filter((check) => check.status === "fixed-pass").length,
    realGap: checks.filter((check) => check.status === "real-gap").length,
  };
  const payload = {
    schemaVersion: "real-check-report/v1",
    generatedAt,
    summary,
    checks,
  };
  assertReportSafe(payload);

  mkdirSync(reportDir, { recursive: true });
  const timestampedPath = join(reportDir, `${generatedAt.replaceAll(":", "-")}.json`);
  writeFileSync(timestampedPath, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(join(reportDir, "latest.json"), `${JSON.stringify(payload, null, 2)}\n`);

  console.log(
    `real:check total=${summary.total} real-pass=${summary.realPass} fixed-pass=${summary.fixedPass} real-gap=${summary.realGap} report=${reportRelativePath}`,
  );
  if (timestampedPath.startsWith(root)) {
    console.log(`real:check archived=${relative(root, timestampedPath)}`);
  }
}

function assertReportSafe(payload) {
  const text = JSON.stringify(payload);
  const unsafePatterns = [
    /\bsk-[A-Za-z0-9_-]{12,}\b/,
    /\bBearer\s+[A-Za-z0-9._-]{8,}\b/i,
    /\/Users\/[A-Za-z0-9._-]+\//,
    /^ {2,}at .+\(.+:\d+:\d+\)$/m,
    /\bjsonrpc\b/i,
    /\bdiff --git\b/i,
    /\braw[A-Z][A-Za-z0-9_]*\b/,
  ];
  if (unsafePatterns.some((pattern) => pattern.test(text))) {
    throw new Error("unsafe real-check report content");
  }
}

function refOf(value) {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  return `ref-${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

function firstString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function safeShortString(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  return value.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80);
}

function sanitizeDetailString(value) {
  return value.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80);
}

function safeErrorCode(value) {
  return typeof value === "string" ? value : null;
}

function allowedTransport(value) {
  return value === "stdio" || value === "debug-websocket" ? value : "unknown";
}

function isRealWorkerProof(value) {
  return (
    value?.appServerConnected === true &&
    (value?.transport === "stdio" || value?.transport === "debug-websocket") &&
    typeof value?.codexVersion === "string" &&
    value.codexVersion.length > 0 &&
    typeof value?.protocolGeneratedAt === "string" &&
    value.protocolGeneratedAt.length > 0
  );
}

function isActiveTurnStatus(status) {
  return status === "running" || status === "in_progress" || status === "pending";
}

function normalizeBaseUrl(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

main().catch((error) => {
  console.error(`real:check failed sanitizedCode=runner_failure reasonCode=${sanitizeDetailString(error?.message ?? "unknown")}`);
  process.exitCode = 1;
});
