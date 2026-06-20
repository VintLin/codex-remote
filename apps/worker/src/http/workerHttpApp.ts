import { randomUUID } from "node:crypto";

import { Hono, type Context } from "hono";
import type {
  ApprovalDecisionInput,
  ConversationLifecycleInput,
  FollowUpInput,
  InterruptTurnInput,
  RenameConversationInput,
  StartConversationInput,
  SteerTurnInput,
} from "@codex-remote/api-contract";

import { isBearerTokenAuthorized, isOriginAllowed } from "../security/workerSecurity.ts";
import { toErrorEnvelope, WorkerHttpError } from "./errors.ts";
import {
  getCapabilities,
  getHealth,
  listConversations,
  listProjects,
  readConversationTimeline,
  runProbe,
} from "./readOnlyHandlers.ts";
import {
  followUpConversation,
  startConversation,
} from "./writeHandlers.ts";
import {
  decideApproval,
  archiveConversation,
  interruptTurn,
  listApprovals,
  openConversation,
  renameConversation,
  steerTurn,
  unarchiveConversation,
  type WorkerControlHandlerContext,
} from "./controlHandlers.ts";

type WorkerHonoEnv = {
  Variables: {
    requestId: string;
  };
};

type ErrorStatus = 400 | 401 | 403 | 404 | 408 | 409 | 424 | 500;
const corsAllowHeaders = "Authorization, Content-Type, X-Request-ID";
const corsAllowMethods = "GET, POST, PATCH, OPTIONS";
const clientRequestIdMaxLength = 128;
const messageMaxLength = 20_000;

export function createWorkerHttpApp(context: WorkerControlHandlerContext): Hono<WorkerHonoEnv> {
  const app = new Hono<WorkerHonoEnv>();

  app.onError((error, c) => {
    const requestId = c.get("requestId") || randomUUID();
    const envelope = toErrorEnvelope(error, requestId);
    const status = error instanceof WorkerHttpError ? toErrorStatus(error.status) : 500;
    return c.json(envelope, status);
  });

  app.use("*", async (c, next) => {
    c.set("requestId", c.req.header("x-request-id") ?? randomUUID());

    const origin = c.req.header("origin");
    if (!isOriginAllowed(origin, context.config.allowedOrigins)) {
      throw new WorkerHttpError(403, "origin_forbidden", "Origin is not allowed.");
    }

    if (origin) {
      setCorsHeaders(c, origin);
    }

    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }

    if (!isBearerTokenAuthorized(c.req.header("authorization"), context.config.workerToken)) {
      throw new WorkerHttpError(401, "unauthorized", "Missing or invalid bearer token.");
    }

    await next();
  });

  app.get("/v1/worker/health", async (c) => c.json(await getHealth(context)));
  app.get("/v1/worker/capabilities", (c) => c.json(getCapabilities(context)));
  app.get("/v1/worker/probe", async (c) => c.json(await runProbe(context)));
  app.get("/v1/projects", (c) => c.json(listProjects(context)));
  app.get("/v1/conversations", async (c) => c.json(await listConversations(context)));
  app.post("/v1/conversations", async (c) => c.json(await startConversation(context, await readStartInput(c)), 202));
  app.patch("/v1/conversations/:conversationId", async (c) =>
    c.json(await renameConversation(context, c.req.param("conversationId"), await readRenameInput(c))),
  );
  app.post("/v1/conversations/:conversationId/open", async (c) =>
    c.json(await openConversation(context, c.req.param("conversationId"), await readLifecycleInput(c))),
  );
  app.post("/v1/conversations/:conversationId/archive", async (c) =>
    c.json(await archiveConversation(context, c.req.param("conversationId"), await readLifecycleInput(c))),
  );
  app.post("/v1/conversations/:conversationId/unarchive", async (c) =>
    c.json(await unarchiveConversation(context, c.req.param("conversationId"), await readLifecycleInput(c))),
  );
  app.get("/v1/conversations/:conversationId/timeline", async (c) =>
    c.json(await readConversationTimeline(context, c.req.param("conversationId"))),
  );
  app.post("/v1/conversations/:conversationId/follow-up", async (c) =>
    c.json(await followUpConversation(context, c.req.param("conversationId"), await readFollowUpInput(c)), 202),
  );
  app.post("/v1/conversations/:conversationId/turns/:turnId/interrupt", async (c) =>
    c.json(
      await interruptTurn(context, c.req.param("conversationId"), c.req.param("turnId"), await readInterruptInput(c)),
      202,
    ),
  );
  app.post("/v1/conversations/:conversationId/turns/:turnId/steer", async (c) =>
    c.json(await steerTurn(context, c.req.param("conversationId"), c.req.param("turnId"), await readSteerInput(c)), 202),
  );
  app.get("/v1/conversations/:conversationId/approvals", async (c) =>
    c.json(await listApprovals(context, c.req.param("conversationId"))),
  );
  app.post("/v1/conversations/:conversationId/approvals/:approvalRequestId/decision", async (c) =>
    c.json(
      await decideApproval(
        context,
        c.req.param("conversationId"),
        c.req.param("approvalRequestId"),
        await readApprovalDecisionInput(c),
      ),
      202,
    ),
  );

  return app;
}

async function readStartInput(c: Context<WorkerHonoEnv>): Promise<StartConversationInput> {
  const body = await readJsonObject(c);
  assertKnownFields(body, ["projectId", "message", "clientRequestId"]);

  return {
    projectId: getRequiredStringField(body, "projectId"),
    message: getRequiredStringField(body, "message", { maxLength: messageMaxLength }),
    clientRequestId: getRequiredStringField(body, "clientRequestId", { maxLength: clientRequestIdMaxLength }),
  };
}

async function readFollowUpInput(c: Context<WorkerHonoEnv>): Promise<FollowUpInput> {
  const body = await readJsonObject(c);
  assertKnownFields(body, ["message", "clientRequestId", "expectedConversationId"]);
  const expectedConversationId = getOptionalStringField(body, "expectedConversationId");

  return {
    message: getRequiredStringField(body, "message", { maxLength: messageMaxLength }),
    clientRequestId: getRequiredStringField(body, "clientRequestId", { maxLength: clientRequestIdMaxLength }),
    ...(expectedConversationId === undefined ? {} : { expectedConversationId }),
  };
}

async function readLifecycleInput(c: Context<WorkerHonoEnv>): Promise<ConversationLifecycleInput> {
  const body = await readJsonObject(c);
  assertKnownFields(body, ["clientRequestId"]);

  return {
    clientRequestId: getRequiredStringField(body, "clientRequestId", { maxLength: clientRequestIdMaxLength }),
  };
}

async function readRenameInput(c: Context<WorkerHonoEnv>): Promise<RenameConversationInput> {
  const body = await readJsonObject(c);
  assertKnownFields(body, ["title", "clientRequestId"]);

  return {
    title: getRequiredStringField(body, "title", { maxLength: 120 }),
    clientRequestId: getRequiredStringField(body, "clientRequestId", { maxLength: clientRequestIdMaxLength }),
  };
}

async function readInterruptInput(c: Context<WorkerHonoEnv>): Promise<InterruptTurnInput> {
  const body = await readJsonObject(c);
  assertKnownFields(body, ["clientRequestId", "expectedTurnId"]);

  return {
    clientRequestId: getRequiredStringField(body, "clientRequestId", { maxLength: clientRequestIdMaxLength }),
    expectedTurnId: getRequiredStringField(body, "expectedTurnId"),
  };
}

async function readSteerInput(c: Context<WorkerHonoEnv>): Promise<SteerTurnInput> {
  const body = await readJsonObject(c);
  assertKnownFields(body, ["message", "clientRequestId", "expectedTurnId"]);

  return {
    message: getRequiredStringField(body, "message", { maxLength: messageMaxLength }),
    clientRequestId: getRequiredStringField(body, "clientRequestId", { maxLength: clientRequestIdMaxLength }),
    expectedTurnId: getRequiredStringField(body, "expectedTurnId"),
  };
}

async function readApprovalDecisionInput(c: Context<WorkerHonoEnv>): Promise<ApprovalDecisionInput> {
  const body = await readJsonObject(c);
  assertKnownFields(body, [
    "decision",
    "clientRequestId",
    "expectedConversationId",
    "expectedTurnId",
    "expectedApprovalRequestId",
  ]);

  return {
    decision: getApprovalDecisionField(body, "decision"),
    clientRequestId: getRequiredStringField(body, "clientRequestId", { maxLength: clientRequestIdMaxLength }),
    expectedConversationId: getRequiredStringField(body, "expectedConversationId"),
    expectedTurnId: getRequiredStringField(body, "expectedTurnId"),
    expectedApprovalRequestId: getRequiredStringField(body, "expectedApprovalRequestId"),
  };
}

async function readJsonObject(c: Context<WorkerHonoEnv>): Promise<Record<string, unknown>> {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    throwInvalidBody();
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throwInvalidBody();
  }

  return body as Record<string, unknown>;
}

function assertKnownFields(body: Record<string, unknown>, allowedFields: readonly string[]): void {
  const allowed = new Set(allowedFields);
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    throwInvalidBody();
  }
}

function getRequiredStringField(
  body: Record<string, unknown>,
  field: string,
  options: { maxLength?: number } = {},
): string {
  const value = body[field];
  if (typeof value !== "string" || value.length < 1 || (options.maxLength !== undefined && value.length > options.maxLength)) {
    throwInvalidBody();
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
    throwInvalidBody();
  }

  return value;
}

function throwInvalidBody(): never {
  throw new WorkerHttpError(400, "invalid_request", "Request validation failed.", {
    operation: "http_body",
    retryable: false,
  });
}

function setCorsHeaders(c: Context<WorkerHonoEnv>, origin: string): void {
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
