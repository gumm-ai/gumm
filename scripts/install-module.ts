#!/usr/bin/env bun
/**
 * CLI tool for installing a Gumm module from GitHub.
 *
 * Usage:
 *   bun run module:install owner/repo [--ref=main] [--force]
 *
 * Examples:
 *   bun run module:install florian/gumm-weather
 *   bun run module:install florian/gumm-search --ref=v2.0
 *   bun run module:install florian/gumm-weather --force
 */
import { join } from 'node:path';
import {
  mkdir,
  rm,
  readFile,
  access,
  readdir,
  rename,
  writeFile,
} from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { extract } from 'tar';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import * as z from 'zod';
import {
  modules as modulesTable,
  events,
  apiConnections,
} from '../back/db/schema';

// -- Re-declare schemas locally to avoid Nitro auto-import issues --
const ConfigFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  placeholder: z.string().default(''),
  type: z.enum(['string', 'number', 'boolean', 'url']).default('string'),
  secret: z.boolean().default(false),
  required: z.boolean().default(true),
});

const ConfigRequirementSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  provider: z.string().default('custom'),
  authType: z
    .enum(['oauth2', 'api_key', 'bearer', 'basic', 'none'])
    .default('api_key'),
  fields: z.array(ConfigFieldSchema).min(1),
  icon: z.string().optional(),
  color: z.string().optional(),
  helpSteps: z.array(z.string()).optional(),
  helpUrl: z.string().optional(),
  helpLinks: z
    .array(
      z.object({
        label: z.string(),
        url: z.string(),
      }),
    )
    .optional(),
});

const ManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().default('1.0.0'),
  description: z.string().default(''),
  entrypoint: z.string().default('index.ts'),
  capabilities: z.array(z.string()).default([]),
  schema: z.record(z.string(), z.any()).optional(),
  configRequirements: z.array(ConfigRequirementSchema).default([]),
});

const MODULES_DIR = join(process.cwd(), 'modules/user');
const TMP_DIR = join(process.cwd(), '.tmp-modules');
const DB_PATH = join(
  process.cwd(),
  '.data/hub/d1/miniflare-D1DatabaseObject/db.sqlite',
);

// Parse CLI args
const args = process.argv.slice(2);
const repo = args.find((a) => !a.startsWith('--'));
const ref = args.find((a) => a.startsWith('--ref='))?.split('=')[1] || 'main';
const force = args.includes('--force');

if (!repo) {
  console.error(
    'Usage: bun run module:install <owner/repo> [--ref=main] [--force]',
  );
  console.error('');
  console.error('Examples:');
  console.error('  bun run module:install florian/gumm-weather');
  console.error('  bun run module:install florian/gumm-search --ref=v2.0');
  console.error('  bun run module:install florian/gumm-weather --force');
  process.exit(1);
}

const [owner, repoName] = repo.split('/');
if (!owner || !repoName) {
  console.error(`Invalid repo format: "${repo}". Expected "owner/repo".`);
  process.exit(1);
}

async function main() {
  console.log(`\n📦 Installing module from GitHub: ${repo} (ref: ${ref})`);
  if (force) console.log('⚡ Force mode enabled');

  const sourceUrl = `https://github.com/${owner}/${repoName}`;
  const tarballUrl = `https://api.github.com/repos/${owner}/${repoName}/tarball/${ref}`;

  // Prepare temp directory
  await mkdir(TMP_DIR, { recursive: true });
  const tmpExtractDir = join(TMP_DIR, `${repoName}-${Date.now()}`);
  await mkdir(tmpExtractDir, { recursive: true });

  try {
    // 1. Download tarball
    console.log('⬇️  Downloading tarball...');
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Gumm-Module-Fetcher',
    };

    // Optional GitHub token from env
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const response = await fetch(tarballUrl, { headers, redirect: 'follow' });
    if (!response.ok) {
      throw new Error(
        `GitHub API error (${response.status}): ${response.statusText}`,
      );
    }

    const tarballPath = join(TMP_DIR, `${repoName}-${Date.now()}.tar.gz`);
    const body = response.body;
    if (!body) throw new Error('Empty response body from GitHub');

    await pipeline(
      Readable.fromWeb(body as any),
      createWriteStream(tarballPath),
    );
    console.log('✓ Downloaded');

    // 2. Extract
    console.log('📂 Extracting...');
    await extract({ file: tarballPath, cwd: tmpExtractDir });

    const extractedEntries = await readdir(tmpExtractDir);
    const rootDir = extractedEntries.find((e) => !e.startsWith('.'));
    if (!rootDir) throw new Error('Could not find extracted root directory');

    const moduleSourceDir = join(tmpExtractDir, rootDir);

    // 3. Validate manifest
    console.log('🔍 Validating manifest...');
    const manifestPath = join(moduleSourceDir, 'manifest.json');
    try {
      await access(manifestPath);
    } catch {
      throw new Error('manifest.json not found in repo');
    }

    const rawManifest = await readFile(manifestPath, 'utf-8');
    const parsedManifest = JSON.parse(rawManifest);
    const manifestResult = ManifestSchema.safeParse(parsedManifest);

    if (!manifestResult.success) {
      const errors = manifestResult.error.issues
        .map((i: any) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid manifest.json:\n${errors}`);
    }

    const manifest = manifestResult.data;
    console.log(
      `✓ Module: ${manifest.name} v${manifest.version} (${manifest.id})`,
    );

    // 4. Validate entrypoint
    const entrypointPath = join(moduleSourceDir, manifest.entrypoint);
    try {
      await access(entrypointPath);
    } catch {
      throw new Error(`Entrypoint "${manifest.entrypoint}" not found`);
    }

    // 5. Check exports
    console.log('⚙️  Validating exports...');
    const mod = await import(`${entrypointPath}?t=${Date.now()}`);
    if (typeof mod.tools !== 'function') {
      throw new Error('Module missing "tools" export');
    }
    if (typeof mod.handler !== 'function') {
      throw new Error('Module missing "handler" export');
    }
    console.log('✓ Exports valid');

    // 6. Move to final location
    const targetDir = join(MODULES_DIR, manifest.id);
    try {
      await access(targetDir);
      if (!force) {
        throw new Error(
          `Module "${manifest.id}" already exists. Use --force to overwrite.`,
        );
      }
      await rm(targetDir, { recursive: true, force: true });
    } catch (err: any) {
      if (err.message?.includes('already exists')) throw err;
    }

    await mkdir(MODULES_DIR, { recursive: true });
    await rename(moduleSourceDir, targetDir);
    console.log(`✓ Installed to modules/user/${manifest.id}/`);

    // 7. Register in DB
    console.log('💾 Registering in database...');
    const client = createClient({ url: `file:${DB_PATH}` });
    const db = drizzle(client);
    const now = new Date();

    const existing = await db
      .select()
      .from(modulesTable)
      .where(eq(modulesTable.id, manifest.id))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(modulesTable)
        .set({
          name: manifest.name,
          version: manifest.version,
          description: manifest.description || '',
          source: 'github',
          sourceUrl: sourceUrl,
          entrypoint: manifest.entrypoint,
          capabilities: JSON.stringify(manifest.capabilities),
          schema: manifest.schema ? JSON.stringify(manifest.schema) : null,
          status: 'active',
          error: null,
          updatedAt: now,
        })
        .where(eq(modulesTable.id, manifest.id));
    } else {
      await db.insert(modulesTable).values({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description || '',
        source: 'github',
        sourceUrl: sourceUrl,
        entrypoint: manifest.entrypoint,
        capabilities: JSON.stringify(manifest.capabilities),
        schema: manifest.schema ? JSON.stringify(manifest.schema) : null,
        status: 'active',
        installedAt: now,
        updatedAt: now,
      });
    }

    // Emit event
    await db.insert(events).values({
      source: 'brain',
      type: 'module.installed',
      payload: JSON.stringify({
        id: manifest.id,
        version: manifest.version,
        source: 'github',
        repo,
      }),
      createdAt: now,
    });

    // 8. Sync config requirements (create API connection placeholders)
    if (manifest.configRequirements && manifest.configRequirements.length > 0) {
      console.log('🔧 Setting up config requirements...');
      for (const req of manifest.configRequirements) {
        const connectionId = `module-${manifest.id}-${req.id}`;

        const [existingConn] = await db
          .select()
          .from(apiConnections)
          .where(eq(apiConnections.id, connectionId))
          .limit(1);

        if (!existingConn) {
          // Create new connection with empty placeholder values
          const initialConfig: Record<string, any> = {
            _moduleId: manifest.id,
            _configId: req.id,
            _fields: req.fields,
            _helpSteps: req.helpSteps,
            _helpUrl: req.helpUrl,
            _helpLinks: req.helpLinks,
            _icon: req.icon,
            _color: req.color,
            _description: req.description,
          };

          // Initialize empty values for each field
          for (const field of req.fields) {
            initialConfig[field.key] = '';
          }

          await db.insert(apiConnections).values({
            id: connectionId,
            name: req.name,
            provider: req.provider || 'custom',
            authType: req.authType || 'api_key',
            config: JSON.stringify(initialConfig),
            status: 'disconnected',
            createdAt: now,
            updatedAt: now,
          });

          console.log(`  ✓ Created config: ${connectionId}`);
        } else {
          console.log(`  ○ Config exists: ${connectionId}`);
        }
      }
    }

    client.close();
    console.log('✓ Registered in DB');

    // Cleanup
    await rm(tarballPath, { force: true });
    await rm(tmpExtractDir, { recursive: true, force: true });

    console.log(`\n✅ Module "${manifest.name}" installed successfully!`);
    console.log(`   ID: ${manifest.id}`);
    console.log(`   Version: ${manifest.version}`);
    console.log(`   Source: github (${sourceUrl})`);
    console.log('');
  } catch (err: any) {
    await rm(tmpExtractDir, { recursive: true, force: true }).catch(() => {});
    console.error(`\n❌ Installation failed: ${err.message}`);
    process.exit(1);
  }
}

main();
