/**
 * GET /api/modules/official
 *
 * Returns the list of official modules bundled in the Docker image (modules/official/).
 * These are always available without a GitHub fetch.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

declare const process: NodeJS.Process;

const OFFICIAL_MODULES_DIR = join(process.cwd(), 'modules/official');

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  try {
    const entries = await readdir(OFFICIAL_MODULES_DIR, {
      withFileTypes: true,
    });
    const dirs = entries.filter((e) => e.isDirectory());

    const modules = await Promise.all(
      dirs.map(async (dir) => {
        try {
          const manifestPath = join(
            OFFICIAL_MODULES_DIR,
            dir.name,
            'manifest.json',
          );
          const raw = await readFile(manifestPath, 'utf-8');
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }),
    );

    return modules.filter(Boolean);
  } catch (err: any) {
    if (err.code === 'ENOENT') return [];
    throw createError({ statusCode: 500, message: err.message });
  }
});
