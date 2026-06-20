import assert from "node:assert/strict";
import test from "node:test";

import type {
  ApprovalDecisionInput,
  CodexConversation,
  ConversationTimeline,
  FollowUpInput,
  InterruptTurnInput,
  StartConversationInput,
  SteerTurnInput,
  WorkerCapabilities,
  WorkerHealth,
} from "@codex-remote/api-contract";

import type { ControlPlaneConfig, ConfiguredWorkerDevice } from "../config/controlPlaneConfig.ts";
import type { WorkerUpstreamClient } from "../client/workerClient.ts";
import { createControlPlaneHttpApp } from "./controlPlaneHttpApp.ts";

const config: ControlPlaneConfig = {
  allowedOrigins: ["http://127.0.0.1:5173"],
  bindHost: "127.0.0.1",
  devices: [
    { id: "device-a", name: "Device A", baseUrl: "http://127.0.0.1:8788", token: "token-a" },
    { id: "device-b", name: "Device B", baseUrl: "http://127.0.0.1:8789", token: "token-b" },
  ],
  port: 8786,
  publicToken: "public-token",
  requestTimeoutMs: 5_000,
};

test("control plane http app when auth is missing or invalid, should return sanitized 401", async () => {
  const app = createControlPlaneHttpApp({ config, now: nowFixed, workerClient: new FakeWorkerClient() });

  const response = await app.request("http://127.0.0.1/v1/devices");

  assert.equal(response.status, 401);
  assert.equal((await response.json() as { code: string }).code, "unauthorized");
});

test("control plane http app when browser origin is unexpected, should return sanitized 403", async () => {
  const app = createControlPlaneHttpApp({ config, now: nowFixed, workerClient: new FakeWorkerClient() });

  const response = await app.request("http://127.0.0.1/v1/devices", {
    headers: { authorization: "Bearer public-token", origin: "http://evil.example" },
  });

  assert.equal(response.status, 403);
  const body = await response.text();
  assert.doesNotMatch(body, /token-a|8788|8789/);
});

test("control plane http app when devices are listed, should isolate one unavailable worker", async () => {
  const client = new FakeWorkerClient({ unavailableDeviceIds: new Set(["device-b"]) });
  const app = createControlPlaneHttpApp({ config, now: nowFixed, workerClient: client });

  const response = await request(app, "/v1/devices");

  assert.equal(response.status, 200);
  const devices = await response.json() as Array<{ id: string; status: string }>;
  assert.deepEqual(devices.map((device) => [device.id, device.status]), [
    ["device-a", "Connected"],
    ["device-b", "Not connected"],
  ]);
});

test("control plane http app when health is read, should aggregate connected device counts", async () => {
  const client = new FakeWorkerClient({ unavailableDeviceIds: new Set(["device-b"]) });
  const app = createControlPlaneHttpApp({ config, now: nowFixed, workerClient: client });

  const response = await request(app, "/v1/control-plane/health");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "degraded",
    checkedAt: "2026-06-20T00:00:00.000Z",
    deviceCount: 2,
    connectedDeviceCount: 1,
  });
});

test("control plane http app when conversations are listed, should normalize configured device ids", async () => {
  const app = createControlPlaneHttpApp({ config, now: nowFixed, workerClient: new FakeWorkerClient({ upstreamDeviceId: "other-device" }) });

  const response = await request(app, "/v1/conversations");

  assert.equal(response.status, 200);
  const conversations = await response.json() as CodexConversation[];
  assert.deepEqual(new Set(conversations.map((conversation) => conversation.deviceId)), new Set(["device-a", "device-b"]));
});

test("control plane http app when device scoped routes are used, should call selected upstream and normalize identity", async () => {
  const client = new FakeWorkerClient({ upstreamDeviceId: "other-device" });
  const app = createControlPlaneHttpApp({ config, now: nowFixed, workerClient: client });

  const health = await (await request(app, "/v1/devices/device-a/worker/health")).json() as WorkerHealth;
  const capabilities = await (await request(app, "/v1/devices/device-a/worker/capabilities")).json() as WorkerCapabilities;
  const timeline = await (await request(app, "/v1/devices/device-a/conversations/thread-a/timeline")).json() as ConversationTimeline;

  assert.equal(health.deviceId, "device-a");
  assert.equal(capabilities.deviceId, "device-a");
  assert.equal(timeline.deviceId, "device-a");
  assert.deepEqual(client.calls.map((call) => call.deviceId), ["device-a", "device-a", "device-a"]);
});

test("control plane http app when approvals are listed, should proxy selected device", async () => {
  const client = new FakeWorkerClient();
  const app = createControlPlaneHttpApp({ config, now: nowFixed, workerClient: client });

  const response = await request(app, "/v1/devices/device-a/conversations/thread-a/approvals");

  assert.equal(response.status, 200);
  const approvals = await response.json() as Array<{ conversationId: string; id: string }>;
  assert.deepEqual(approvals.map((approval) => ({ conversationId: approval.conversationId, id: approval.id })), [
    { conversationId: "thread-a", id: "approval-a" },
  ]);
  assert.deepEqual(client.calls.map((call) => `${call.method}:${call.deviceId}`), ["listApprovals:device-a"]);
});

test("control plane http app when write and control routes are used, should proxy public bodies to selected device", async () => {
  const client = new FakeWorkerClient();
  const app = createControlPlaneHttpApp({ config, now: nowFixed, workerClient: client });

  await request(app, "/v1/devices/device-b/conversations", {
    method: "POST",
    body: JSON.stringify({ projectId: "project-a", message: "Start", clientRequestId: "start-1" }),
  });
  await request(app, "/v1/devices/device-b/conversations/thread-b/follow-up", {
    method: "POST",
    body: JSON.stringify({ message: "Follow", clientRequestId: "follow-1", expectedConversationId: "thread-b" }),
  });
  await request(app, "/v1/devices/device-b/conversations/thread-b/turns/turn-b/interrupt", {
    method: "POST",
    body: JSON.stringify({ clientRequestId: "interrupt-1", expectedTurnId: "turn-b" }),
  });
  await request(app, "/v1/devices/device-b/conversations/thread-b/turns/turn-b/steer", {
    method: "POST",
    body: JSON.stringify({ message: "Steer", clientRequestId: "steer-1", expectedTurnId: "turn-b" }),
  });
  await request(app, "/v1/devices/device-b/conversations/thread-b/approvals/approval-b/decision", {
    method: "POST",
    body: JSON.stringify({
      decision: "accept",
      clientRequestId: "approval-1",
      expectedConversationId: "thread-b",
      expectedTurnId: "turn-b",
      expectedApprovalRequestId: "approval-b",
    }),
  });

  assert.deepEqual(client.calls.map((call) => `${call.method}:${call.deviceId}`), [
    "startConversation:device-b",
    "followUp:device-b",
    "interrupt:device-b",
    "steer:device-b",
    "decideApproval:device-b",
  ]);
});

test("control plane http app when device is unknown or upstream fails, should return sanitized errors", async () => {
  const app = createControlPlaneHttpApp({
    config,
    now: nowFixed,
    workerClient: new FakeWorkerClient({ unavailableDeviceIds: new Set(["device-a"]) }),
  });

  const missing = await request(app, "/v1/devices/missing/worker/health");
  const unavailable = await request(app, "/v1/devices/device-a/worker/health");

  assert.equal(missing.status, 404);
  assert.equal(unavailable.status, 424);
  const body = `${await missing.text()} ${await unavailable.text()}`;
  assert.doesNotMatch(body, /token-a|token-b|8788|8789|other-device/);
});

function nowFixed(): string {
  return "2026-06-20T00:00:00.000Z";
}

function request(app: ReturnType<typeof createControlPlaneHttpApp>, path: string, init: RequestInit = {}): Promise<Response> {
  return Promise.resolve(app.request(`http://127.0.0.1${path}`, {
    ...init,
    headers: {
      authorization: "Bearer public-token",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  }));
}

class FakeWorkerClient implements WorkerUpstreamClient {
  readonly calls: Array<{ deviceId: string; method: string }> = [];
  private readonly unavailableDeviceIds: Set<string>;
  private readonly upstreamDeviceId: string | null;

  constructor(options: { unavailableDeviceIds?: Set<string>; upstreamDeviceId?: string } = {}) {
    this.unavailableDeviceIds = options.unavailableDeviceIds ?? new Set();
    this.upstreamDeviceId = options.upstreamDeviceId ?? null;
  }

  async getHealth(device: ConfiguredWorkerDevice): Promise<WorkerHealth> {
    this.record(device, "getHealth");
    this.throwIfUnavailable(device);
    return {
      deviceId: this.upstreamDeviceId ?? device.id,
      status: "connected",
      checkedAt: "2026-06-20T00:00:01.000Z",
      codexVersion: "fake",
      appServer: { transport: "loopbackWebSocket", readyz: true },
    };
  }

  async getCapabilities(device: ConfiguredWorkerDevice): Promise<WorkerCapabilities> {
    this.record(device, "getCapabilities");
    this.throwIfUnavailable(device);
    return {
      deviceId: this.upstreamDeviceId ?? device.id,
      canReadProjects: true,
      canReadConversations: true,
      canReadTimeline: true,
      canRunReadOnlyProbe: true,
      appServerTransport: "loopbackWebSocket",
      supportedSourceKinds: ["cli"],
    };
  }

  async listConversations(device: ConfiguredWorkerDevice): Promise<CodexConversation[]> {
    this.record(device, "listConversations");
    this.throwIfUnavailable(device);
    return [createConversation(this.upstreamDeviceId ?? device.id, `thread-${device.id}`)];
  }

  async readTimeline(device: ConfiguredWorkerDevice, conversationId: string): Promise<ConversationTimeline> {
    this.record(device, "readTimeline");
    this.throwIfUnavailable(device);
    return {
      deviceId: this.upstreamDeviceId ?? device.id,
      conversationId,
      projectId: "project-a",
      readStartedAt: "2026-06-20T00:00:00.000Z",
      readCompletedAt: "2026-06-20T00:00:01.000Z",
      snapshotRevision: `${conversationId}:1`,
      runtimeStatus: "running",
      latestTurnStatus: "unknown",
      turns: [],
    };
  }

  async listApprovals(device: ConfiguredWorkerDevice, conversationId: string) {
    this.record(device, "listApprovals");
    this.throwIfUnavailable(device);
    return [
      {
        id: "approval-a",
        conversationId,
        turnId: "turn-a",
        itemId: "item-a",
        kind: "command_execution" as const,
        status: "pending" as const,
        startedAt: "2026-06-20T00:00:00.000Z",
        summary: "Approval",
        risk: "medium" as const,
      },
    ];
  }

  async startConversation(device: ConfiguredWorkerDevice, input: StartConversationInput) {
    this.record(device, "startConversation");
    return createAccepted(device.id, input.clientRequestId);
  }

  async followUp(device: ConfiguredWorkerDevice, _conversationId: string, input: FollowUpInput) {
    this.record(device, "followUp");
    return createAccepted(device.id, input.clientRequestId);
  }

  async interrupt(device: ConfiguredWorkerDevice, _conversationId: string, _turnId: string, input: InterruptTurnInput) {
    this.record(device, "interrupt");
    return createAccepted(device.id, input.clientRequestId);
  }

  async steer(device: ConfiguredWorkerDevice, _conversationId: string, _turnId: string, input: SteerTurnInput) {
    this.record(device, "steer");
    return createAccepted(device.id, input.clientRequestId);
  }

  async decideApproval(device: ConfiguredWorkerDevice, _conversationId: string, _approvalRequestId: string, input: ApprovalDecisionInput) {
    this.record(device, "decideApproval");
    return createAccepted(device.id, input.clientRequestId);
  }

  private record(device: ConfiguredWorkerDevice, method: string): void {
    this.calls.push({ deviceId: device.id, method });
  }

  private throwIfUnavailable(device: ConfiguredWorkerDevice): void {
    if (this.unavailableDeviceIds.has(device.id)) {
      throw new Error("upstream unavailable token-a 127.0.0.1:8788 other-device");
    }
  }
}

function createConversation(deviceId: string, id: string): CodexConversation {
  return {
    id,
    title: id,
    deviceId,
    projectId: "project-a",
    projectName: "Project A",
    status: "running",
    updatedAt: id.endsWith("a") ? "2026-06-20T00:00:02.000Z" : "2026-06-20T00:00:01.000Z",
    summary: "Fake conversation",
    sandbox: "workspace-write",
    approval: "never",
  };
}

function createAccepted(deviceId: string, clientRequestId: string) {
  return {
    id: `${deviceId}:${clientRequestId}`,
    status: "accepted" as const,
    conversationId: `thread-${deviceId}`,
    turnId: `turn-${deviceId}`,
    acceptedAt: "2026-06-20T00:00:02.000Z",
  };
}
