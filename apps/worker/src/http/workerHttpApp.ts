import { randomUUID } from "node:crypto";

import { Hono } from "hono";

import { isBearerTokenAuthorized, isOriginAllowed } from "../security/workerSecurity.ts";
import { toErrorEnvelope, WorkerHttpError } from "./errors.ts";
import {
  getCapabilities,
  getHealth,
  listConversations,
  readConversationTimeline,
  runProbe,
  type WorkerReadOnlyHandlerContext,
} from "./readOnlyHandlers.ts";

type WorkerHonoEnv = {
  Variables: {
    requestId: string;
  };
};

type ErrorStatus = 400 | 401 | 403 | 404 | 408 | 424 | 500;

export function createWorkerHttpApp(context: WorkerReadOnlyHandlerContext): Hono<WorkerHonoEnv> {
  const app = new Hono<WorkerHonoEnv>();

  app.onError((error, c) => {
    const requestId = c.get("requestId") || randomUUID();
    const envelope = toErrorEnvelope(error, requestId);
    const status = error instanceof WorkerHttpError ? toErrorStatus(error.status) : 500;
    return c.json(envelope, status);
  });

  app.use("*", async (c, next) => {
    c.set("requestId", c.req.header("x-request-id") ?? randomUUID());

    if (!isBearerTokenAuthorized(c.req.header("authorization"), context.config.workerToken)) {
      throw new WorkerHttpError(401, "unauthorized", "Missing or invalid bearer token.");
    }

    if (!isOriginAllowed(c.req.header("origin"), context.config.allowedOrigins)) {
      throw new WorkerHttpError(403, "origin_forbidden", "Origin is not allowed.");
    }

    await next();
  });

  app.get("/v1/worker/health", async (c) => c.json(await getHealth(context)));
  app.get("/v1/worker/capabilities", (c) => c.json(getCapabilities(context)));
  app.get("/v1/worker/probe", async (c) => c.json(await runProbe(context)));
  app.get("/v1/conversations", async (c) => c.json(await listConversations(context)));
  app.get("/v1/conversations/:conversationId/timeline", async (c) =>
    c.json(await readConversationTimeline(context, c.req.param("conversationId"))),
  );

  return app;
}

function toErrorStatus(status: number): ErrorStatus {
  switch (status) {
    case 400:
    case 401:
    case 403:
    case 404:
    case 408:
    case 424:
    case 500:
      return status;
    default:
      return 500;
  }
}
