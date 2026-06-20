import type {
  CommandAccepted,
  FollowUpInput,
  StartConversationInput,
} from "@codex-remote/api-contract";
import type { v2 } from "@codex-remote/codex-protocol";

import { isPathInsideRootRealpath } from "../security/workerSecurity.ts";
import { mapUnknownError, WorkerHttpError } from "./errors.ts";
import type {
  WorkerReadOnlyAppServerClient,
  WorkerReadOnlyHandlerContext,
} from "./readOnlyHandlers.ts";

export interface WorkerWriteAppServerClient extends WorkerReadOnlyAppServerClient {
  startThread(params: v2.ThreadStartParams): Promise<v2.ThreadStartResponse>;
  startTurn(params: v2.TurnStartParams): Promise<v2.TurnStartResponse>;
}

export interface WorkerWriteHandlerState {
  acceptedCommands: Map<string, IdempotencyRecord>;
  maxAcceptedCommands: number;
}

export interface WorkerWriteHandlerContext extends Omit<WorkerReadOnlyHandlerContext, "openClient"> {
  openClient(): Promise<WorkerWriteAppServerClient>;
  writeState: WorkerWriteHandlerState;
}

export function createWorkerWriteHandlerState(): WorkerWriteHandlerState {
  return {
    acceptedCommands: new Map(),
    maxAcceptedCommands: 100,
  };
}

type IdempotencyRecord = {
  fingerprint: string;
  response: CommandAccepted;
};

const sourceKinds = ["cli", "vscode", "appServer"] as const;
const listLimit = 25;
const maxPages = 3;
const clientRequestIdMaxLength = 128;

export async function startConversation(
  context: WorkerWriteHandlerContext,
  input: StartConversationInput,
): Promise<CommandAccepted> {
  validateClientRequestId(input.clientRequestId);
  validateMessage(input.message);
  validateProjectId(context, input.projectId);

  const idempotency = getIdempotentResponse(context, {
    key: createIdempotencyKey("start", input.projectId, input.clientRequestId),
    fingerprint: createFingerprint({
      message: input.message,
      projectId: input.projectId,
    }),
  });
  if (idempotency) {
    return idempotency;
  }

  return await withWriteClient(context, "thread/start", async (client) => {
    const threadResponse = await client.startThread({
      cwd: context.config.allowedProjectRoot,
    });
    const threadId = threadResponse.thread.id;
    const turnResponse = await client.startTurn({
      threadId,
      clientUserMessageId: input.clientRequestId,
      cwd: context.config.allowedProjectRoot,
      input: [createTextUserInput(input.message)],
    });
    const accepted = createAcceptedResponse({
      idempotencyKey: createIdempotencyKey("start", input.projectId, input.clientRequestId),
      conversationId: threadId,
      turnId: turnResponse.turn.id,
      acceptedAt: context.now(),
    });
    rememberIdempotentResponse(context, {
      key: createIdempotencyKey("start", input.projectId, input.clientRequestId),
      fingerprint: createFingerprint({
        message: input.message,
        projectId: input.projectId,
      }),
      response: accepted,
    });
    return accepted;
  });
}

export async function followUpConversation(
  context: WorkerWriteHandlerContext,
  conversationId: string,
  input: FollowUpInput,
): Promise<CommandAccepted> {
  validateClientRequestId(input.clientRequestId);
  validateMessage(input.message);
  if (input.expectedConversationId && input.expectedConversationId !== conversationId) {
    throw new WorkerHttpError(409, "invalid_request", "Request validation failed.", {
      operation: "turn/start",
      field: "expectedConversationId",
      retryable: false,
    });
  }

  const idempotencyKey = createIdempotencyKey("follow-up", conversationId, input.clientRequestId);
  const fingerprint = createFingerprint({
    conversationId,
    expectedConversationId: input.expectedConversationId ?? null,
    message: input.message,
  });
  const idempotency = getIdempotentResponse(context, { key: idempotencyKey, fingerprint });
  if (idempotency) {
    return idempotency;
  }

  return await withWriteClient(context, "turn/start", async (client) => {
    await assertConversationAllowed(client, context.config.allowedProjectRoot, conversationId);
    const turnResponse = await client.startTurn({
      threadId: conversationId,
      clientUserMessageId: input.clientRequestId,
      input: [createTextUserInput(input.message)],
    });
    const accepted = createAcceptedResponse({
      idempotencyKey,
      conversationId,
      turnId: turnResponse.turn.id,
      acceptedAt: context.now(),
    });
    rememberIdempotentResponse(context, { key: idempotencyKey, fingerprint, response: accepted });
    return accepted;
  });
}

function validateClientRequestId(clientRequestId: string): void {
  if (!clientRequestId.trim() || clientRequestId.length > clientRequestIdMaxLength) {
    throw new WorkerHttpError(400, "invalid_request", "Request validation failed.", {
      operation: "write",
      field: "clientRequestId",
      limit: clientRequestIdMaxLength,
      retryable: false,
    });
  }
}

function validateMessage(message: string): void {
  const length = message.trim().length;
  if (length < 1 || length > 20_000) {
    throw new WorkerHttpError(400, "invalid_request", "Request validation failed.", {
      operation: "write",
      field: "message",
      limit: 20_000,
      retryable: false,
    });
  }
}

function validateProjectId(context: WorkerWriteHandlerContext, projectId: string): void {
  if (projectId !== "local-project") {
    throw new WorkerHttpError(403, "project_forbidden", "Requested project is outside the allowed root.", {
      operation: "thread/start",
      retryable: false,
    });
  }
}

async function assertConversationAllowed(
  client: WorkerWriteAppServerClient,
  allowedProjectRoot: string,
  conversationId: string,
): Promise<void> {
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await client.listThreads({
      cwd: allowedProjectRoot,
      sourceKinds,
      archived: false,
      limit: listLimit,
      sortDirection: "desc",
      cursor,
    });

    for (const thread of response.data) {
      if (thread.id === conversationId && await isPathInsideRootRealpath(thread.cwd, allowedProjectRoot)) {
        return;
      }
    }

    cursor = response.nextCursor;
    if (!cursor) {
      break;
    }
  }

  throw new WorkerHttpError(404, "conversation_not_found", "Conversation was not found.", {
    operation: "turn/start",
    retryable: false,
  });
}

async function withWriteClient<T>(
  context: WorkerWriteHandlerContext,
  operation: string,
  run: (client: WorkerWriteAppServerClient) => Promise<T>,
): Promise<T> {
  let client: WorkerWriteAppServerClient;

  try {
    client = await context.openClient();
  } catch (error) {
    throw mapUnknownError(error, operation);
  }

  try {
    await client.readyz();
    return await run(client);
  } catch (error) {
    throw mapUnknownError(error, operation);
  } finally {
    client.close();
  }
}

function createTextUserInput(message: string): v2.UserInput {
  return {
    type: "text",
    text: message,
    text_elements: [],
  };
}

function getIdempotentResponse(
  context: WorkerWriteHandlerContext,
  params: { key: string; fingerprint: string },
): CommandAccepted | null {
  const existing = context.writeState.acceptedCommands.get(params.key);
  if (!existing) {
    return null;
  }

  if (existing.fingerprint !== params.fingerprint) {
    throw new WorkerHttpError(409, "invalid_request", "Request validation failed.", {
      operation: "idempotency",
      reason: "fingerprint_mismatch",
      retryable: false,
    });
  }

  return existing.response;
}

function rememberIdempotentResponse(
  context: WorkerWriteHandlerContext,
  params: { key: string; fingerprint: string; response: CommandAccepted },
): void {
  context.writeState.acceptedCommands.set(params.key, {
    fingerprint: params.fingerprint,
    response: params.response,
  });

  while (context.writeState.acceptedCommands.size > context.writeState.maxAcceptedCommands) {
    const oldestKey = context.writeState.acceptedCommands.keys().next().value;
    if (typeof oldestKey !== "string") {
      break;
    }
    context.writeState.acceptedCommands.delete(oldestKey);
  }
}

function createIdempotencyKey(operation: string, targetId: string, clientRequestId: string): string {
  return `${operation}:${targetId}:${clientRequestId}`;
}

function createFingerprint(value: unknown): string {
  return JSON.stringify(value);
}

function createAcceptedResponse(params: {
  idempotencyKey: string;
  conversationId: string;
  turnId: string | null;
  acceptedAt: string;
}): CommandAccepted {
  return {
    id: params.idempotencyKey,
    status: "accepted",
    conversationId: params.conversationId,
    turnId: params.turnId,
    acceptedAt: params.acceptedAt,
  };
}
