import { randomUUID } from "node:crypto";

import type { BoardTask, CreateTaskInput, LinkTaskConversationInput, TaskConversationLink } from "@codex-remote/api-contract";
import { and, asc, desc, eq } from "drizzle-orm";
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
    const now = new Date().toISOString();
    this.database.insert(tasks).values({
      id,
      title: input.title,
      status: input.status ?? "in_progress",
      createdAt: now,
      updatedAt: now,
    }).run();

    return this.requireTask(id);
  }

  linkConversation(taskId: string, input: LinkTaskConversationInput): BoardTask {
    this.requireTask(taskId);
    const now = new Date().toISOString();
    this.database.insert(taskConversationLinks).values({
      taskId,
      deviceId: input.deviceId,
      conversationId: input.conversationId,
      projectId: input.projectId,
      linkedAt: now,
    }).onConflictDoNothing().run();
    this.touchTask(taskId, now);

    return this.requireTask(taskId);
  }

  unlinkConversation(taskId: string, deviceId: string, conversationId: string): BoardTask {
    this.requireTask(taskId);
    const now = new Date().toISOString();
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
    this.touchTask(taskId, now);

    return this.requireTask(taskId);
  }

  private touchTask(taskId: string, updatedAt: string): void {
    this.database.update(tasks).set({ updatedAt }).where(eq(tasks.id, taskId)).run();
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
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        deviceId: taskConversationLinks.deviceId,
        conversationId: taskConversationLinks.conversationId,
        projectId: taskConversationLinks.projectId,
        linkedAt: taskConversationLinks.linkedAt,
      })
      .from(tasks)
      .leftJoin(taskConversationLinks, eq(tasks.id, taskConversationLinks.taskId))
      .orderBy(desc(tasks.updatedAt), asc(taskConversationLinks.deviceId), asc(taskConversationLinks.conversationId));

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
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        linkedConversations: [],
      };

      if (row.deviceId !== null && row.conversationId !== null && row.projectId !== null && row.linkedAt !== null) {
        task.linkedConversations.push({
          deviceId: row.deviceId,
          conversationId: row.conversationId,
          projectId: row.projectId,
          linkedAt: row.linkedAt,
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
  createdAt: BoardTask["createdAt"];
  updatedAt: BoardTask["updatedAt"];
  deviceId: TaskConversationLink["deviceId"] | null;
  conversationId: TaskConversationLink["conversationId"] | null;
  projectId: TaskConversationLink["projectId"] | null;
  linkedAt: TaskConversationLink["linkedAt"] | null;
};
