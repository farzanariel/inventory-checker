/**
 * In-memory SQLite helper for unit tests.
 *
 * Creates a fresh better-sqlite3 `:memory:` database, runs all drizzle
 * migrations against it, and returns the drizzle client.  Each call
 * returns an independent database so tests never share state.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import * as schema from "./db/schema";

export function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return { db, sqlite };
}

export type TestDb = ReturnType<typeof makeTestDb>["db"];
