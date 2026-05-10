import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';

let _sqlite: Database.Database | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Lazily open (or reuse) the SQLite connection and return the Drizzle client.
 * The Worker process and the Next.js process both call this against the
 * same on-disk file; WAL mode + busy_timeout make concurrent access safe.
 */
export function getDb() {
  if (_db) return _db;

  const dbPath = process.env.DATABASE_PATH ?? 'data/data.db';
  mkdirSync(dirname(resolve(dbPath)), { recursive: true });

  const sqlite = new Database(dbPath);
  // Pragmas — see SPEC §5 / §7.5.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');

  _sqlite = sqlite;
  _db = drizzle(sqlite, { schema });
  return _db;
}

/**
 * Close the underlying SQLite connection. Used for graceful shutdown
 * (SIGINT/SIGTERM in the worker, or test cleanup).
 */
export function closeDb() {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}
