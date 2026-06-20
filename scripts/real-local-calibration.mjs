#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { join, relative } from "node:path";
import process from "node:process";
import { tmpdir } from "node:os";

const root = process.cwd();
const reportDir = join(root, "logs/real-check");
const reportRelativePath = "logs/real-check/latest.json";
const baseUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_BASE_URL ?? "http://127.0.0.1:8786");
const workerBaseUrl = normalizeBaseUrl(process.env.CODEX_REMOTE_WORKER_BASE_URL ?? "http://127.0.0.1:8787");
const token =
  process.env.NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_TOKEN ?? process.env.CODEX_REMOTE_LOCAL_TOKEN ?? "example-token";
const requestTimeoutMs = Number.parseInt(process.env.CODEX_REMOTE_REAL_CHECK_TIMEOUT_MS ?? "5000", 10);
const safeSteerSamplePrompt = "codex-remote-calibration steer sample: wait ten seconds, then reply with OK.";
const safeSteerPrompt = "codex-remote-calibration steer: keep the response short.";
const fixtureDeviceId = "fixture-device";
const fixtureApprovalKinds = new Set(["file_change", "command_execution", "legacy_apply_patch", "legacy_exec"]);
const unsafeReportFieldNames = [
  "st" + "ack",
  "ca" + "use",
  "output",
  "stdout",
  "stderr",
  "prompt",
  "full" + "Diff",
  "approvalRequestId",
  "expectedApprovalRequestId",
  "turnId",
  "conversationId",
  "requestId",
  "method",
  "id",
];

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
  "activeTurnProven",
  "exactCwdListProven",
  "completedUntilNextCursorNull",
]);

const workerProofGatedChecks = new Set(["start conversation", "follow-up", "interrupt", "steer", "approval decision", "task link"]);

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

  const workerHealth = await request(`/v1/devices/${encodeURIComponent(deviceId)}/worker/health`);
  const workerCapabilities = await request(`/v1/devices/${encodeURIComponent(deviceId)}/worker/capabilities`);
  const workerProbe = await request(`/v1/devices/${encodeURIComponent(deviceId)}/worker/probe`);
  const workerEvidence = inspectWorkerEvidence(workerHealth, workerCapabilities);
  record("worker app-server proof", workerEvidence.proven ? "real-pass" : "real-gap", {
    ...detailFromResponse(workerHealth),
    appServerConnected: workerEvidence.appServerConnected,
    transport: workerEvidence.transport,
    codexVersion: workerEvidence.codexVersion,
    reasonCode: workerEvidence.proven ? undefined : workerEvidence.reasonCode,
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
  const listedConversationId = firstString(conversationList[0]?.id);
  let conversationId = listedConversationId;
  record("conversations", conversations.ok && Array.isArray(conversations.value) ? "real-pass" : "real-gap", {
    ...detailFromResponse(conversations),
    count: conversationList.length,
  });

  recordThreadListProbe(workerProbe);

  if (workerEvidence.proven && deviceId && projectId) {
    const started = await request(`/v1/devices/${encodeURIComponent(deviceId)}/conversations`, {
      method: "POST",
      json: {
        projectId,
        message: "codex-remote-calibration start: reply with one short sentence.",
        clientRequestId: `real-check-start-${Date.now()}`,
      },
    });
    conversationId = firstString(started.value?.conversationId) ?? conversationId;
    record("start conversation", operationStatus("start conversation", started.status === 202, workerEvidence), {
      ...detailFromResponse(started),
      conversationRef: refOf(conversationId),
      reasonCode: operationReasonCode(started.status === 202, workerEvidence, "start_not_accepted"),
    });
  } else {
    record("start conversation", "real-gap", {
      reasonCode: workerEvidence.proven ? (projectId ? "no_device" : "no_project") : "real_app_server_not_proven",
    });
  }

  let activeTurnId = null;
  let steerConversationId = null;
  let steerTurnId = null;
  let steerActiveTurnId = null;
  if (workerEvidence.proven && deviceId && conversationId) {
    const timeline = await waitForTimeline(deviceId, conversationId);
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
    record("follow-up", operationStatus("follow-up", followUp.status === 202, workerEvidence), {
      ...detailFromResponse(followUp),
      turnRef: refOf(followUp.value?.turnId),
      reasonCode: operationReasonCode(followUp.status === 202, workerEvidence, "follow_up_not_accepted"),
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
      record("approval decision", operationStatus("approval decision", decision.status === 202, workerEvidence), {
        ...detailFromResponse(decision),
        turnRef: refOf(approval.turnId),
        reasonCode: operationReasonCode(decision.status === 202, workerEvidence, "approval_decision_not_accepted"),
      });
    } else {
      const fixtureResult = await runIsolatedApprovalFixture();
      record("approval decision", fixtureResult.status, fixtureResult.detail);
    }

    const steerSample = await startSteerSample(deviceId, projectId);
    steerConversationId = steerSample.conversationId;
    steerTurnId = steerSample.turnId;
    steerActiveTurnId = steerTurnId && steerConversationId ? await waitForActiveTurn(deviceId, steerConversationId, steerTurnId) : null;
  } else {
    const reasonCode = workerEvidence.proven ? "no_conversation" : "real_app_server_not_proven";
    record("timeline", "real-gap", { reasonCode });
    record("follow-up", "real-gap", { reasonCode });
    record("approval pending scenario", "real-gap", { reasonCode });
    record("approval decision", "real-gap", { reasonCode });
  }

  if (workerEvidence.proven && deviceId && conversationId && (activeTurnId || steerTurnId)) {
    await recordActiveTurnControls(deviceId, conversationId, { interruptTurnId: activeTurnId, steerConversationId, steerTurnId, steerActiveTurnId }, workerEvidence);
  } else {
    const reasonCode = workerEvidence.proven ? "no_safe_active_turn" : "real_app_server_not_proven";
    record("interrupt", "real-gap", { reasonCode });
    record("steer", "real-gap", { reasonCode });
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

  const taskLinkConversationId = listedConversationId ?? conversationId;
  if (workerEvidence.proven && taskId && deviceId && projectId && taskLinkConversationId) {
    const link = await request(`/v1/tasks/${encodeURIComponent(taskId)}/conversation-links`, {
      method: "POST",
      json: { deviceId, projectId, conversationId: taskLinkConversationId },
    });
    record("task link", operationStatus("task link", link.status === 201, workerEvidence), {
      ...detailFromResponse(link),
      taskRef: refOf(taskId),
      conversationRef: refOf(taskLinkConversationId),
      reasonCode: operationReasonCode(link.status === 201, workerEvidence, "task_link_not_created"),
    });
  } else {
    record("task link", "real-gap", { reasonCode: workerEvidence.proven ? "missing_task_or_conversation" : "real_app_server_not_proven" });
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

  await recordControlPlaneFailureFixture("control-plane all-workers-down", {
    baseUrl: `http://127.0.0.1:${await findUnusedLoopbackPort()}`,
    reasonCode: "no_all_workers_down_fixture",
    token,
  });
  await recordControlPlaneFailureFixture("control-plane invalid-worker-token", {
    baseUrl: workerBaseUrl,
    reasonCode: "no_invalid_worker_token_fixture",
    token: `${token}-invalid`,
  });

  writeReport();
}

async function recordControlPlaneFailureFixture(name, device) {
  const fixture = await startControlPlaneFixture(device);
  if (!fixture) {
    record(name, "real-gap", { reasonCode: device.reasonCode });
    return;
  }

  try {
    const health = await request("/v1/control-plane/health", fixture);
    const devices = await request("/v1/devices", fixture);
    const conversations = await request("/v1/conversations", fixture);
    const deviceList = Array.isArray(devices.value) ? devices.value : [];
    const healthIsDegraded = health.status === 200 && health.value?.status === "degraded";
    const devicesAreDegraded = devices.status === 200 && deviceList.some((item) => item?.status === "Not connected");
    const conversationsFailClosed = conversations.status >= 400 && conversations.status !== 404;
    record(name, healthIsDegraded && devicesAreDegraded && conversationsFailClosed ? "real-pass" : "real-gap", {
      ...detailFromResponse(conversations),
      count: deviceList.length,
      reasonCode: healthIsDegraded && devicesAreDegraded && conversationsFailClosed ? undefined : device.reasonCode,
    });
  } finally {
    await fixture.stop();
  }
}

async function runIsolatedApprovalFixture() {
  const startedAt = Date.now();
  let fixtureRoot = null;
  let worker = null;
  let controlPlane = null;

  try {
    fixtureRoot = await mkdtemp(join(tmpdir(), "codex-remote-approval-"));
    const workerPort = await findUnusedLoopbackPort();
    const controlPlanePort = await findUnusedLoopbackPort();
    const fixture = {
      baseUrlOverride: `http://127.0.0.1:${controlPlanePort}`,
      tokenOverride: token,
    };

    worker = startFixtureWorker({ fixtureRoot, workerPort, controlPlanePort });
    const workerReady = await waitForFixtureHttp({
      child: worker,
      fixture: { baseUrlOverride: `http://127.0.0.1:${workerPort}`, tokenOverride: token },
      path: "/v1/worker/health",
      deadlineMs: 10_000,
    });
    if (workerReady.status !== "ready") {
      return approvalFixtureGap(workerReady.reasonCode, startedAt, workerReady.detail);
    }

    controlPlane = startFixtureControlPlane({ workerPort, controlPlanePort });
    const controlPlaneReady = await waitForFixtureHttp({
      child: controlPlane,
      fixture,
      path: "/v1/control-plane/health",
      deadlineMs: 10_000,
    });
    if (controlPlaneReady.status !== "ready") {
      return approvalFixtureGap(controlPlaneReady.reasonCode, startedAt, controlPlaneReady.detail);
    }

    const projects = await request("/v1/projects", fixture);
    const projectId = firstString(Array.isArray(projects.value) ? projects.value[0]?.id : null);
    if (projects.status === 0) {
      return approvalFixtureGap(requestFailureReason(projects, "approval_fixture_start_not_accepted"), startedAt, detailFromResponse(projects));
    }
    if (!projects.ok || !projectId) {
      return approvalFixtureGap("approval_fixture_start_not_accepted", startedAt, detailFromResponse(projects));
    }

    const targetFile = join(fixtureRoot, "approval-fixture-target.txt");
    const started = await request(`/v1/devices/${encodeURIComponent(fixtureDeviceId)}/conversations`, {
      ...fixture,
      method: "POST",
      json: {
        projectId,
        message: "Create a file named approval-fixture-target.txt in the current project root containing the word declined.",
        clientRequestId: `real-check-approval-fixture-${Date.now()}`,
      },
    });
    const conversationId = firstString(started.value?.conversationId);
    const turnId = firstString(started.value?.turnId);
    if (started.status === 0) {
      return approvalFixtureGap(requestFailureReason(started, "approval_fixture_start_not_accepted"), startedAt, detailFromResponse(started));
    }
    if (started.status !== 202 || !conversationId) {
      return approvalFixtureGap("approval_fixture_start_not_accepted", startedAt, detailFromResponse(started));
    }

    const pendingResult = await pollFixtureApproval({ fixture, conversationId, childProcesses: [worker, controlPlane] });
    if (pendingResult.status !== "pending") {
      return approvalFixtureGap(pendingResult.reasonCode, startedAt, {
        ...pendingResult.detail,
        conversationRef: refOf(conversationId),
        turnRef: refOf(turnId),
      });
    }

    const approval = pendingResult.approval;
    if (!fixtureApprovalKinds.has(approval.kind)) {
      return approvalFixtureGap("approval_fixture_unexpected_kind", startedAt, {
        count: pendingResult.count,
        conversationRef: refOf(conversationId),
        turnRef: refOf(approval.turnId),
      });
    }

    const decision = await request(
      `/v1/devices/${encodeURIComponent(fixtureDeviceId)}/conversations/${encodeURIComponent(conversationId)}/approvals/${encodeURIComponent(
        approval.id,
      )}/decision`,
      {
        ...fixture,
        method: "POST",
        json: {
          decision: "decline",
          clientRequestId: `real-check-approval-fixture-decline-${Date.now()}`,
          expectedConversationId: conversationId,
          expectedTurnId: approval.turnId,
          expectedApprovalRequestId: approval.id,
        },
      },
    );
    if (decision.status === 0) {
      return approvalFixtureGap("approval_fixture_timeout", startedAt, {
        ...detailFromResponse(decision),
        count: pendingResult.count,
        conversationRef: refOf(conversationId),
        turnRef: refOf(approval.turnId),
      });
    }
    if (decision.status !== 202) {
      return approvalFixtureGap("approval_fixture_decline_not_accepted", startedAt, {
        ...detailFromResponse(decision),
        count: pendingResult.count,
        conversationRef: refOf(conversationId),
        turnRef: refOf(approval.turnId),
      });
    }

    await sleep(250);
    if (existsSync(targetFile)) {
      return approvalFixtureGap("approval_fixture_side_effect_remained", startedAt, {
        count: pendingResult.count,
        conversationRef: refOf(conversationId),
        turnRef: refOf(approval.turnId),
      });
    }

    return {
      status: "real-pass",
      detail: {
        status: decision.status,
        durationMs: Date.now() - startedAt,
        count: pendingResult.count,
        conversationRef: refOf(conversationId),
        turnRef: refOf(approval.turnId),
      },
    };
  } catch {
    return approvalFixtureGap("approval_fixture_process_failed", startedAt);
  } finally {
    await stopFixtureProcess(controlPlane);
    await stopFixtureProcess(worker);
    if (fixtureRoot) {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  }
}

function startFixtureWorker(params) {
  return trackFixtureProcess(spawn("pnpm", ["--filter", "@codex-remote/worker", "serve:read"], {
    cwd: root,
    env: {
      ...process.env,
      CODEX_REMOTE_WORKER_TOKEN: token,
      CODEX_REMOTE_ALLOWED_ORIGINS: `http://127.0.0.1:${params.controlPlanePort}`,
      CODEX_REMOTE_ALLOWED_PROJECT_ROOT: params.fixtureRoot,
      CODEX_REMOTE_DEVICE_ID: fixtureDeviceId,
      CODEX_REMOTE_HTTP_PORT: String(params.workerPort),
      CODEX_REMOTE_CALIBRATION_APPROVAL_MODE: "on-request",
      CODEX_REMOTE_START_APP_SERVER: "true",
      CODEX_REMOTE_APP_SERVER_TRANSPORT: "stdio",
    },
    stdio: "ignore",
  }));
}

function startFixtureControlPlane(params) {
  const config = {
    allowedOrigins: ["http://127.0.0.1:5173"],
    bindHost: "127.0.0.1",
    devices: [
      {
        id: fixtureDeviceId,
        name: "Fixture Device",
        baseUrl: `http://127.0.0.1:${params.workerPort}`,
        token,
      },
    ],
    port: params.controlPlanePort,
    publicToken: token,
    requestTimeoutMs: requestTimeoutMs > 0 ? requestTimeoutMs : 5_000,
    taskDatabasePath: ":memory:",
  };
  return trackFixtureProcess(spawn("pnpm", ["--filter", "@codex-remote/control-plane", "serve"], {
    cwd: root,
    env: {
      ...process.env,
      CODEX_REMOTE_CONTROL_PLANE_CONFIG: JSON.stringify(config),
    },
    stdio: "ignore",
  }));
}

async function waitForFixtureHttp(params) {
  const deadlineAt = Date.now() + params.deadlineMs;
  while (Date.now() < deadlineAt) {
    if (hasProcessFailed(params.child)) {
      return { status: "gap", reasonCode: "approval_fixture_process_failed" };
    }
    const health = await request(params.path, params.fixture);
    if (health.status > 0) {
      return { status: "ready" };
    }
    await sleep(100);
  }
  return { status: "gap", reasonCode: "approval_fixture_timeout" };
}

async function pollFixtureApproval(params) {
  const deadlineAt = Date.now() + 20_000;
  let latestCount = 0;

  while (Date.now() < deadlineAt) {
    if (params.childProcesses.some((child) => hasProcessFailed(child))) {
      return { status: "gap", reasonCode: "approval_fixture_process_failed", detail: { count: latestCount } };
    }

    const approvals = await request(
      `/v1/devices/${encodeURIComponent(fixtureDeviceId)}/conversations/${encodeURIComponent(params.conversationId)}/approvals`,
      params.fixture,
    );
    if (approvals.status === 0) {
      return {
        status: "gap",
        reasonCode: approvals.sanitizedCode === "request_timeout" ? "approval_fixture_timeout" : "approval_fixture_approval_list_failed",
        detail: detailFromResponse(approvals),
      };
    }
    if (!approvals.ok) {
      return { status: "gap", reasonCode: "approval_fixture_approval_list_failed", detail: detailFromResponse(approvals) };
    }
    const list = approvals.value;
    if (!Array.isArray(list) || list.some((approval) => !isPublicApproval(approval))) {
      return { status: "gap", reasonCode: "approval_fixture_malformed_response", detail: detailFromResponse(approvals) };
    }
    latestCount = list.length;
    if (list.length > 0) {
      return { status: "pending", approval: list[0], count: list.length };
    }
    await sleep(500);
  }

  return { status: "gap", reasonCode: "approval_fixture_no_pending_request", detail: { count: latestCount } };
}

function isPublicApproval(value) {
  return Boolean(
    value
      && typeof value === "object"
      && !Array.isArray(value)
      && typeof value.id === "string"
      && typeof value.turnId === "string"
      && typeof value.kind === "string",
  );
}

function approvalFixtureGap(reasonCode, startedAt, detail = {}) {
  return {
    status: "real-gap",
    detail: {
      ...detail,
      durationMs: Date.now() - startedAt,
      reasonCode,
    },
  };
}

function hasProcessFailed(child) {
  return !child || child.fixtureProcessFailed === true || child.exitCode !== null || child.signalCode !== null;
}

function requestFailureReason(result, fallbackReasonCode) {
  return result.sanitizedCode === "request_timeout" ? "approval_fixture_timeout" : fallbackReasonCode;
}

function trackFixtureProcess(child) {
  child.fixtureProcessFailed = false;
  child.once("error", () => {
    child.fixtureProcessFailed = true;
  });
  return child;
}

async function stopFixtureProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 1000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function startControlPlaneFixture(device) {
  const port = await findUnusedLoopbackPort();
  const config = {
    allowedOrigins: ["http://127.0.0.1:5173"],
    bindHost: "127.0.0.1",
    devices: [
      {
        id: "fixture-device",
        name: "Fixture Device",
        baseUrl: device.baseUrl,
        token: device.token,
      },
    ],
    port,
    publicToken: token,
    requestTimeoutMs: 750,
    taskDatabasePath: ":memory:",
  };
  const child = spawn("pnpm", ["--filter", "@codex-remote/control-plane", "serve"], {
    cwd: root,
    env: {
      ...process.env,
      CODEX_REMOTE_CONTROL_PLANE_CONFIG: JSON.stringify(config),
    },
    stdio: "ignore",
  });
  const fixture = {
    baseUrlOverride: `http://127.0.0.1:${port}`,
    tokenOverride: token,
    async stop() {
      if (child.exitCode !== null) {
        return;
      }
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 1000);
        child.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    },
  };

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (child.exitCode !== null) {
      return null;
    }
    const health = await request("/v1/control-plane/health", fixture);
    if (health.status > 0) {
      return fixture;
    }
    await sleep(100);
  }

  await fixture.stop();
  return null;
}

function recordThreadListProbe(workerProbe) {
  const threadList = Array.isArray(workerProbe.value?.checks)
    ? workerProbe.value.checks.find((check) => check?.name === "thread/list")
    : null;
  const detail = {
    ...detailFromResponse(workerProbe),
    exactCwdListProven: threadList?.exactCwdListProven === true,
    completedUntilNextCursorNull: threadList?.completedUntilNextCursorNull === true,
    pageCount: safeNumber(threadList?.pageCount),
    cursorCount: safeNumber(threadList?.cursorCount),
    count: safeNumber(threadList?.count),
  };

  if (!workerProbe.ok || !threadList) {
    record("thread/list cwd scope", "real-gap", {
      ...detail,
      reasonCode: workerProbe.ok ? "cwd_scope_probe_missing" : "worker_probe_unavailable",
    });
    record("thread/list pagination", "real-gap", {
      ...detail,
      reasonCode: workerProbe.ok ? "pagination_probe_missing" : "worker_probe_unavailable",
    });
    return;
  }

  record("thread/list cwd scope", threadList.exactCwdListProven === true ? "real-pass" : "real-gap", {
    ...detail,
    reasonCode: threadList.exactCwdListProven === true ? undefined : "cwd_scope_probe_incomplete",
  });
  record("thread/list pagination", threadList.completedUntilNextCursorNull === true ? "real-pass" : "real-gap", {
    ...detail,
    reasonCode: threadList.completedUntilNextCursorNull === true ? undefined : safeReasonCode(threadList.reasonCode) ?? "pagination_probe_incomplete",
  });
}

async function startSteerSample(deviceId, projectId) {
  if (!deviceId || !projectId) {
    return { conversationId: null, turnId: null };
  }

  const started = await request(`/v1/devices/${encodeURIComponent(deviceId)}/conversations`, {
    method: "POST",
    json: {
      projectId,
      message: safeSteerSamplePrompt,
      clientRequestId: `real-check-steer-sample-${Date.now()}`,
    },
  });

  return {
    conversationId: firstString(started.value?.conversationId),
    turnId: started.status === 202 ? firstString(started.value?.turnId) : null,
  };
}

async function waitForTimeline(deviceId, conversationId) {
  let latest = null;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    latest = await request(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/timeline`,
    );
    if (latest.ok) {
      return latest;
    }
    await sleep(250);
  }

  return latest ?? { status: 0, ok: false, durationMs: 0, value: null };
}

async function waitForActiveTurn(deviceId, conversationId, expectedTurnId) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const timeline = await request(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/timeline`,
    );
    const turns = Array.isArray(timeline.value?.turns) ? timeline.value.turns : [];
    const turn = turns.find((item) => firstString(item?.id) === expectedTurnId);
    if (turn && isActiveTurnStatus(turn.status)) {
      return expectedTurnId;
    }
    await sleep(250);
  }

  return null;
}

async function recordActiveTurnControls(deviceId, conversationId, turnIds, workerEvidence) {
  if (turnIds.steerTurnId && turnIds.steerActiveTurnId === turnIds.steerTurnId) {
    const targetSteerConversationId = turnIds.steerConversationId ?? conversationId;
    const steer = await request(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(targetSteerConversationId)}/turns/${encodeURIComponent(
        turnIds.steerTurnId,
      )}/steer`,
      {
        method: "POST",
        json: {
          message: safeSteerPrompt,
          clientRequestId: `real-check-steer-${Date.now()}`,
          expectedTurnId: turnIds.steerTurnId,
        },
      },
    );
    record("steer", operationStatus("steer", steer.status === 202, workerEvidence), {
      ...detailFromResponse(steer),
      activeTurnProven: true,
      turnRef: refOf(turnIds.steerTurnId),
      reasonCode: operationReasonCode(steer.status === 202, workerEvidence, "steer-rpc-gap"),
    });
  } else {
    record("steer", "real-gap", {
      activeTurnProven: false,
      turnRef: refOf(turnIds.steerTurnId),
      reasonCode: "active-turn-gap",
    });
  }

  if (turnIds.interruptTurnId) {
    const interrupt = await request(
      `/v1/devices/${encodeURIComponent(deviceId)}/conversations/${encodeURIComponent(conversationId)}/turns/${encodeURIComponent(
        turnIds.interruptTurnId,
      )}/interrupt`,
      {
        method: "POST",
        json: {
          clientRequestId: `real-check-interrupt-${Date.now()}`,
          expectedTurnId: turnIds.interruptTurnId,
        },
      },
    );
    record("interrupt", operationStatus("interrupt", interrupt.status === 202, workerEvidence), {
      ...detailFromResponse(interrupt),
      turnRef: refOf(turnIds.interruptTurnId),
      reasonCode: operationReasonCode(interrupt.status === 202, workerEvidence, "interrupt_not_accepted"),
    });
  } else {
    record("interrupt", "real-gap", { reasonCode: "no_safe_active_turn" });
  }
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

export function assertReportSafe(payload) {
  const text = JSON.stringify(payload);
  const unsafePatterns = [
    /\bsk-[A-Za-z0-9_-]{12,}\b/,
    /\bBearer\s+[A-Za-z0-9._-]{8,}\b/i,
    /\b(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|providerSecret|providerToken|authToken|accessToken)\b/i,
    /\b(?:token|apiKey|secret|providerKey)"\s*:\s*"[A-Za-z0-9._-]{8,}"/i,
    /\/Users\/[A-Za-z0-9._-]+\//,
    /\/(?:private\/)?var\/folders\/[A-Za-z0-9/_-]*codex-remote-approval-/,
    /\/tmp\/codex-remote-approval-/,
    /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\b/i,
    /^ {2,}at .+\(.+:\d+:\d+\)$/m,
    new RegExp(`"(?:${unsafeReportFieldNames.join("|")})"\\s*:`, "i"),
    /\bjsonrpc\b/i,
    /\bdiff --git\b/i,
    /@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/,
    /\bCreate a file named approval-fixture-target\.txt\b/i,
    /\braw prompt\b/i,
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

function safeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeReasonCode(value) {
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
  return value === "stdio" || value === "loopbackWebSocket" || value === "unixSocket" ? value : "unknown";
}

function inspectWorkerEvidence(health, capabilities) {
  const healthTransport = allowedTransport(health.value?.appServer?.transport);
  const capabilityTransport = allowedTransport(capabilities.value?.appServerTransport);
  const appServerConnected = health.ok && health.value?.appServer?.readyz === true;
  const transportAgrees = healthTransport !== "unknown" && healthTransport === capabilityTransport;
  const stage9Transport = healthTransport === "stdio";
  const proven = appServerConnected && capabilities.ok && transportAgrees && stage9Transport;
  return {
    proven,
    appServerConnected,
    transport: healthTransport,
    codexVersion: safeShortString(health.value?.codexVersion) ?? "unknown",
    reasonCode: workerEvidenceReasonCode({
      health,
      capabilities,
      appServerConnected,
      healthTransport,
      capabilityTransport,
      transportAgrees,
      stage9Transport,
    }),
  };
}

function workerEvidenceReasonCode(evidence) {
  if (!evidence.health.ok) {
    return "worker_health_unavailable";
  }
  if (!evidence.capabilities.ok) {
    return "worker_capabilities_unavailable";
  }
  if (!evidence.appServerConnected) {
    return "worker_app_server_readyz_not_proven";
  }
  if (evidence.healthTransport === "unknown" || evidence.capabilityTransport === "unknown") {
    return "unknown_worker_transport";
  }
  if (!evidence.transportAgrees) {
    return "worker_transport_mismatch";
  }
  if (evidence.healthTransport === "loopbackWebSocket") {
    return "debug_websocket_fallback_not_readiness";
  }
  if (!evidence.stage9Transport) {
    return "unsupported_stage9_transport";
  }
  return "real_app_server_not_proven";
}

function operationStatus(name, accepted, workerEvidence) {
  if (!workerProofGatedChecks.has(name)) {
    throw new Error(`operation status gate missing check: ${name}`);
  }
  return accepted && workerEvidence.proven ? "real-pass" : "real-gap";
}

function operationReasonCode(accepted, workerEvidence, failureReasonCode) {
  if (!workerEvidence.proven) {
    return "real_app_server_not_proven";
  }
  return accepted ? undefined : failureReasonCode;
}

function isActiveTurnStatus(status) {
  return status === "running" || status === "in_progress" || status === "pending";
}

function normalizeBaseUrl(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function findUnusedLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("port_lookup_failed")));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`real:check failed sanitizedCode=runner_failure reasonCode=${sanitizeDetailString(error?.message ?? "unknown")}`);
    process.exitCode = 1;
  });
}
