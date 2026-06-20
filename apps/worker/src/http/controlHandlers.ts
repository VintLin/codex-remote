import type {
  ApprovalDecisionInput,
  CommandAccepted,
  InterruptTurnInput,
  PendingApproval,
  SteerTurnInput,
} from "@codex-remote/api-contract";
import type { v2 } from "@codex-remote/codex-protocol";

import { isPathInsideRootRealpath } from "../security/workerSecurity.ts";
import { WorkerHttpError } from "./errors.ts";
import { mapUnknownError } from "./errors.ts";
import type { WorkerApprovalRegistry } from "./approvalRegistry.ts";
import type { WorkerWriteAppServerClient, WorkerWriteHandlerContext } from "./writeHandlers.ts";

export interface WorkerControlAppServerClient extends WorkerWriteAppServerClient {
  interruptTurn(params: v2.TurnInterruptParams): Promise<unknown>;
  steerTurn(params: v2.TurnSteerParams): Promise<unknown>;
  sendApprovalResponse(params: { requestId: string | number; result: unknown }): Promise<void>;
}

export interface WorkerControlHandlerContext extends Omit<WorkerWriteHandlerContext, "openClient"> {
  approvalRegistry: WorkerApprovalRegistry;
  openClient(): Promise<WorkerControlAppServerClient>;
}

export async function interruptTurn(
  context: WorkerControlHandlerContext,
  conversationId: string,
  turnId: string,
  input: InterruptTurnInput,
): Promise<CommandAccepted> {
  validateClientRequestId(input.clientRequestId, "turn/interrupt");
  validateExpectedTurnId(turnId, input.expectedTurnId, "turn/interrupt");

  const idempotencyKey = createIdempotencyKey("interrupt", conversationId, turnId, input.clientRequestId);
  const fingerprint = createFingerprint({ conversationId, turnId, expectedTurnId: input.expectedTurnId });
  const idempotency = getIdempotentResponse(context, { key: idempotencyKey, fingerprint });
  if (idempotency) {
    return idempotency;
  }

  return await withControlClient(context, "turn/interrupt", async (client) => {
    await assertConversationAllowed(client, context.config.allowedProjectRoot, conversationId, "turn/interrupt");
    await client.interruptTurn({ threadId: conversationId, turnId });
    const accepted = createAcceptedResponse({
      idempotencyKey,
      conversationId,
      turnId,
      acceptedAt: context.now(),
    });
    rememberIdempotentResponse(context, { key: idempotencyKey, fingerprint, response: accepted });
    return accepted;
  });
}

export async function steerTurn(
  context: WorkerControlHandlerContext,
  conversationId: string,
  turnId: string,
  input: SteerTurnInput,
): Promise<CommandAccepted> {
  validateClientRequestId(input.clientRequestId, "turn/steer");
  validateMessage(input.message, "turn/steer");
  validateExpectedTurnId(turnId, input.expectedTurnId, "turn/steer");

  const idempotencyKey = createIdempotencyKey("steer", conversationId, turnId, input.clientRequestId);
  const fingerprint = createFingerprint({
    conversationId,
    turnId,
    expectedTurnId: input.expectedTurnId,
    message: input.message,
  });
  const idempotency = getIdempotentResponse(context, { key: idempotencyKey, fingerprint });
  if (idempotency) {
    return idempotency;
  }

  return await withControlClient(context, "turn/steer", async (client) => {
    await assertConversationAllowed(client, context.config.allowedProjectRoot, conversationId, "turn/steer");
    await client.steerTurn({
      threadId: conversationId,
      clientUserMessageId: input.clientRequestId,
      expectedTurnId: input.expectedTurnId,
      input: [createTextUserInput(input.message)],
    });
    const accepted = createAcceptedResponse({
      idempotencyKey,
      conversationId,
      turnId,
      acceptedAt: context.now(),
    });
    rememberIdempotentResponse(context, { key: idempotencyKey, fingerprint, response: accepted });
    return accepted;
  });
}

export async function listApprovals(
  context: WorkerControlHandlerContext,
  conversationId: string,
): Promise<PendingApproval[]> {
  return await withControlClient(context, "approval/list", async (client) => {
    await assertConversationAllowed(client, context.config.allowedProjectRoot, conversationId, "approval/list");
    return context.approvalRegistry.listPendingApprovals(conversationId);
  });
}

export async function decideApproval(
  context: WorkerControlHandlerContext,
  conversationId: string,
  approvalRequestId: string,
  input: ApprovalDecisionInput,
): Promise<CommandAccepted> {
  validateClientRequestId(input.clientRequestId, "approval");
  validateApprovalDecisionInput(conversationId, approvalRequestId, input);

  const idempotencyKey = createIdempotencyKey("approval", conversationId, approvalRequestId, input.clientRequestId);
  const fingerprint = createFingerprint({
    approvalRequestId,
    conversationId,
    decision: input.decision,
    expectedApprovalRequestId: input.expectedApprovalRequestId,
    expectedConversationId: input.expectedConversationId,
    expectedTurnId: input.expectedTurnId,
  });
  const idempotency = getIdempotentResponse(context, { key: idempotencyKey, fingerprint });
  if (idempotency) {
    return idempotency;
  }

  return await withControlClient(context, "approval", async (client) => {
    await assertConversationAllowed(client, context.config.allowedProjectRoot, conversationId, "approval");
    const response = context.approvalRegistry.resolveApproval({
      approvalRequestId,
      conversationId,
      decision: input.decision,
      expectedApprovalRequestId: input.expectedApprovalRequestId,
      expectedTurnId: input.expectedTurnId,
    });
    await client.sendApprovalResponse(response);
    context.approvalRegistry.completeApproval(approvalRequestId);
    const accepted = createAcceptedResponse({
      idempotencyKey,
      conversationId,
      turnId: input.expectedTurnId,
      acceptedAt: context.now(),
    });
    rememberIdempotentResponse(context, { key: idempotencyKey, fingerprint, response: accepted });
    return accepted;
  });
}

type IdempotencyRecord = {
  fingerprint: string;
  response: CommandAccepted;
};

const sourceKinds = ["cli", "vscode", "appServer"] as const;
const listLimit = 25;
const maxPages = 3;
const clientRequestIdMaxLength = 128;
const messageMaxLength = 20_000;

function validateClientRequestId(clientRequestId: string, operation: string): void {
  if (!clientRequestId.trim() || clientRequestId.length > clientRequestIdMaxLength) {
    throw new WorkerHttpError(400, "invalid_request", "Request validation failed.", {
      operation,
      field: "clientRequestId",
      limit: clientRequestIdMaxLength,
      retryable: false,
    });
  }
}

function validateMessage(message: string, operation: string): void {
  const length = message.trim().length;
  if (length < 1 || length > messageMaxLength) {
    throw new WorkerHttpError(400, "invalid_request", "Request validation failed.", {
      operation,
      field: "message",
      limit: messageMaxLength,
      retryable: false,
    });
  }
}

function validateExpectedTurnId(pathTurnId: string, expectedTurnId: string, operation: string): void {
  if (expectedTurnId !== pathTurnId) {
    throw new WorkerHttpError(409, "invalid_request", "Request validation failed.", {
      operation,
      field: "expectedTurnId",
      retryable: false,
    });
  }
}

function validateApprovalDecisionInput(
  conversationId: string,
  approvalRequestId: string,
  input: ApprovalDecisionInput,
): void {
  if (input.expectedConversationId !== conversationId) {
    throw new WorkerHttpError(409, "invalid_request", "Request validation failed.", {
      operation: "approval",
      field: "expectedConversationId",
      retryable: false,
    });
  }

  if (input.expectedApprovalRequestId !== approvalRequestId) {
    throw new WorkerHttpError(409, "invalid_request", "Request validation failed.", {
      operation: "approval",
      field: "expectedApprovalRequestId",
      retryable: false,
    });
  }
}

async function assertConversationAllowed(
  client: WorkerControlAppServerClient,
  allowedProjectRoot: string,
  conversationId: string,
  operation: string,
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
    operation,
    retryable: false,
  });
}

async function withControlClient<T>(
  context: WorkerControlHandlerContext,
  operation: string,
  run: (client: WorkerControlAppServerClient) => Promise<T>,
): Promise<T> {
  let client: WorkerControlAppServerClient;

  try {
    client = await context.openClient();
  } catch (error) {
    throw mapUnknownError(error, operation);
  }

  try {
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
  context: WorkerControlHandlerContext,
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
  context: WorkerControlHandlerContext,
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

function createIdempotencyKey(
  operation: "interrupt" | "steer" | "approval",
  conversationId: string,
  targetId: string,
  clientRequestId: string,
): string {
  return `${operation}:${conversationId}:${targetId}:${clientRequestId}`;
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
