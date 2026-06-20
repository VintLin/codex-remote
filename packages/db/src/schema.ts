import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title", { length: 200 }).notNull(),
  status: text("status", { enum: ["in_progress", "waiting", "done"] }).notNull().default("in_progress"),
});

export const taskConversationLinks = sqliteTable(
  "task_conversation_links",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    conversationId: text("conversation_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.deviceId, table.conversationId] })],
);
