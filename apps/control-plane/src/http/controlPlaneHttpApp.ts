import { randomUUID } from "node:crypto";

import { Hono, type Context } from "hono";
import type { TaskRepository } from "@codex-remote/db";
import type {
  ApprovalDecisionInput,
  BoardTask,
  CodexConversation,
  ConversationTimeline,
  CreateTaskInput,
  FollowUpInput,
  InterruptTurnInput,
  LinkTaskConversationInput,
  StartConversationInput,
  RemoteProject,
  SteerTurnInput,
  TaskConversationLink,
  TaskStatus,
  WorkerCapabilities,
  WorkerHealth,
  WorkerProbeSummary,
} from "@codex-remote/api-contract";

import type { ControlPlaneConfig, ConfiguredWorkerDevice } from "../config/controlPlaneConfig.ts";
import { createDeviceRegistry } from "../registry/deviceRegistry.ts";
import { projectDevice } from "../registry/deviceRegistry.ts";
import type { WorkerUpstreamClient } from "../client/workerClient.ts";
import { ControlPlaneHttpError, mapMissingTaskLink, mapTaskError, mapUnknownError, toErrorEnvelope } from "./errors.ts";

type ControlPlaneHonoEnv = {
  Variables: {
    requestId: string;
  };
};

type ErrorStatus = 400 | 401 | 403 | 404 | 408 | 409 | 424 | 500;
const corsAllowHeaders = "Authorization, Content-Type, X-Request-ID";
const corsAllowMethods = "GET, POST, DELETE, OPTIONS";
const clientRequestIdMaxLength = 128;
const messageMaxLength = 20_000;
const taskTitleMaxLength = 200;

export function createControlPlaneHttpApp(params: {
  config: ControlPlaneConfig;
  now: () => string;
  taskRepository: TaskRepository;
  workerClient: WorkerUpstreamClient;
}): Hono<ControlPlaneHonoEnv> {
  const app = new Hono<ControlPlaneHonoEnv>();
  const registry = createDeviceRegistry(params.config.devices);

  app.onError((error, c) => {
    const requestId = c.get("requestId") || randomUUID();
    const envelope = toErrorEnvelope(error, requestId);
    const status = error instanceof ControlPlaneHttpError ? toErrorStatus(error.status) : 500;
    return c.json(envelope, status);
  });

  app.use("*", async (c, next) => {
    c.set("requestId", c.req.header("x-request-id") ?? randomUUID());

    const origin = c.req.header("origin");
    if (!isOriginAllowed(origin, params.config.allowedOrigins)) {
      throw new ControlPlaneHttpError(403, "origin_forbidden", "Origin is not allowed.", { retryable: false });
    }

    if (origin) {
      setCorsHeaders(c, origin);
    }

    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }

    if (!isBearerTokenAuthorized(c.req.header("authorization"), params.config.publicToken)) {
      throw new ControlPlaneHttpError(401, "unauthorized", "Missing or invalid bearer token.", { retryable: false });
    }

    await next();
  });

  app.get("/v1/control-plane/health", async (c) => {
    const checkedAt = params.now();
    const results = await Promise.all(params.config.devices.map((device) => readDeviceHealth(params.workerClient, device)));
    const connectedDeviceCount = results.filter((health) => health?.status === "connected").length;
    return c.json({
      status: connectedDeviceCount === params.config.devices.length ? "ok" : "degraded",
      checkedAt,
      deviceCount: params.config.devices.length,
      connectedDeviceCount,
    });
  });

  app.get("/v1/devices", async (c) => {
    const checkedAt = params.now();
    const devices = await Promise.all(params.config.devices.map(async (device) => {
      const health = await readDeviceHealth(params.workerClient, device);
      const conversations = health ? await readDeviceConversations(params.workerClient, device) : [];
      return projectDevice({
        configuredDevice: device,
        checkedAt,
        health,
        currentProject: conversations[0]?.projectName ?? "",
      });
    }));
    return c.json(devices);
  });

  app.get("/v1/conversations", async (c) => {
    const results = await Promise.all(params.config.devices.map((device) => readDeviceConversationResult(params.workerClient, device)));
    const successfulResults = results.filter((result): result is { conversations: CodexConversation[]; ok: true } => result.ok);
    if (successfulResults.length === 0) {
      throw new ControlPlaneHttpError(424, "device_unavailable", "Device is unavailable.", {
        operation: "conversation/list",
        retryable: true,
      });
    }

    const conversations = successfulResults
      .flatMap((result) => result.conversations)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return c.json(conversations);
  });

  app.get("/v1/projects", async (c) => {
    const projects = (await Promise.all(
      params.config.devices.map((device) => readDeviceProjects(params.workerClient, device)),
    )).flat();
    return c.json(projects);
  });

  app.get("/v1/tasks", (c) => c.json(runTaskOperation(params.taskRepository, "task/list", (repository) => repository.listTasks())));

  app.post("/v1/tasks", async (c) => {
    const input = await readCreateTaskInputBody(c);
    const task = runTaskOperation(params.taskRepository, "task/create", (repository) => repository.createTask(input));
    return c.json(task, 201);
  });

  app.post("/v1/tasks/:taskId/conversation-links", async (c) => {
    const taskId = c.req.param("taskId");
    const input = await readLinkTaskConversationInputBody(c);
    await assertLinkTargetExists(registry, params.workerClient, input);
    const task = runTaskOperation(params.taskRepository, "task/link", (repository) => repository.linkConversation(taskId, input));
    return c.json(requireLinkedConversation(task, input), 201);
  });

  app.delete("/v1/tasks/:taskId/conversation-links/:deviceId/:conversationId", (c) => {
    const taskId = c.req.param("taskId");
    const deviceId = c.req.param("deviceId");
    const conversationId = c.req.param("conversationId");
    runTaskOperation(params.taskRepository, "task/unlink", (repository) => repository.unlinkConversation(taskId, deviceId, conversationId));
    return c.body(null, 204);
  });

  app.get("/v1/devices/:deviceId/worker/health", async (c) => {
    const device = requireDevice(registry, c.req.param("deviceId"));
    return c.json(normalizeWorkerHealth(device, await runForDevice(device, "worker/health", () => params.workerClient.getHealth(device))));
  });

  app.get("/v1/devices/:deviceId/worker/capabilities", async (c) => {
    const device = requireDevice(registry, c.req.param("deviceId"));
    return c.json(normalizeWorkerCapabilities(device, await runForDevice(device, "worker/capabilities", () => params.workerClient.getCapabilities(device))));
  });

  app.get("/v1/devices/:deviceId/worker/probe", async (c) => {
    const device = requireDevice(registry, c.req.param("deviceId"));
    return c.json(normalizeWorkerProbeSummary(device, await runForDevice(device, "worker/probe", () => params.workerClient.getProbeSummary(device))));
  });

  app.get("/v1/devices/:deviceId/projects", async (c) => {
    const device = requireDevice(registry, c.req.param("deviceId"));
    return c.json(await runForDevice(device, "project/list", () => readDeviceProjects(params.workerClient, device)));
  });

  app.post("/v1/devices/:deviceId/conversations", async (c) => {
    const device = requireDevice(registry, c.req.param("deviceId"));
    const input = await readStartInputBody(c);
    return c.json(await runForDevice(device, "conversation/start", () => params.workerClient.startConversation(device, input)), 202);
  });

  app.get("/v1/devices/:deviceId/conversations/:conversationId/timeline", async (c) => {
    const device = requireDevice(registry, c.req.param("deviceId"));
    const timeline = await runForDevice(device, "conversation/timeline", () =>
      params.workerClient.readTimeline(device, c.req.param("conversationId")),
    );
    return c.json(normalizeConversationTimeline(device, timeline));
  });

  app.post("/v1/devices/:deviceId/conversations/:conversationId/follow-up", async (c) => {
    const device = requireDevice(registry, c.req.param("deviceId"));
    const input = await readFollowUpInputBody(c);
    return c.json(
      await runForDevice(device, "conversation/follow-up", () =>
        params.workerClient.followUp(device, c.req.param("conversationId"), input),
      ),
      202,
    );
  });

  app.post("/v1/devices/:deviceId/conversations/:conversationId/turns/:turnId/interrupt", async (c) => {
    const device = requireDevice(registry, c.req.param("deviceId"));
    const input = await readInterruptInputBody(c);
    return c.json(
      await runForDevice(device, "turn/interrupt", () =>
        params.workerClient.interrupt(device, c.req.param("conversationId"), c.req.param("turnId"), input),
      ),
      202,
    );
  });

  app.post("/v1/devices/:deviceId/conversations/:conversationId/turns/:turnId/steer", async (c) => {
    const device = requireDevice(registry, c.req.param("deviceId"));
    const input = await readSteerInputBody(c);
    return c.json(
      await runForDevice(device, "turn/steer", () =>
        params.workerClient.steer(device, c.req.param("conversationId"), c.req.param("turnId"), input),
      ),
      202,
    );
  });

  app.get("/v1/devices/:deviceId/conversations/:conversationId/approvals", async (c) => {
    const device = requireDevice(registry, c.req.param("deviceId"));
    return c.json(await runForDevice(device, "approval/list", () => params.workerClient.listApprovals(device, c.req.param("conversationId"))));
  });

  app.post("/v1/devices/:deviceId/conversations/:conversationId/approvals/:approvalRequestId/decision", async (c) => {
    const device = requireDevice(registry, c.req.param("deviceId"));
    const input = await readApprovalDecisionInputBody(c);
    return c.json(
      await runForDevice(device, "approval/decision", () =>
        params.workerClient.decideApproval(
          device,
          c.req.param("conversationId"),
          c.req.param("approvalRequestId"),
          input,
        ),
      ),
      202,
    );
  });

  return app;
}

async function readDeviceHealth(client: WorkerUpstreamClient, device: ConfiguredWorkerDevice): Promise<WorkerHealth | null> {
  try {
    return normalizeWorkerHealth(device, await client.getHealth(device));
  } catch {
    return null;
  }
}

async function readDeviceConversations(client: WorkerUpstreamClient, device: ConfiguredWorkerDevice): Promise<CodexConversation[]> {
  try {
    return (await client.listConversations(device)).map((conversation) => normalizeConversation(device, conversation));
  } catch {
    return [];
  }
}

async function readDeviceConversationResult(
  client: WorkerUpstreamClient,
  device: ConfiguredWorkerDevice,
): Promise<{ conversations: CodexConversation[]; ok: true } | { ok: false }> {
  try {
    return {
      conversations: (await client.listConversations(device)).map((conversation) => normalizeConversation(device, conversation)),
      ok: true,
    };
  } catch {
    return { ok: false };
  }
}

async function readDeviceProjects(client: WorkerUpstreamClient, device: ConfiguredWorkerDevice): Promise<RemoteProject[]> {
  try {
    return (await client.listProjects(device)).map((project) => normalizeProject(device, project));
  } catch (error) {
    throw mapUnknownError(error, "project/list", device.id);
  }
}

async function assertLinkTargetExists(
  registry: ReturnType<typeof createDeviceRegistry>,
  client: WorkerUpstreamClient,
  input: LinkTaskConversationInput,
): Promise<void> {
  const device = requireDevice(registry, input.deviceId);
  const projects = await runForDevice(device, "task/link-project", () => readDeviceProjects(client, device));
  if (!projects.some((project) => project.id === input.projectId)) {
    throw new ControlPlaneHttpError(404, "project_not_found", "Project was not found.", {
      operation: "task/link",
      retryable: false,
    });
  }

  const conversations = await runForDevice(device, "task/link-conversation", () => readDeviceConversations(client, device));
  const conversation = conversations.find((candidate) => candidate.id === input.conversationId);
  if (!conversation || (conversation.projectId !== undefined && conversation.projectId !== input.projectId)) {
    throw new ControlPlaneHttpError(404, "conversation_not_found", "Conversation was not found.", {
      operation: "task/link",
      retryable: false,
    });
  }
}

function requireDevice(registry: ReturnType<typeof createDeviceRegistry>, deviceId: string): ConfiguredWorkerDevice {
  try {
    return registry.require(deviceId);
  } catch (error) {
    throw mapUnknownError(error, "device/resolve", deviceId);
  }
}

async function runForDevice<T>(device: ConfiguredWorkerDevice, operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw mapUnknownError(error, operation, device.id);
  }
}

function normalizeWorkerHealth(device: ConfiguredWorkerDevice, health: WorkerHealth): WorkerHealth {
  return { ...health, deviceId: device.id };
}

function normalizeWorkerCapabilities(device: ConfiguredWorkerDevice, capabilities: WorkerCapabilities): WorkerCapabilities {
  return { ...capabilities, deviceId: device.id };
}

function normalizeWorkerProbeSummary(device: ConfiguredWorkerDevice, summary: WorkerProbeSummary): WorkerProbeSummary {
  return { ...summary, deviceId: device.id };
}

function normalizeConversation(device: ConfiguredWorkerDevice, conversation: CodexConversation): CodexConversation {
  return { ...conversation, deviceId: device.id };
}

function normalizeProject(device: ConfiguredWorkerDevice, project: RemoteProject): RemoteProject {
  return { ...project, deviceId: device.id };
}

function normalizeConversationTimeline(device: ConfiguredWorkerDevice, timeline: ConversationTimeline): ConversationTimeline {
  return { ...timeline, deviceId: device.id };
}

async function readStartInputBody(c: Context<ControlPlaneHonoEnv>): Promise<StartConversationInput> {
  const body = await readBody(c);
  assertKnownFields(body, ["projectId", "message", "clientRequestId"]);
  return {
    projectId: getRequiredStringField(body, "projectId"),
    message: getRequiredStringField(body, "message", messageMaxLength),
    clientRequestId: getRequiredStringField(body, "clientRequestId", clientRequestIdMaxLength),
  };
}

async function readFollowUpInputBody(c: Context<ControlPlaneHonoEnv>): Promise<FollowUpInput> {
  const body = await readBody(c);
  assertKnownFields(body, ["message", "clientRequestId", "expectedConversationId"]);
  const expectedConversationId = getOptionalStringField(body, "expectedConversationId");
  return {
    message: getRequiredStringField(body, "message", messageMaxLength),
    clientRequestId: getRequiredStringField(body, "clientRequestId", clientRequestIdMaxLength),
    ...(expectedConversationId === undefined ? {} : { expectedConversationId }),
  };
}

async function readInterruptInputBody(c: Context<ControlPlaneHonoEnv>): Promise<InterruptTurnInput> {
  const body = await readBody(c);
  assertKnownFields(body, ["clientRequestId", "expectedTurnId"]);
  return {
    clientRequestId: getRequiredStringField(body, "clientRequestId", clientRequestIdMaxLength),
    expectedTurnId: getRequiredStringField(body, "expectedTurnId"),
  };
}

async function readSteerInputBody(c: Context<ControlPlaneHonoEnv>): Promise<SteerTurnInput> {
  const body = await readBody(c);
  assertKnownFields(body, ["message", "clientRequestId", "expectedTurnId"]);
  return {
    message: getRequiredStringField(body, "message", messageMaxLength),
    clientRequestId: getRequiredStringField(body, "clientRequestId", clientRequestIdMaxLength),
    expectedTurnId: getRequiredStringField(body, "expectedTurnId"),
  };
}

async function readApprovalDecisionInputBody(c: Context<ControlPlaneHonoEnv>): Promise<ApprovalDecisionInput> {
  const body = await readBody(c);
  assertKnownFields(body, ["decision", "clientRequestId", "expectedConversationId", "expectedTurnId", "expectedApprovalRequestId"]);
  return {
    decision: getApprovalDecisionField(body, "decision"),
    clientRequestId: getRequiredStringField(body, "clientRequestId", clientRequestIdMaxLength),
    expectedConversationId: getRequiredStringField(body, "expectedConversationId"),
    expectedTurnId: getRequiredStringField(body, "expectedTurnId"),
    expectedApprovalRequestId: getRequiredStringField(body, "expectedApprovalRequestId"),
  };
}

async function readCreateTaskInputBody(c: Context<ControlPlaneHonoEnv>): Promise<CreateTaskInput> {
  const body = await readBody(c);
  assertKnownFields(body, ["title", "clientRequestId", "status"]);
  const status = getOptionalTaskStatusField(body, "status");
  return {
    title: getRequiredStringField(body, "title", taskTitleMaxLength),
    clientRequestId: getRequiredStringField(body, "clientRequestId", clientRequestIdMaxLength),
    ...(status === undefined ? {} : { status }),
  };
}

async function readLinkTaskConversationInputBody(c: Context<ControlPlaneHonoEnv>): Promise<LinkTaskConversationInput> {
  const body = await readBody(c);
  assertKnownFields(body, ["deviceId", "conversationId", "projectId"]);
  return {
    deviceId: getRequiredStringField(body, "deviceId"),
    conversationId: getRequiredStringField(body, "conversationId"),
    projectId: getRequiredStringField(body, "projectId"),
  };
}

async function readBody(c: Context<ControlPlaneHonoEnv>): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ControlPlaneHttpError(400, "invalid_request", "Request validation failed.", { field: "body", retryable: false });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ControlPlaneHttpError(400, "invalid_request", "Request validation failed.", { field: "body", retryable: false });
  }

  return body as Record<string, unknown>;
}

function assertKnownFields(body: Record<string, unknown>, allowedFields: readonly string[]): void {
  const allowed = new Set(allowedFields);
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    throw new ControlPlaneHttpError(400, "invalid_request", "Request validation failed.", { field: "body", retryable: false });
  }
}

function getRequiredStringField(body: Record<string, unknown>, field: string, maxLength?: number): string {
  const value = body[field];
  if (typeof value !== "string" || value.length < 1 || (maxLength !== undefined && value.length > maxLength)) {
    throw new ControlPlaneHttpError(400, "invalid_request", "Request validation failed.", { field, retryable: false });
  }
  return value;
}

function getOptionalStringField(body: Record<string, unknown>, field: string): string | undefined {
  if (!(field in body)) {
    return undefined;
  }
  return getRequiredStringField(body, field);
}

function getApprovalDecisionField(body: Record<string, unknown>, field: string): ApprovalDecisionInput["decision"] {
  const value = getRequiredStringField(body, field);
  if (value !== "accept" && value !== "decline" && value !== "cancel") {
    throw new ControlPlaneHttpError(400, "invalid_request", "Request validation failed.", { field, retryable: false });
  }
  return value;
}

function getOptionalTaskStatusField(body: Record<string, unknown>, field: string): TaskStatus | undefined {
  if (!(field in body)) {
    return undefined;
  }

  const value = getRequiredStringField(body, field);
  if (value !== "in_progress" && value !== "waiting" && value !== "done") {
    throw new ControlPlaneHttpError(400, "invalid_request", "Request validation failed.", { field, retryable: false });
  }
  return value;
}

function runTaskOperation<T>(repository: TaskRepository, operation: string, run: (repository: TaskRepository) => T): T {
  try {
    return run(repository);
  } catch (error) {
    throw mapTaskError(error, operation);
  }
}

function requireLinkedConversation(task: BoardTask, input: LinkTaskConversationInput): TaskConversationLink {
  const link = task.linkedConversations.find((candidate) =>
    candidate.deviceId === input.deviceId && candidate.conversationId === input.conversationId
  );
  if (link === undefined) {
    throw mapMissingTaskLink("task/link");
  }
  return link;
}

function isOriginAllowed(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  return origin === undefined || allowedOrigins.includes(origin);
}

function isBearerTokenAuthorized(authorization: string | undefined, token: string): boolean {
  return authorization === `Bearer ${token}`;
}

function setCorsHeaders(c: Context<ControlPlaneHonoEnv>, origin: string): void {
  c.header("Access-Control-Allow-Origin", origin);
  c.header("Access-Control-Allow-Headers", corsAllowHeaders);
  c.header("Access-Control-Allow-Methods", corsAllowMethods);
  c.header("Vary", "Origin");
}

function toErrorStatus(status: number): ErrorStatus {
  switch (status) {
    case 400:
    case 401:
    case 403:
    case 404:
    case 408:
    case 409:
    case 424:
    case 500:
      return status;
    default:
      return 500;
  }
}
