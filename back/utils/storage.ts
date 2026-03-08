import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile, unlink, readdir, stat } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';

// ─── Filesystem Blob Storage ────────────────────────────────────────────────
//
// Simple local file storage that replaces hubBlob / Cloudflare R2.
// All files live under `.data/storage/` — persisted via Docker volume.

function storageRoot(): string {
  const dir = resolve(process.cwd(), '.data', 'storage');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function safePath(key: string): string {
  // Prevent path traversal
  const cleaned = key.replace(/\.\./g, '').replace(/^\/+/, '');
  return join(storageRoot(), cleaned);
}

/** Store a blob (Buffer or string) under the given key. */
export async function storageSet(key: string, data: Buffer | string) {
  const path = safePath(key);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await writeFile(path, data);
}

/** Retrieve a blob by key. Returns null if not found. */
export async function storageGet(key: string): Promise<Buffer | null> {
  const path = safePath(key);
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

/** Delete a blob by key. */
export async function storageDel(key: string): Promise<void> {
  const path = safePath(key);
  try {
    await unlink(path);
  } catch {
    // ignore if not found
  }
}

/** List all keys under a prefix. */
export async function storageList(prefix = ''): Promise<string[]> {
  const dir = safePath(prefix);
  try {
    const entries = await readdir(dir, { recursive: true });
    const results: string[] = [];
    for (const entry of entries) {
      const full = join(dir, entry.toString());
      const s = await stat(full);
      if (s.isFile()) {
        results.push(
          prefix ? join(prefix, entry.toString()) : entry.toString(),
        );
      }
    }
    return results;
  } catch {
    return [];
  }
}

/** Check if a key exists and return its size (in bytes), or null if not found. */
export async function storageInfo(
  key: string,
): Promise<{ size: number } | null> {
  const path = safePath(key);
  try {
    const s = await stat(path);
    if (!s.isFile()) return null;
    return { size: s.size };
  } catch {
    return null;
  }
}
