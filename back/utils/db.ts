import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import * as schema from '../db/schema';

export { schema };

export type Database = ReturnType<typeof useDrizzle>;

// ─── LibSQL singleton ───────────────────────────────────────────────────────

function dbPath(): string {
  const dir = resolve(process.cwd(), '.data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'gumm.db');
}

let _client: ReturnType<typeof createClient> | undefined;

function getClient() {
  if (!_client) {
    _client = createClient({ url: `file:${dbPath()}` });
  }
  return _client;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * Returns a typed Drizzle ORM instance backed by a local SQLite file
 * via libsql (`@libsql/client`).
 *
 * The database lives at `.data/gumm.db` — persisted via Docker volume.
 */
export function useDrizzle() {
  if (!_db) {
    _db = drizzle(getClient(), { schema });
  }
  return _db;
}

// ─── Auto-migration ─────────────────────────────────────────────────────────

let _migrated = false;

/**
 * Run all SQL migration files in order. Safe to call multiple times —
 * uses `CREATE TABLE IF NOT EXISTS` so re-runs are idempotent.
 */
export async function ensureMigrations() {
  if (_migrated) return;
  _migrated = true;

  const migrationsDir = resolve(process.cwd(), 'back/db/migrations');
  // In production build the migrations are at the project root or bundled.
  // Try the source path first, then fallback to cwd-relative.
  const dirs = [migrationsDir, resolve(process.cwd(), 'db/migrations')];

  let dir: string | undefined;
  for (const d of dirs) {
    if (existsSync(d)) {
      dir = d;
      break;
    }
  }

  if (!dir) {
    console.warn('[DB] No migrations directory found — skipping auto-migrate');
    return;
  }

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = getClient();

  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf-8');
    // Split on drizzle-kit's statement breakpoint marker
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      try {
        await client.execute(stmt);
      } catch (e: any) {
        // ALTER TABLE ADD COLUMN is not idempotent in SQLite — ignore
        // "duplicate column name" errors since migrations re-run on every startup.
        const msg = e?.message || '';
        if (stmt.includes('ADD COLUMN') && msg.includes('duplicate column')) {
          continue;
        }
        throw e;
      }
    }
    console.log(`[DB] Applied migration: ${file}`);
  }
}
