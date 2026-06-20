import BetterSqlite3 from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "./schema.ts";
import { TaskRepository } from "./taskRepository.ts";

export type TaskDatabase = {
  tasks: TaskRepository;
  close(): void;
};

export function openTaskDatabase(path: string): TaskDatabase {
  const connection = new BetterSqlite3(path);
  connection.pragma("foreign_keys = ON");

  const database = drizzle(connection, { schema });
  migrate(database, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });

  return new SqliteTaskDatabase(connection, database);
}

class SqliteTaskDatabase implements TaskDatabase {
  private readonly connection: BetterSqlite3.Database;
  readonly tasks: TaskRepository;

  constructor(connection: BetterSqlite3.Database, database: BetterSQLite3Database<typeof schema>) {
    this.connection = connection;
    this.tasks = new TaskRepository(database);
  }

  close(): void {
    this.connection.close();
  }
}
