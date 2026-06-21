import type { CommandAccepted, StartReviewInput } from "@codex-remote/api-contract";
import type { v2 } from "@codex-remote/codex-protocol";

import { mapUnknownError, WorkerHttpError } from "./errors.ts";
import { readAllowedConversationThread, type WorkerReadOnlyAppServerClient } from "./readOnlyHandlers.ts";
import type { WorkerWriteHandlerContext } from "./writeHandlers.ts";

export const localReviewConfirmationText = "START REVIEW";

export interface WorkerLocalActionAppServerClient extends WorkerReadOnlyAppServerClient {
  startReview(params: v2.ReviewStartParams): Promise<v2.ReviewStartResponse>;
}

export interface WorkerLocalActionHandlerContext extends Omit<WorkerWriteHandlerContext, "openClient"> {
  openClient(): Promise<WorkerLocalActionAppServerClient>;
}

type IdempotencyRecord = {
  fingerprint: string;
  response: CommandAccepted;
};

const clientRequestIdMaxLength = 128;
const localProjectId = "local-project";
const operation = "review_start";

export async function startLocalReview(
  context: WorkerLocalActionHandlerContext,
  conversationId: string,
  input: StartReviewInput,
): Promise<CommandAccepted> {
  validateInput(context, conversationId, input);

  const idempotencyKey = createIdempotencyKey(conversationId, input.clientRequestId);
  const fingerprint = createFingerprint({
    conversationId,
    expectedConversationId: input.expectedConversationId,
    projectId: input.projectId,
    confirmationText: input.confirmationText,
  });
  const idempotency = getIdempotentResponse(context, { key: idempotencyKey, fingerprint });
  if (idempotency) {
    return idempotency;
  }

  return await withLocalActionClient(context, async (client) => {
    await readAllowedConversationThread(client, context.config.allowedProjectRoot, conversationId, operation);
    await client.startReview({
      threadId: conversationId,
      delivery: "inline",
      target: { type: "uncommittedChanges" },
    });

    const accepted = createAcceptedResponse({
      idempotencyKey,
      conversationId,
      acceptedAt: context.now(),
    });
    rememberIdempotentResponse(context, { key: idempotencyKey, fingerprint, response: accepted });
    return accepted;
  });
}

function validateInput(
  context: WorkerLocalActionHandlerContext,
  conversationId: string,
  input: StartReviewInput,
): void {
  if (!input.clientRequestId.trim() || input.clientRequestId.length > clientRequestIdMaxLength) {
    throw new WorkerHttpError(400, "invalid_request", "Request validation failed.", {
      operation,
      field: "clientRequestId",
      limit: clientRequestIdMaxLength,
      retryable: false,
    });
  }

  if (input.confirmationText !== localReviewConfirmationText) {
    throw new WorkerHttpError(400, "invalid_request", "Request validation failed.", {
      operation,
      field: "confirmationText",
      expected: localReviewConfirmationText,
      retryable: false,
    });
  }

  if (input.expectedConversationId !== conversationId) {
    throw new WorkerHttpError(409, "invalid_request", "Request validation failed.", {
      operation,
      field: "expectedConversationId",
      retryable: false,
    });
  }

  if (input.projectId !== localProjectId || !context.config.allowedProjectRoot.trim()) {
    throw new WorkerHttpError(403, "project_forbidden", "Requested project is outside the allowed root.", {
      operation,
      retryable: false,
    });
  }
}

async function withLocalActionClient<T>(
  context: WorkerLocalActionHandlerContext,
  run: (client: WorkerLocalActionAppServerClient) => Promise<T>,
): Promise<T> {
  let client: WorkerLocalActionAppServerClient;

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

function getIdempotentResponse(
  context: WorkerLocalActionHandlerContext,
  params: { key: string; fingerprint: string },
): CommandAccepted | null {
  const acceptedCommands = context.writeState.acceptedCommands as Map<string, IdempotencyRecord>;
  const existing = acceptedCommands.get(params.key);
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
  context: WorkerLocalActionHandlerContext,
  params: { key: string; fingerprint: string; response: CommandAccepted },
): void {
  const acceptedCommands = context.writeState.acceptedCommands as Map<string, IdempotencyRecord>;
  acceptedCommands.set(params.key, {
    fingerprint: params.fingerprint,
    response: params.response,
  });

  while (acceptedCommands.size > context.writeState.maxAcceptedCommands) {
    const oldestKey = acceptedCommands.keys().next().value;
    if (typeof oldestKey !== "string") {
      break;
    }
    acceptedCommands.delete(oldestKey);
  }
}

function createIdempotencyKey(conversationId: string, clientRequestId: string): string {
  return `review-start:${conversationId}:${clientRequestId}`;
}

function createFingerprint(value: unknown): string {
  return JSON.stringify(value);
}

function createAcceptedResponse(params: {
  idempotencyKey: string;
  conversationId: string;
  acceptedAt: string;
}): CommandAccepted {
  return {
    id: params.idempotencyKey,
    status: "accepted",
    conversationId: params.conversationId,
    turnId: null,
    acceptedAt: params.acceptedAt,
  };
}
