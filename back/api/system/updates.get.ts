/**
 * GET /api/system/updates
 *
 * Check for available updates:
 * - Gumm core version (from GitHub releases)
 * - Module updates (comparing installed vs remote manifest versions)
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { modules as modulesTable } from '../../db/schema';
import { fetchRemoteManifest } from '../../utils/github-fetcher';

interface ModuleUpdate {
  id: string;
  name: string;
  currentVersion: string;
  latestVersion: string;
  sourceUrl: string;
}

interface UpdatesResponse {
  currentVersion: string;
  latestVersion: string;
  hasGummUpdate: boolean;
  moduleUpdatesCount: number;
  moduleUpdates: ModuleUpdate[];
  checkedAt: string;
}

// Cache updates check for 5 minutes
let cachedResponse: UpdatesResponse | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export default defineEventHandler(async (event): Promise<UpdatesResponse> => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const forceRefresh = getQuery(event).refresh === 'true';

  // Return cached response if still valid
  if (!forceRefresh && cachedResponse && Date.now() < cacheExpiry) {
    return cachedResponse;
  }

  // 1. Get current Gumm version from package.json
  let currentVersion = 'unknown';
  try {
    const pkgPath = join(process.cwd(), 'package.json');
    const pkgRaw = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    currentVersion = pkg.version || 'unknown';
  } catch {
    console.warn('[Updates] Could not read package.json');
  }

  // 2. Check latest Gumm version from GitHub releases
  let latestVersion = currentVersion;
  let hasGummUpdate = false;

  try {
    const config = useRuntimeConfig();
    const repoUrl = (config as any).repoUrl || 'gumm-ai/gumm';
    const repo = repoUrl.replace('https://github.com/', '').replace('.git', '');

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Gumm-Update-Checker',
    };

    const githubToken = (config as any).githubToken;
    if (githubToken) {
      headers['Authorization'] = `Bearer ${githubToken}`;
    }

    const response = await fetch(
      `https://api.github.com/repos/${repo}/releases/latest`,
      { headers },
    );

    if (response.ok) {
      const release = await response.json();
      latestVersion = release.tag_name?.replace(/^v/, '') || latestVersion;
      hasGummUpdate = compareVersions(latestVersion, currentVersion) > 0;
    } else {
      // Fallback: check package.json in main branch
      const pkgResponse = await fetch(
        `https://raw.githubusercontent.com/${repo}/main/package.json`,
        { headers },
      );
      if (pkgResponse.ok) {
        const remotePkg = await pkgResponse.json();
        latestVersion = remotePkg.version || latestVersion;
        hasGummUpdate = compareVersions(latestVersion, currentVersion) > 0;
      }
    }
  } catch (err) {
    console.warn('[Updates] Could not check Gumm version:', err);
  }

  // 3. Check module updates
  const moduleUpdates: ModuleUpdate[] = [];

  try {
    const installedModules = await useDrizzle()
      .select()
      .from(modulesTable)
      .where(sqliteEq(modulesTable.source, 'github'));

    for (const mod of installedModules) {
      if (!mod.sourceUrl) continue;

      try {
        // Extract repo from sourceUrl (https://github.com/owner/repo)
        const repo = mod.sourceUrl
          .replace('https://github.com/', '')
          .replace('.git', '');

        const remoteManifest = await fetchRemoteManifest(repo);

        if (compareVersions(remoteManifest.version, mod.version) > 0) {
          moduleUpdates.push({
            id: mod.id,
            name: mod.name,
            currentVersion: mod.version,
            latestVersion: remoteManifest.version,
            sourceUrl: mod.sourceUrl,
          });
        }
      } catch (err) {
        // Skip modules we can't check
        console.warn(`[Updates] Could not check module ${mod.id}:`, err);
      }
    }
  } catch (err) {
    console.warn('[Updates] Could not check module updates:', err);
  }

  const response: UpdatesResponse = {
    currentVersion,
    latestVersion,
    hasGummUpdate,
    moduleUpdatesCount: moduleUpdates.length,
    moduleUpdates,
    checkedAt: new Date().toISOString(),
  };

  // Cache the response
  cachedResponse = response;
  cacheExpiry = Date.now() + CACHE_TTL;

  return response;
});

/**
 * Compare two semver strings.
 * Returns:
 *   1 if a > b
 *   0 if a == b
 *  -1 if a < b
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map((n) => parseInt(n, 10) || 0);
  const partsB = b.split('.').map((n) => parseInt(n, 10) || 0);

  const maxLen = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLen; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  return 0;
}

// Alias for drizzle eq to avoid conflicts
import { eq as sqliteEq } from 'drizzle-orm';
