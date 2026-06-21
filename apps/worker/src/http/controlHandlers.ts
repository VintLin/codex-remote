import { basename } from "node:path";

import type {
  ApprovalDecisionInput,
  CommandAccepted,
  ConversationLifecycleInput,
  InterruptTurnInput,
  OpenConversationResult,
  RenameConversationInput,
  PendingApproval,
  SteerTurnInput,
} from "@codex-remote/api-contract";
import type { v2 } from "@codex-remote/codex-protocol";

import { WorkerHttpError } from "./errors.ts";
import { mapUnknownError } from "./errors.ts";
import type { WorkerApprovalRegistry } from "./approvalRegistry.ts";
import { readAllowedConversationThread } from "./readOnlyHandlers.ts";
import { projectThreadToConversation, projectThreadToTimeline } from "./projections.ts";
import type { WorkerWriteAppServerClient, WorkerWriteHandlerContext } from "./writeHandlers.ts";

const localProjectId = "local-project";

export interface WorkerControlAppServerClient extends WorkerWriteAppServerClient {
  interruptTurn(params: v2.TurnInterruptParams): Promise<unknown>;
  steerTurn(params: v2.TurnSteerParams): Promise<unknown>;
  resumeThread(params: v2.ThreadResumeParams): Promise<v2.ThreadResumeResponse>;
  archiveThread(params: v2.ThreadArchiveParams): Promise<v2.ThreadArchiveResponse>;
  unarchiveThread(params: v2.ThreadUnarchiveParams): Promise<v2.ThreadUnarchiveResponse>;
  setThreadName(params: v2.ThreadSetNameParams): Promise<v2.ThreadSetNameResponse>;
  listLoadedThreads?(params: v2.ThreadLoadedListParams): Promise<v2.ThreadLoadedListResponse>;
  sendApprovalResponse(params: { requestId: string | number; result: unknown }): Promise<void>;
}

export interface WorkerControlHandlerContext extends Omit<WorkerWriteHandlerContext, "openClient"> {
  approvalRegistry: WorkerApprovalRegistry;
  openClient(): Promise<WorkerControlAppServerClient>;
}

export async function openConversation(
  context: WorkerControlHandlerContext,
  conversationId: string,
  input: ConversationLifecycleInput,
): Promise<OpenConversationResult> {
  validateClientRequestId(input.clientRequestId, "thread/resume");

  return await withControlClient(context, "thread/resume", async (client) => {
    await assertConversationAllowed(client, context.config.allowedProjectRoot, conversationId, "thread/resume");
    const response = await client.resumeThread({ threadId: conversationId });
    return await createLifecycleResult(context, client, {
      thread: response.thread,
      archived: false,
      lifecycleEventKind: "thread_opened",
    });
  });
}

export async function archiveConversation(
  context: WorkerControlHandlerContext,
  conversationId: string,
  input: ConversationLifecycleInput,
): Promise<OpenConversationResult> {
  validateClientRequestId(input.clientRequestId, "thread/archive");

  return await withControlClient(context, "thread/archive", async (client) => {
    await readAllowedConversationThread(
      client,
      context.config.allowedProjectRoot,
      conversationId,
      "thread/archive",
    );
    await client.archiveThread({ threadId: conversationId });
    const archivedThread = await readAllowedConversationThread(
      client,
      context.config.allowedProjectRoot,
      conversationId,
      "thread/archive",
    );
    return await createLifecycleResult(context, client, {
      thread: archivedThread,
      archived: true,
      lifecycleEventKind: "thread_archived",
    });
  });
}

export async function unarchiveConversation(
  context: WorkerControlHandlerContext,
  conversationId: string,
  input: ConversationLifecycleInput,
): Promise<OpenConversationResult> {
  validateClientRequestId(input.clientRequestId, "thread/unarchive");

  return await withControlClient(context, "thread/unarchive", async (client) => {
    await assertConversationAllowed(client, context.config.allowedProjectRoot, conversationId, "thread/unarchive");
    const response = await client.unarchiveThread({ threadId: conversationId });
    return await createLifecycleResult(context, client, {
      thread: response.thread,
      archived: false,
      lifecycleEventKind: "thread_unarchived",
    });
  });
}

export async function renameConversation(
  context: WorkerControlHandlerContext,
  conversationId: string,
  input: RenameConversationInput,
): Promise<OpenConversationResult> {
  validateClientRequestId(input.clientRequestId, "thread/name/set");
  const title = validateRenameTitle(input.title);

  return await withControlClient(context, "thread/name/set", async (client) => {
    await readAllowedConversationThread(
      client,
      context.config.allowedProjectRoot,
      conversationId,
      "thread/name/set",
    );
    await client.setThreadName({ threadId: conversationId, name: title });
    const renamedThread = await readAllowedConversationThread(
      client,
      context.config.allowedProjectRoot,
      conversationId,
      "thread/name/set",
    );
    return await createLifecycleResult(context, client, {
      thread: renamedThread,
      archived: false,
      lifecycleEventKind: "thread_renamed",
    });
  });
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

const clientRequestIdMaxLength = 128;
const messageMaxLength = 20_000;
const renameTitleMaxLength = 120;

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

function validateRenameTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length < 1 || trimmed.length > renameTitleMaxLength) {
    throw new WorkerHttpError(400, "invalid_request", "Request validation failed.", {
      operation: "thread/name/set",
      field: "title",
      limit: renameTitleMaxLength,
      retryable: false,
    });
  }

  return trimmed;
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
  await readAllowedConversationThread(client, allowedProjectRoot, conversationId, operation);
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

async function createLifecycleResult(
  context: WorkerControlHandlerContext,
  client: WorkerControlAppServerClient,
  params: {
    thread: v2.Thread;
    archived: boolean;
    lifecycleEventKind: "thread_opened" | "thread_archived" | "thread_unarchived" | "thread_renamed";
  },
): Promise<OpenConversationResult> {
  const readStartedAt = context.now();
  const loadedThreadIds = await listLoadedThreadIds(client);
  const readCompletedAt = context.now();
  const approvals = [
    ...context.approvalRegistry.listPendingApprovals(params.thread.id),
    ...context.approvalRegistry.listResolvedApprovals(params.thread.id),
  ];
  const projectionContext = {
    allowedProjectRoot: context.config.allowedProjectRoot,
    deviceId: context.config.deviceId,
    projectId: localProjectId,
    projectName: basename(context.config.allowedProjectRoot),
    archived: params.archived,
    loadedThreadIds,
    approvals,
    lifecycleEventKind: params.lifecycleEventKind,
    readStartedAt,
    readCompletedAt,
  };

  return {
    conversation: projectThreadToConversation(params.thread, projectionContext),
    timeline: projectThreadToTimeline(params.thread, projectionContext),
  };
}

async function listLoadedThreadIds(client: WorkerControlAppServerClient): Promise<ReadonlySet<string>> {
  if (!client.listLoadedThreads) {
    return new Set();
  }

  const loadedThreadIds = new Set<string>();
  let cursor: string | null = null;

  try {
    for (let page = 0; page < 100; page += 1) {
      const response = await client.listLoadedThreads({ cursor, limit: 100 });
      for (const threadId of response.data) {
        loadedThreadIds.add(threadId);
      }

      cursor = response.nextCursor;
      if (!cursor) {
        break;
      }
    }
  } catch {
    return new Set();
  }

  return loadedThreadIds;
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
