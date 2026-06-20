import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openTaskDatabase, type TaskDatabase, type TaskRepository } from "@codex-remote/db";
import type {
  ApprovalDecisionInput,
  BoardTask,
  CodexConversation,
  ConversationTimeline,
  FollowUpInput,
  InterruptTurnInput,
  StartConversationInput,
  SteerTurnInput,
  TaskConversationLink,
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
  taskDatabasePath: ":memory:",
};

const sharedTaskDatabase = openTaskDatabase(":memory:");

test.after(() => {
  sharedTaskDatabase.close();
});

test("control plane http app when auth is missing or invalid, should return sanitized 401", async () => {
  const app = createApp();

  const response = await app.request("http://127.0.0.1/v1/devices");

  assert.equal(response.status, 401);
  assert.equal((await response.json() as { code: string }).code, "unauthorized");
});

test("control plane http app when task auth is missing, should return sanitized 401", async () => {
  const fixture = TaskDatabaseFixture.createMemory();
  try {
    const app = createTaskApp(fixture.database.tasks);

    const response = await app.request("http://127.0.0.1/v1/tasks");

    assert.equal(response.status, 401);
    assert.equal((await response.json() as { code: string }).code, "unauthorized");
  } finally {
    fixture.close();
  }
});

test("control plane http app when tasks are created and listed, should return board tasks from the repository", async () => {
  const fixture = TaskDatabaseFixture.createMemory();
  try {
    const app = createTaskApp(fixture.database.tasks);

    const created = await request(app, "/v1/tasks", {
      method: "POST",
      body: JSON.stringify(createTaskInput("Stage 7 task route", { status: "waiting" })),
    });
    const listed = await request(app, "/v1/tasks");

    assert.equal(created.status, 201);
    const createdTask = await created.json() as BoardTask;
    assert.equal(createdTask.title, "Stage 7 task route");
    assert.equal(createdTask.status, "waiting");
    assert.deepEqual(await listed.json(), [createdTask]);
  } finally {
    fixture.close();
  }
});

test("control plane http app when backed by a file database, should persist task routes across reopen", async () => {
  const fixture = TaskDatabaseFixture.createFile();
  try {
    const firstApp = createTaskApp(fixture.database.tasks);
    const created = await request(firstApp, "/v1/tasks", {
      method: "POST",
      body: JSON.stringify(createTaskInput("Persist through Control Plane")),
    });
    const task = await created.json() as BoardTask;
    await request(firstApp, `/v1/tasks/${task.id}/conversation-links`, {
      method: "POST",
      body: JSON.stringify(linkInput("device-a", "thread-persisted", "project-a")),
    });
    fixture.database.close();

    const reopened = openTaskDatabase(fixture.databasePath);
    try {
      const secondApp = createTaskApp(reopened.tasks);
      const listed = await request(secondApp, "/v1/tasks");
      const listedTasks = await listed.json() as BoardTask[];
      const listedTask = listedTasks[0];

      assert.deepEqual(listedTasks, [
        {
          id: task.id,
          title: "Persist through Control Plane",
          status: "in_progress",
          createdAt: task.createdAt,
          updatedAt: listedTask?.updatedAt ?? "",
          linkedConversations: [
            {
              deviceId: "device-a",
              conversationId: "thread-persisted",
              projectId: "project-a",
              linkedAt: listedTask?.linkedConversations[0]?.linkedAt ?? "",
            },
          ],
        },
      ] satisfies BoardTask[]);
    } finally {
      reopened.close();
    }
  } finally {
    fixture.remove();
  }
});

test("control plane http app when a conversation is linked twice, should return the same link without duplicating it", async () => {
  const fixture = TaskDatabaseFixture.createMemory();
  try {
    const app = createTaskApp(fixture.database.tasks);
    const task = await (await request(app, "/v1/tasks", {
      method: "POST",
      body: JSON.stringify(createTaskInput("Idempotent link")),
    })).json() as BoardTask;

    const first = await request(app, `/v1/tasks/${task.id}/conversation-links`, {
      method: "POST",
      body: JSON.stringify(linkInput("device-a", "thread-1", "project-a")),
    });
    const second = await request(app, `/v1/tasks/${task.id}/conversation-links`, {
      method: "POST",
      body: JSON.stringify(linkInput("device-a", "thread-1", "project-a")),
    });
    const listed = await (await request(app, "/v1/tasks")).json() as BoardTask[];

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal((await first.json() as TaskConversationLink).projectId, "project-a");
    assert.equal((await second.json() as TaskConversationLink).projectId, "project-a");
    assert.deepEqual(listed[0]?.linkedConversations.map(({ deviceId, conversationId, projectId }) => ({ deviceId, conversationId, projectId })), [
      { deviceId: "device-a", conversationId: "thread-1", projectId: "project-a" },
    ]);
  } finally {
    fixture.close();
  }
});

test("control plane http app when same conversation id is linked from two devices, should keep device-scoped links", async () => {
  const fixture = TaskDatabaseFixture.createMemory();
  try {
    const app = createTaskApp(fixture.database.tasks);
    const task = await (await request(app, "/v1/tasks", {
      method: "POST",
      body: JSON.stringify(createTaskInput("Device scoped link")),
    })).json() as BoardTask;

    await request(app, `/v1/tasks/${task.id}/conversation-links`, {
      method: "POST",
      body: JSON.stringify(linkInput("device-a", "thread-shared", "project-a")),
    });
    await request(app, `/v1/tasks/${task.id}/conversation-links`, {
      method: "POST",
      body: JSON.stringify(linkInput("device-b", "thread-shared", "project-b")),
    });

    const listed = await (await request(app, "/v1/tasks")).json() as BoardTask[];
    assert.deepEqual(listed[0]?.linkedConversations.map(({ deviceId, conversationId, projectId }) => ({ deviceId, conversationId, projectId })), [
      { deviceId: "device-a", conversationId: "thread-shared", projectId: "project-a" },
      { deviceId: "device-b", conversationId: "thread-shared", projectId: "project-b" },
    ]);
  } finally {
    fixture.close();
  }
});

test("control plane http app when a linked conversation is deleted, should remove only that device-scoped link", async () => {
  const fixture = TaskDatabaseFixture.createMemory();
  try {
    const app = createTaskApp(fixture.database.tasks);
    const task = await (await request(app, "/v1/tasks", {
      method: "POST",
      body: JSON.stringify(createTaskInput("Delete one link")),
    })).json() as BoardTask;
    await request(app, `/v1/tasks/${task.id}/conversation-links`, {
      method: "POST",
      body: JSON.stringify(linkInput("device-a", "thread-shared", "project-a")),
    });
    await request(app, `/v1/tasks/${task.id}/conversation-links`, {
      method: "POST",
      body: JSON.stringify(linkInput("device-b", "thread-shared", "project-b")),
    });

    const deleted = await request(app, `/v1/tasks/${task.id}/conversation-links/device-a/thread-shared`, { method: "DELETE" });
    const listed = await (await request(app, "/v1/tasks")).json() as BoardTask[];

    assert.equal(deleted.status, 204);
    assert.deepEqual(listed[0]?.linkedConversations.map(({ deviceId, conversationId, projectId }) => ({ deviceId, conversationId, projectId })), [
      { deviceId: "device-b", conversationId: "thread-shared", projectId: "project-b" },
    ]);
  } finally {
    fixture.close();
  }
});

test("control plane http app when a task is missing, should return a sanitized 404", async () => {
  const fixture = TaskDatabaseFixture.createMemory();
  try {
    const app = createTaskApp(fixture.database.tasks);

    const response = await request(app, "/v1/tasks/missing-task/conversation-links", {
      method: "POST",
      body: JSON.stringify(linkInput("device-a", "thread-1", "project-a")),
    });

    assert.equal(response.status, 404);
    assert.equal((await response.json() as { code: string }).code, "task_not_found");
  } finally {
    fixture.close();
  }
});

test("control plane http app when task repository fails, should not expose internal failure details", async () => {
  const sensitiveMarker = "REDACTED_INTERNAL_MARKER";
  const app = createTaskApp(new ThrowingTaskRepository(sensitiveMarker) as unknown as TaskRepository);

  const response = await request(app, "/v1/tasks");

  assert.equal(response.status, 500);
  const body = await response.text();
  assert.doesNotMatch(body, /REDACTED_INTERNAL_MARKER/);
  assert.doesNotMatch(body, /TaskRepository exploded/);
});

test("control plane http app when browser origin is unexpected, should return sanitized 403", async () => {
  const app = createApp();

  const response = await app.request("http://127.0.0.1/v1/devices", {
    headers: { authorization: "Bearer public-token", origin: "http://evil.example" },
  });

  assert.equal(response.status, 403);
  const body = await response.text();
  assert.doesNotMatch(body, /token-a|8788|8789/);
});

test("control plane http app when devices are listed, should isolate one unavailable worker", async () => {
  const client = new FakeWorkerClient({ unavailableDeviceIds: new Set(["device-b"]) });
  const app = createApp(client);

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
  const app = createApp(client);

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
  const app = createApp(new FakeWorkerClient({ upstreamDeviceId: "other-device" }));

  const response = await request(app, "/v1/conversations");

  assert.equal(response.status, 200);
  const conversations = await response.json() as CodexConversation[];
  assert.deepEqual(new Set(conversations.map((conversation) => conversation.deviceId)), new Set(["device-a", "device-b"]));
});

test("control plane http app when device scoped routes are used, should call selected upstream and normalize identity", async () => {
  const client = new FakeWorkerClient({ upstreamDeviceId: "other-device" });
  const app = createApp(client);

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
  const app = createApp(client);

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
  const app = createApp(client);

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
  const app = createApp(new FakeWorkerClient({ unavailableDeviceIds: new Set(["device-a"]) }));

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

function createApp(workerClient: WorkerUpstreamClient = new FakeWorkerClient()): ReturnType<typeof createControlPlaneHttpApp> {
  return createControlPlaneHttpApp({
    config,
    now: nowFixed,
    taskRepository: sharedTaskDatabase.tasks,
    workerClient,
  });
}

function createTaskApp(taskRepository: TaskRepository): ReturnType<typeof createControlPlaneHttpApp> {
  const params = {
    config,
    now: nowFixed,
    workerClient: new FakeWorkerClient(),
    taskRepository,
  };
  return createControlPlaneHttpApp(params);
}

class TaskDatabaseFixture {
  readonly temporaryDirectory: string | null;
  readonly databasePath: string;
  readonly database: TaskDatabase;

  private constructor(temporaryDirectory: string | null, databasePath: string, database: TaskDatabase) {
    this.temporaryDirectory = temporaryDirectory;
    this.databasePath = databasePath;
    this.database = database;
  }

  static createMemory(): TaskDatabaseFixture {
    return new TaskDatabaseFixture(null, ":memory:", openTaskDatabase(":memory:"));
  }

  static createFile(): TaskDatabaseFixture {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "codex-remote-control-plane-"));
    const databasePath = join(temporaryDirectory, "tasks.sqlite");
    return new TaskDatabaseFixture(temporaryDirectory, databasePath, openTaskDatabase(databasePath));
  }

  close(): void {
    this.database.close();
    this.remove();
  }

  remove(): void {
    if (this.temporaryDirectory !== null) {
      rmSync(this.temporaryDirectory, { force: true, recursive: true });
    }
  }
}

class ThrowingTaskRepository {
  private readonly sensitiveMarker: string;

  constructor(sensitiveMarker: string) {
    this.sensitiveMarker = sensitiveMarker;
  }

  listTasks(): BoardTask[] {
    throw new Error(`TaskRepository exploded ${this.sensitiveMarker}`);
  }

  createTask(): BoardTask {
    return this.listTasks()[0] as BoardTask;
  }

  linkConversation(): BoardTask {
    return this.listTasks()[0] as BoardTask;
  }

  unlinkConversation(): BoardTask {
    return this.listTasks()[0] as BoardTask;
  }
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

function createTaskInput(title: string, options: { status?: BoardTask["status"] } = {}) {
  return {
    title,
    clientRequestId: `request-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`,
    ...(options.status === undefined ? {} : { status: options.status }),
  };
}

function linkInput(deviceId: string, conversationId: string, projectId: string) {
  return { deviceId, conversationId, projectId };
}
