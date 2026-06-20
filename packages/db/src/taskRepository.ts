import { randomUUID } from "node:crypto";

import type { BoardTask, CreateTaskInput, LinkTaskConversationInput, TaskConversationLink } from "@codex-remote/api-contract";
import { and, asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { taskConversationLinks, tasks } from "./schema.ts";
import * as schema from "./schema.ts";

type Database = BetterSQLite3Database<typeof schema>;

export class TaskRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  listTasks(): BoardTask[] {
    return this.projectRows(this.readTaskRows());
  }

  createTask(input: CreateTaskInput): BoardTask {
    const id = randomUUID();
    this.database.insert(tasks).values({
      id,
      title: input.title,
      status: input.status ?? "in_progress",
    }).run();

    return this.requireTask(id);
  }

  linkConversation(taskId: string, input: LinkTaskConversationInput): BoardTask {
    this.requireTask(taskId);
    this.database.insert(taskConversationLinks).values({
      taskId,
      deviceId: input.deviceId,
      conversationId: input.conversationId,
    }).onConflictDoNothing().run();

    return this.requireTask(taskId);
  }

  unlinkConversation(taskId: string, deviceId: string, conversationId: string): BoardTask {
    this.requireTask(taskId);
    this.database
      .delete(taskConversationLinks)
      .where(
        and(
          eq(taskConversationLinks.taskId, taskId),
          eq(taskConversationLinks.deviceId, deviceId),
          eq(taskConversationLinks.conversationId, conversationId),
        ),
      )
      .run();

    return this.requireTask(taskId);
  }

  private requireTask(taskId: string): BoardTask {
    const [task] = this.projectRows(this.readTaskRows(taskId));
    if (task === undefined) {
      throw new Error(`task_not_found:${taskId}`);
    }
    return task;
  }

  private readTaskRows(taskId?: string): TaskRow[] {
    const query = this.database
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        deviceId: taskConversationLinks.deviceId,
        conversationId: taskConversationLinks.conversationId,
      })
      .from(tasks)
      .leftJoin(taskConversationLinks, eq(tasks.id, taskConversationLinks.taskId))
      .orderBy(asc(tasks.id), asc(taskConversationLinks.deviceId), asc(taskConversationLinks.conversationId));

    if (taskId === undefined) {
      return query.all();
    }
    return query.where(eq(tasks.id, taskId)).all();
  }

  private projectRows(rows: TaskRow[]): BoardTask[] {
    const tasksById = new Map<string, BoardTask>();

    for (const row of rows) {
      const task = tasksById.get(row.id) ?? {
        id: row.id,
        title: row.title,
        status: row.status,
        linkedConversations: [],
      };

      if (row.deviceId !== null && row.conversationId !== null) {
        task.linkedConversations.push({
          deviceId: row.deviceId,
          conversationId: row.conversationId,
        });
      }

      tasksById.set(row.id, task);
    }

    return [...tasksById.values()];
  }
}

type TaskRow = {
  id: string;
  title: string;
  status: BoardTask["status"];
  deviceId: TaskConversationLink["deviceId"] | null;
  conversationId: TaskConversationLink["conversationId"] | null;
};
