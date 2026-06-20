import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openTaskDatabase, type TaskDatabase, type TaskRepository } from "@codex-remote/db";
import type {
  ApprovalDecisionInput,
  BoardTask,
  CodexConversation,
  ConversationLifecycleInput,
  ConversationTimeline,
  FollowUpInput,
  InterruptTurnInput,
  OpenConversationResult,
  RemoteProject,
  RenameConversationInput,
  StartConversationInput,
  SteerTurnInput,
  TaskConversationLink,
  WorkerCapabilities,
  WorkerHealth,
  WorkerProbeSummary,
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
const remoteProjectProjectorFields = ["id", "name", "deviceId", "path", "branch", "hasChanges", "pinned", "expanded"] as const;

test.after(() => {
  sharedTaskDatabase.close();
});

test("control plane http app when project fields are projected, should match RemoteProject schema keys", () => {
  const source = readFileSync(new URL("../../../../packages/api-contract/openapi.yaml", import.meta.url), "utf8");
  const schema = source.match(/^    RemoteProject:\n(?<body>(?: {6}.+\n| {8}.+\n| {10}.+\n| {12}.+\n)+)/m);
  assert.ok(schema?.groups?.body);

  const keys = [...schema.groups.body.matchAll(/^        ([A-Za-z][A-Za-z0-9]*):$/gm)].map((match) => match[1]);

  assert.deepEqual(keys, [...remoteProjectProjectorFields]);
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
      body: JSON.stringify(linkInput("device-a", "thread-shared", "local-project")),
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
              conversationId: "thread-shared",
              projectId: "local-project",
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
      body: JSON.stringify(linkInput("device-a", "thread-device-a", "local-project")),
    });
    const second = await request(app, `/v1/tasks/${task.id}/conversation-links`, {
      method: "POST",
      body: JSON.stringify(linkInput("device-a", "thread-device-a", "local-project")),
    });
    const listed = await (await request(app, "/v1/tasks")).json() as BoardTask[];

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal((await first.json() as TaskConversationLink).projectId, "local-project");
    assert.equal((await second.json() as TaskConversationLink).projectId, "local-project");
    assert.deepEqual(listed[0]?.linkedConversations.map(({ deviceId, conversationId, projectId }) => ({ deviceId, conversationId, projectId })), [
      { deviceId: "device-a", conversationId: "thread-device-a", projectId: "local-project" },
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
      body: JSON.stringify(linkInput("device-a", "thread-shared", "local-project")),
    });
    await request(app, `/v1/tasks/${task.id}/conversation-links`, {
      method: "POST",
      body: JSON.stringify(linkInput("device-b", "thread-shared", "local-project")),
    });

    const listed = await (await request(app, "/v1/tasks")).json() as BoardTask[];
    assert.deepEqual(listed[0]?.linkedConversations.map(({ deviceId, conversationId, projectId }) => ({ deviceId, conversationId, projectId })), [
      { deviceId: "device-a", conversationId: "thread-shared", projectId: "local-project" },
      { deviceId: "device-b", conversationId: "thread-shared", projectId: "local-project" },
    ]);
  } finally {
    fixture.close();
  }
});

test("control plane http app when conversation link uses unknown resources, should reject without persisting", async () => {
  const fixture = TaskDatabaseFixture.createMemory();
  try {
    const app = createTaskApp(fixture.database.tasks);
    const task = await (await request(app, "/v1/tasks", {
      method: "POST",
      body: JSON.stringify(createTaskInput("Reject invalid link")),
    })).json() as BoardTask;

    const unknownDevice = await request(app, `/v1/tasks/${task.id}/conversation-links`, {
      method: "POST",
      body: JSON.stringify(linkInput("missing-device", "thread-shared", "local-project")),
    });
    const unknownProject = await request(app, `/v1/tasks/${task.id}/conversation-links`, {
      method: "POST",
      body: JSON.stringify(linkInput("device-a", "thread-shared", "missing-project")),
    });
    const unknownConversation = await request(app, `/v1/tasks/${task.id}/conversation-links`, {
      method: "POST",
      body: JSON.stringify(linkInput("device-a", "missing-thread", "local-project")),
    });
    const listed = await (await request(app, "/v1/tasks")).json() as BoardTask[];

    assert.equal(unknownDevice.status, 404);
    assert.equal(unknownProject.status, 404);
    assert.equal(unknownConversation.status, 404);
    assert.deepEqual(listed[0]?.linkedConversations, []);
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
      body: JSON.stringify(linkInput("device-a", "thread-shared", "local-project")),
    });
    await request(app, `/v1/tasks/${task.id}/conversation-links`, {
      method: "POST",
      body: JSON.stringify(linkInput("device-b", "thread-shared", "local-project")),
    });

    const deleted = await request(app, `/v1/tasks/${task.id}/conversation-links/device-a/thread-shared`, { method: "DELETE" });
    const listed = await (await request(app, "/v1/tasks")).json() as BoardTask[];

    assert.equal(deleted.status, 204);
    assert.deepEqual(listed[0]?.linkedConversations.map(({ deviceId, conversationId, projectId }) => ({ deviceId, conversationId, projectId })), [
      { deviceId: "device-b", conversationId: "thread-shared", projectId: "local-project" },
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
      body: JSON.stringify(linkInput("device-a", "thread-shared", "local-project")),
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

test("control plane http app when conversations are listed and one worker fails, should keep successful worker conversations", async () => {
  const client = new FakeWorkerClient({ unavailableDeviceIds: new Set(["device-b"]) });
  const app = createApp(client);

  const response = await request(app, "/v1/conversations");

  assert.equal(response.status, 200);
  const conversations = await response.json() as CodexConversation[];
  assert.deepEqual(new Set(conversations.map((conversation) => conversation.deviceId)), new Set(["device-a"]));
  assert.deepEqual(client.calls.map((call) => `${call.method}:${call.deviceId}`), [
    "listConversations:device-a",
    "listConversations:device-b",
  ]);
});

test("control plane http app when conversations are listed and all configured workers fail, should return sanitized dependency error", async () => {
  const client = new FakeWorkerClient({ unavailableDeviceIds: new Set(["device-a", "device-b"]) });
  const app = createApp(client);

  const response = await request(app, "/v1/conversations");
  const body = await response.text();

  assert.equal(response.status, 424);
  assert.match(body, /device_unavailable/);
  assert.doesNotMatch(body, /token-a|token-b|8788|8789|other-device|upstream unavailable/);
  assert.deepEqual(client.calls.map((call) => `${call.method}:${call.deviceId}`), [
    "listConversations:device-a",
    "listConversations:device-b",
  ]);
});

test("control plane http app when projects are listed, should aggregate and normalize configured device ids", async () => {
  const app = createApp(new FakeWorkerClient({ upstreamDeviceId: "other-device" }));

  const response = await request(app, "/v1/projects");

  assert.equal(response.status, 200);
  const projects = await response.json() as RemoteProject[];
  assert.deepEqual(projects.map((project) => ({ id: project.id, deviceId: project.deviceId, path: project.path })), [
    { id: "local-project", deviceId: "device-a", path: "" },
    { id: "local-project", deviceId: "device-b", path: "" },
  ]);
});

test("control plane http app when device projects are listed, should proxy selected device only", async () => {
  const client = new FakeWorkerClient({ upstreamDeviceId: "other-device" });
  const app = createApp(client);

  const response = await request(app, "/v1/devices/device-a/projects");

  assert.equal(response.status, 200);
  const projects = await response.json() as RemoteProject[];
  assert.deepEqual(projects.map((project) => ({ id: project.id, deviceId: project.deviceId, path: project.path })), [
    { id: "local-project", deviceId: "device-a", path: "" },
  ]);
  assert.deepEqual(client.calls.map((call) => `${call.method}:${call.deviceId}`), ["listProjects:device-a"]);
});

test("control plane http app when required project upstream fails, should return error instead of empty list", async () => {
  const app = createApp(new FakeWorkerClient({ unavailableDeviceIds: new Set(["device-a"]) }));

  const response = await request(app, "/v1/projects");
  const body = await response.text();

  assert.equal(response.status, 424);
  assert.doesNotMatch(body, /token-a|token-b|8788|8789|other-device/);
});

test("control plane http app when device scoped routes are used, should call selected upstream and normalize identity", async () => {
  const client = new FakeWorkerClient({ upstreamDeviceId: "other-device" });
  const app = createApp(client);

  const health = await (await request(app, "/v1/devices/device-a/worker/health")).json() as WorkerHealth;
  const capabilities = await (await request(app, "/v1/devices/device-a/worker/capabilities")).json() as WorkerCapabilities;
  const probe = await (await request(app, "/v1/devices/device-a/worker/probe")).json() as WorkerProbeSummary;
  const timeline = await (await request(app, "/v1/devices/device-a/conversations/thread-a/timeline")).json() as ConversationTimeline;

  assert.equal(health.deviceId, "device-a");
  assert.equal(capabilities.deviceId, "device-a");
  assert.equal(probe.deviceId, "device-a");
  assert.equal(probe.checks.find((check) => check.name === "thread/list")?.exactCwdListProven, true);
  assert.equal(timeline.deviceId, "device-a");
  assert.deepEqual(client.calls.map((call) => call.deviceId), ["device-a", "device-a", "device-a", "device-a"]);
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

test("control plane http app when lifecycle routes are used, should proxy selected device and normalize returned identity", async () => {
  const client = new FakeWorkerClient({ upstreamDeviceId: "other-device" });
  const app = createApp(client);

  const opened = await request(app, "/v1/devices/device-b/conversations/thread-b/open", {
    method: "POST",
    body: JSON.stringify({ clientRequestId: "open-1" }),
  });
  await request(app, "/v1/devices/device-b/conversations/thread-b/archive", {
    method: "POST",
    body: JSON.stringify({ clientRequestId: "archive-1" }),
  });
  await request(app, "/v1/devices/device-b/conversations/thread-b/unarchive", {
    method: "POST",
    body: JSON.stringify({ clientRequestId: "restore-1" }),
  });
  await request(app, "/v1/devices/device-b/conversations/thread-b", {
    method: "PATCH",
    body: JSON.stringify({ title: "Renamed", clientRequestId: "rename-1" }),
  });
  const options = await app.request("http://127.0.0.1/v1/devices/device-b/conversations/thread-b", {
    method: "OPTIONS",
    headers: { origin: "http://127.0.0.1:5173" },
  });

  assert.equal(opened.status, 200);
  const body = await opened.json() as OpenConversationResult;
  assert.equal(body.conversation.deviceId, "device-b");
  assert.equal(body.timeline.deviceId, "device-b");
  assert.deepEqual(body.timeline.events?.map((event) => event.deviceId), ["device-b"]);
  assert.deepEqual(client.calls.map((call) => `${call.method}:${call.deviceId}`), [
    "openConversation:device-b",
    "archiveConversation:device-b",
    "unarchiveConversation:device-b",
    "renameConversation:device-b",
  ]);
  assert.match(options.headers.get("Access-Control-Allow-Methods") ?? "", /PATCH/);
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

  async getProbeSummary(device: ConfiguredWorkerDevice): Promise<WorkerProbeSummary> {
    this.record(device, "getProbeSummary");
    this.throwIfUnavailable(device);
    return {
      schemaVersion: 1,
      startedAt: "2026-06-20T00:00:01.000Z",
      completedAt: "2026-06-20T00:00:02.000Z",
      ok: true,
      mode: "readOnly",
      deviceId: this.upstreamDeviceId ?? device.id,
      codexVersion: "fake",
      appServer: { transport: "loopbackWebSocket", startedByWorker: false, readyz: true },
      checks: [
        {
          name: "thread/list",
          ok: true,
          durationMs: 1,
          exactCwdListProven: true,
          completedUntilNextCursorNull: true,
          pageCount: 1,
          cursorCount: 0,
          count: 1,
        },
      ],
    };
  }

  async listConversations(device: ConfiguredWorkerDevice): Promise<CodexConversation[]> {
    this.record(device, "listConversations");
    this.throwIfUnavailable(device);
    return [
      createConversation(this.upstreamDeviceId ?? device.id, `thread-${device.id}`),
      createConversation(this.upstreamDeviceId ?? device.id, "thread-shared"),
    ];
  }

  async listProjects(device: ConfiguredWorkerDevice): Promise<RemoteProject[]> {
    this.record(device, "listProjects");
    this.throwIfUnavailable(device);
    return [
      {
        id: "local-project",
        name: `Project ${device.id}`,
        deviceId: this.upstreamDeviceId ?? device.id,
        path: "",
        branch: "unknown",
        hasChanges: false,
        pinned: false,
        expanded: true,
      },
    ];
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

  async openConversation(device: ConfiguredWorkerDevice, conversationId: string, _input: ConversationLifecycleInput): Promise<OpenConversationResult> {
    this.record(device, "openConversation");
    return createLifecycleResult(this.upstreamDeviceId ?? device.id, conversationId, { archived: false, loaded: true, live: true });
  }

  async archiveConversation(device: ConfiguredWorkerDevice, conversationId: string, _input: ConversationLifecycleInput): Promise<OpenConversationResult> {
    this.record(device, "archiveConversation");
    return createLifecycleResult(this.upstreamDeviceId ?? device.id, conversationId, { archived: true, loaded: false, live: false });
  }

  async unarchiveConversation(device: ConfiguredWorkerDevice, conversationId: string, _input: ConversationLifecycleInput): Promise<OpenConversationResult> {
    this.record(device, "unarchiveConversation");
    return createLifecycleResult(this.upstreamDeviceId ?? device.id, conversationId, { archived: false, loaded: false, live: false });
  }

  async renameConversation(device: ConfiguredWorkerDevice, conversationId: string, _input: RenameConversationInput): Promise<OpenConversationResult> {
    this.record(device, "renameConversation");
    return createLifecycleResult(this.upstreamDeviceId ?? device.id, conversationId, { archived: false, loaded: true, live: true, title: "Renamed" });
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
    projectId: "local-project",
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

function createLifecycleResult(
  deviceId: string,
  conversationId: string,
  state: { archived: boolean; live: boolean; loaded: boolean; title?: string },
): OpenConversationResult {
  return {
    conversation: {
      ...createConversation(deviceId, conversationId),
      archived: state.archived,
      live: state.live,
      loaded: state.loaded,
      title: state.title ?? conversationId,
    },
    timeline: {
      deviceId,
      conversationId,
      projectId: "local-project",
      readStartedAt: "2026-06-20T00:00:00.000Z",
      readCompletedAt: "2026-06-20T00:00:01.000Z",
      snapshotRevision: `${conversationId}:lifecycle`,
      runtimeStatus: state.live ? "running" : "idle",
      latestTurnStatus: "unknown",
      archived: state.archived,
      loaded: state.loaded,
      live: state.live,
      turns: [],
      events: [
        {
          eventId: "event-upstream-device",
          seq: 1,
          deviceId: deviceId,
          conversationId,
          kind: "thread_opened",
          createdAt: "2026-06-20T00:00:01.000Z",
          source: "live",
        },
      ],
    },
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
