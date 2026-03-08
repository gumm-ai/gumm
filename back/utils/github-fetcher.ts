import { join } from 'node:path';
import { mkdir, rm, readFile, access, readdir, rename } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { extract } from 'tar';
import { ManifestSchema, type Manifest } from './module-types';

declare const process: NodeJS.Process;

const MODULES_DIR = join(process.cwd(), 'modules/user');
const TMP_DIR = join(process.cwd(), '.tmp-modules');

export interface InstallOptions {
  repo: string; // "owner/repo"
  ref?: string; // branch or tag, default "main"
  force?: boolean; // overwrite existing module
}

export interface InstallResult {
  module: Manifest;
  source: 'github';
  sourceUrl: string;
}

/**
 * Download and install a module from a public (or private with token) GitHub repo.
 *
 * Flow:
 *  1. Fetch tarball from GitHub API
 *  2. Extract to temp dir
 *  3. Validate manifest.json
 *  4. Validate entrypoint + exports
 *  5. Move to /modules/user/{id}/
 *  6. Return manifest for DB registration
 */
export async function installModuleFromGitHub(
  opts: InstallOptions,
): Promise<InstallResult> {
  const { repo, ref = 'main', force = false } = opts;
  const [owner, repoName] = repo.split('/');

  if (!owner || !repoName) {
    throw new Error(`Invalid repo format: "${repo}". Expected "owner/repo".`);
  }

  const sourceUrl = `https://github.com/${owner}/${repoName}`;
  const tarballUrl = `https://api.github.com/repos/${owner}/${repoName}/tarball/${ref}`;

  // Prepare temp directory
  await mkdir(TMP_DIR, { recursive: true });
  const tmpExtractDir = join(TMP_DIR, `${repoName}-${Date.now()}`);
  await mkdir(tmpExtractDir, { recursive: true });

  try {
    // 1. Download tarball
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Gumm-Module-Fetcher',
    };

    // Support optional GitHub token for private repos
    const config = useRuntimeConfig();
    const githubToken = (config as any).githubToken;
    if (githubToken) {
      headers['Authorization'] = `Bearer ${githubToken}`;
    }

    const response = await fetch(tarballUrl, {
      headers,
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(
        `GitHub API error (${response.status}): ${response.statusText}. URL: ${tarballUrl}`,
      );
    }

    // 2. Extract tarball
    const tarballPath = join(TMP_DIR, `${repoName}-${Date.now()}.tar.gz`);
    const body = response.body;
    if (!body) throw new Error('Empty response body from GitHub');

    // Write tarball to disk
    await pipeline(
      Readable.fromWeb(body as any),
      createWriteStream(tarballPath),
    );

    // Extract
    await extract({
      file: tarballPath,
      cwd: tmpExtractDir,
    });

    // GitHub tarballs extract into a folder like "owner-repo-sha/"
    // Find that root directory
    const extractedEntries = await readdir(tmpExtractDir);
    const rootDir = extractedEntries.find((e) => !e.startsWith('.'));
    if (!rootDir) {
      throw new Error('Could not find extracted module root directory');
    }

    const moduleSourceDir = join(tmpExtractDir, rootDir);

    // 3. Validate manifest.json exists
    const manifestPath = join(moduleSourceDir, 'manifest.json');
    try {
      await access(manifestPath);
    } catch {
      throw new Error(
        `manifest.json not found in repo "${repo}". Every Gumm module must have a manifest.json at its root.`,
      );
    }

    const rawManifest = await readFile(manifestPath, 'utf-8');
    let parsedManifest: any;
    try {
      parsedManifest = JSON.parse(rawManifest);
    } catch {
      throw new Error(`manifest.json in "${repo}" is not valid JSON.`);
    }

    // 4. Validate manifest with Zod (strict)
    const manifestResult = ManifestSchema.safeParse(parsedManifest);
    if (!manifestResult.success) {
      const errors = manifestResult.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid manifest.json in "${repo}":\n${errors}`);
    }

    const manifest = manifestResult.data;

    // 5. Validate entrypoint exists
    const entrypointPath = join(moduleSourceDir, manifest.entrypoint);
    try {
      await access(entrypointPath);
    } catch {
      throw new Error(
        `Entrypoint "${manifest.entrypoint}" declared in manifest not found in repo "${repo}".`,
      );
    }

    // 6. Validate entrypoint exports tools() and handler()
    try {
      const entryUrl = `${entrypointPath}?t=${Date.now()}`;
      const mod = await import(entryUrl);
      if (typeof mod.tools !== 'function') {
        throw new Error('Module must export a "tools" function');
      }
      if (typeof mod.handler !== 'function') {
        throw new Error('Module must export a "handler" function');
      }
    } catch (err: any) {
      throw new Error(
        `Entrypoint validation failed for "${repo}": ${err.message}`,
      );
    }

    // 7. Validate capabilities are supported
    const supportedCapabilities = [
      'fetch',
      'greet',
      'search',
      'compute',
      'transform',
      'notify',
    ];
    const unsupported = manifest.capabilities.filter(
      (c) => !supportedCapabilities.includes(c),
    );
    if (unsupported.length > 0) {
      throw new Error(
        `Unsupported capabilities: ${unsupported.join(', ')}. Supported: ${supportedCapabilities.join(', ')}`,
      );
    }

    // 8. Check for existing module
    const targetDir = join(MODULES_DIR, manifest.id);
    try {
      await access(targetDir);
      // Module exists
      if (!force) {
        throw new Error(
          `Module "${manifest.id}" already exists. Use force: true to overwrite.`,
        );
      }
      // Remove existing for force install
      await rm(targetDir, { recursive: true, force: true });
    } catch (err: any) {
      if (err.message?.includes('already exists')) throw err;
      // Directory doesn't exist, which is fine
    }

    // 9. Move to final location
    await mkdir(MODULES_DIR, { recursive: true });
    await rename(moduleSourceDir, targetDir);

    // Cleanup temp files
    await rm(tarballPath, { force: true });
    await rm(tmpExtractDir, { recursive: true, force: true });

    return {
      module: manifest,
      source: 'github',
      sourceUrl,
    };
  } catch (err) {
    // Cleanup on error
    await rm(tmpExtractDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

/**
 * Fetch the manifest.json from a remote GitHub repo without installing.
 * Useful for version comparison.
 */
export async function fetchRemoteManifest(
  repo: string,
  ref: string = 'main',
): Promise<Manifest> {
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    throw new Error(`Invalid repo format: "${repo}". Expected "owner/repo".`);
  }

  const url = `https://raw.githubusercontent.com/${owner}/${repoName}/${ref}/manifest.json`;

  const headers: Record<string, string> = {
    'User-Agent': 'Gumm-Module-Fetcher',
  };

  const config = useRuntimeConfig();
  const githubToken = (config as any).githubToken;
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(
      `Could not fetch manifest from ${url} (${response.status})`,
    );
  }

  const raw = await response.json();
  return ManifestSchema.parse(raw);
}

/**
 * Remove a module's files from modules/user/
 */
export async function removeModuleFiles(moduleId: string): Promise<void> {
  const targetDir = join(MODULES_DIR, moduleId);
  await rm(targetDir, { recursive: true, force: true });
}
