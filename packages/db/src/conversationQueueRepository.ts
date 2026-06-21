import { randomUUID } from "node:crypto";

import type { ConversationQueuedMessage, QueueConversationMessageInput } from "@codex-remote/api-contract";
import { and, asc, desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { conversationQueuedMessages } from "./schema.ts";
import * as schema from "./schema.ts";

type Database = BetterSQLite3Database<typeof schema>;

export type QueueMessageInput = QueueConversationMessageInput & {
  deviceId: string;
  conversationId: string;
};

export class ConversationQueueRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  queueMessage(input: QueueMessageInput): ConversationQueuedMessage {
    const existing = this.findByClientRequestId(input.deviceId, input.conversationId, input.clientRequestId);
    if (existing !== undefined) {
      return existing;
    }

    const now = this.nextCreatedAt(input.deviceId, input.conversationId);
    const id = randomUUID();
    this.database.insert(conversationQueuedMessages).values({
      id,
      deviceId: input.deviceId,
      conversationId: input.conversationId,
      clientRequestId: input.clientRequestId,
      message: input.message,
      status: "queued",
      failureCode: null,
      createdAt: now,
      updatedAt: now,
    }).run();

    return this.requireMessage(id);
  }

  listMessages(deviceId: string, conversationId: string): ConversationQueuedMessage[] {
    return this.projectRows(
      this.database
        .select()
        .from(conversationQueuedMessages)
        .where(and(eq(conversationQueuedMessages.deviceId, deviceId), eq(conversationQueuedMessages.conversationId, conversationId)))
        .orderBy(asc(conversationQueuedMessages.createdAt), asc(conversationQueuedMessages.id))
        .all(),
    );
  }

  listQueuedMessages(deviceId: string, conversationId: string): ConversationQueuedMessage[] {
    return this.projectRows(
      this.database
        .select()
        .from(conversationQueuedMessages)
        .where(
          and(
            eq(conversationQueuedMessages.deviceId, deviceId),
            eq(conversationQueuedMessages.conversationId, conversationId),
            eq(conversationQueuedMessages.status, "queued"),
          ),
        )
        .orderBy(asc(conversationQueuedMessages.createdAt), asc(conversationQueuedMessages.id))
        .all(),
    );
  }

  claimMessage(deviceId: string, conversationId: string, messageId: string): ConversationQueuedMessage {
    const message = this.requireScopedMessage(deviceId, conversationId, messageId);
    if (message.status !== "queued") {
      throw new Error(`queue_message_conflict:${messageId}`);
    }

    this.updateStatus(messageId, "sending");
    return this.requireMessage(messageId);
  }

  markSent(messageId: string): ConversationQueuedMessage {
    this.updateStatus(messageId, "sent");
    return this.requireMessage(messageId);
  }

  markFailed(messageId: string, failureCode: string): ConversationQueuedMessage {
    const updatedAt = new Date().toISOString();
    this.database
      .update(conversationQueuedMessages)
      .set({ status: "failed", failureCode, updatedAt })
      .where(eq(conversationQueuedMessages.id, messageId))
      .run();
    return this.requireMessage(messageId);
  }

  cancelMessage(deviceId: string, conversationId: string, messageId: string): ConversationQueuedMessage {
    const message = this.requireScopedMessage(deviceId, conversationId, messageId);
    if (message.status !== "queued" && message.status !== "failed") {
      throw new Error(`queue_message_conflict:${messageId}`);
    }

    this.updateStatus(messageId, "canceled");
    return this.requireMessage(messageId);
  }

  private updateStatus(messageId: string, status: ConversationQueuedMessage["status"]): void {
    const updatedAt = new Date().toISOString();
    this.database
      .update(conversationQueuedMessages)
      .set({ status, failureCode: null, updatedAt })
      .where(eq(conversationQueuedMessages.id, messageId))
      .run();
  }

  private requireScopedMessage(deviceId: string, conversationId: string, messageId: string): ConversationQueuedMessage {
    const message = this.requireMessage(messageId);
    if (message.deviceId !== deviceId || message.conversationId !== conversationId) {
      throw new Error(`queue_message_not_found:${messageId}`);
    }
    return message;
  }

  private requireMessage(messageId: string): ConversationQueuedMessage {
    const [message] = this.projectRows(
      this.database.select().from(conversationQueuedMessages).where(eq(conversationQueuedMessages.id, messageId)).all(),
    );
    if (message === undefined) {
      throw new Error(`queue_message_not_found:${messageId}`);
    }
    return message;
  }

  private findByClientRequestId(deviceId: string, conversationId: string, clientRequestId: string): ConversationQueuedMessage | undefined {
    const [message] = this.projectRows(
      this.database
        .select()
        .from(conversationQueuedMessages)
        .where(
          and(
            eq(conversationQueuedMessages.deviceId, deviceId),
            eq(conversationQueuedMessages.conversationId, conversationId),
            eq(conversationQueuedMessages.clientRequestId, clientRequestId),
          ),
        )
        .all(),
    );
    return message;
  }

  private nextCreatedAt(deviceId: string, conversationId: string): string {
    const [latest] = this.database
      .select({ createdAt: conversationQueuedMessages.createdAt })
      .from(conversationQueuedMessages)
      .where(and(eq(conversationQueuedMessages.deviceId, deviceId), eq(conversationQueuedMessages.conversationId, conversationId)))
      .orderBy(desc(conversationQueuedMessages.createdAt))
      .limit(1)
      .all();
    const now = new Date();
    if (latest === undefined) {
      return now.toISOString();
    }

    const latestTime = Date.parse(latest.createdAt);
    if (Number.isNaN(latestTime) || latestTime < now.getTime()) {
      return now.toISOString();
    }

    return new Date(latestTime + 1).toISOString();
  }

  private projectRows(rows: QueueRow[]): ConversationQueuedMessage[] {
    return rows.map((row) => ({
      id: row.id,
      deviceId: row.deviceId,
      conversationId: row.conversationId,
      message: row.message,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(row.failureCode === null ? {} : { failureCode: row.failureCode }),
    }));
  }
}

type QueueRow = typeof conversationQueuedMessages.$inferSelect;
