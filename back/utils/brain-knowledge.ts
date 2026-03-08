/**
 * Brain Knowledge — Self-evolving knowledge base.
 *
 * This module allows the Brain to create, update, and organize its own
 * knowledge files. These files are automatically loaded into the system
 * prompt to provide persistent learning across conversations.
 *
 * Storage: Files are stored in .data/brain-knowledge/ which is a persistent
 * Docker volume — changes survive container restarts.
 *
 * Security constraints:
 * - All files live in .data/brain-knowledge/ (isolated, persistent)
 * - Maximum file size: 10KB per file
 * - Maximum total files: 50
 * - No executable code or secrets allowed
 * - Content is validated before writing
 */
import {
  readFile,
  writeFile,
  readdir,
  unlink,
  mkdir,
  stat,
} from 'node:fs/promises';
import { resolve, join, basename, extname } from 'node:path';
import { existsSync } from 'node:fs';

// Configuration
const MAX_FILE_SIZE = 10 * 1024; // 10KB per file
const MAX_TOTAL_FILES = 50;
const MAX_CONTENT_LENGTH = 8000; // Characters
const ALLOWED_CATEGORIES = [
  'procedures',
  'insights',
  'projects',
  'sources',
  'corrections',
] as const;

export type KnowledgeCategory = (typeof ALLOWED_CATEGORIES)[number];

/**
 * Resolve the brain knowledge directory path.
 * Uses .data/ which is a persistent Docker volume.
 */
function knowledgeDir(): string {
  return resolve(process.cwd(), '.data', 'brain-knowledge');
}

/**
 * Resolve the path for a specific category directory.
 */
function categoryDir(category: KnowledgeCategory): string {
  return resolve(knowledgeDir(), category);
}

/**
 * Ensure the knowledge directory structure exists.
 */
export async function ensureKnowledgeStructure(): Promise<void> {
  const baseDir = knowledgeDir();

  if (!existsSync(baseDir)) {
    await mkdir(baseDir, { recursive: true });
  }

  // Create category subdirectories
  for (const cat of ALLOWED_CATEGORIES) {
    const catDir = categoryDir(cat);
    if (!existsSync(catDir)) {
      await mkdir(catDir, { recursive: true });
    }
  }
}

/**
 * Validate content before writing.
 * Returns null if valid, error message if invalid.
 */
function validateContent(content: string): string | null {
  // Check length
  if (content.length > MAX_CONTENT_LENGTH) {
    return `Content too long (${content.length} chars, max ${MAX_CONTENT_LENGTH})`;
  }

  // Check for potential secrets (very basic heuristic)
  const secretPatterns = [
    /api[_-]?key\s*[:=]\s*["']?[a-zA-Z0-9]{20,}/i,
    /password\s*[:=]\s*["']?[^\s"']{8,}/i,
    /bearer\s+[a-zA-Z0-9._-]{20,}/i,
    /sk-[a-zA-Z0-9]{20,}/i, // OpenAI-style keys
    /ghp_[a-zA-Z0-9]{36}/i, // GitHub tokens
  ];

  for (const pattern of secretPatterns) {
    if (pattern.test(content)) {
      return 'Content appears to contain sensitive credentials';
    }
  }

  // Check for executable code patterns (very basic)
  const dangerousPatterns = [
    /<script[\s>]/i,
    /eval\s*\(/,
    /exec\s*\(/,
    /import\s+os/,
    /subprocess\./,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      return 'Content contains potentially dangerous code patterns';
    }
  }

  return null; // Valid
}

/**
 * Sanitize a filename to prevent path traversal.
 */
function sanitizeFilename(name: string): string {
  // Remove path separators and dangerous characters
  return name
    .replace(/[\/\\:*?"<>|]/g, '-')
    .replace(/\.{2,}/g, '.') // No ..
    .replace(/^\.+/, '') // No leading dots
    .slice(0, 50) // Max 50 chars
    .toLowerCase()
    .replace(/\s+/g, '-');
}

/**
 * Count total knowledge files.
 */
async function countTotalFiles(): Promise<number> {
  let total = 0;

  for (const cat of ALLOWED_CATEGORIES) {
    const catDir = categoryDir(cat);
    if (!existsSync(catDir)) continue;

    const files = await readdir(catDir);
    total += files.filter((f) => f.endsWith('.md')).length;
  }

  return total;
}

/**
 * Knowledge entry metadata.
 */
export interface KnowledgeEntry {
  category: KnowledgeCategory;
  slug: string;
  title: string;
  content: string;
  updatedAt: Date;
  size: number;
}

/**
 * Save a knowledge entry.
 * Creates or updates a markdown file in the appropriate category.
 */
export async function saveKnowledge(
  category: KnowledgeCategory,
  slug: string,
  title: string,
  content: string,
): Promise<{ success: boolean; message: string; path?: string }> {
  // Validate category
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return {
      success: false,
      message: `Invalid category. Allowed: ${ALLOWED_CATEGORIES.join(', ')}`,
    };
  }

  // Sanitize slug
  const safeSlug = sanitizeFilename(slug);
  if (!safeSlug) {
    return { success: false, message: 'Invalid slug' };
  }

  // Build full content with title
  const fullContent = `# ${title}\n\n${content}\n`;

  // Validate content
  const validationError = validateContent(fullContent);
  if (validationError) {
    return { success: false, message: validationError };
  }

  // Check file size
  if (Buffer.byteLength(fullContent, 'utf-8') > MAX_FILE_SIZE) {
    return {
      success: false,
      message: `File too large (max ${MAX_FILE_SIZE / 1024}KB)`,
    };
  }

  // Ensure structure exists
  await ensureKnowledgeStructure();

  // Check if this is an update or new file
  const filePath = resolve(categoryDir(category), `${safeSlug}.md`);

  // Hard path-traversal guard: the resolved path MUST be directly inside the
  // expected category directory, even if sanitizeFilename missed something.
  const expectedBase = categoryDir(category) + '/';
  if (!filePath.startsWith(expectedBase)) {
    return { success: false, message: 'Invalid file path' };
  }

  const isUpdate = existsSync(filePath);

  // If new file, check total count
  if (!isUpdate) {
    const totalFiles = await countTotalFiles();
    if (totalFiles >= MAX_TOTAL_FILES) {
      return {
        success: false,
        message: `Maximum knowledge files reached (${MAX_TOTAL_FILES}). Delete some old entries first.`,
      };
    }
  }

  // Write file
  try {
    await writeFile(filePath, fullContent, 'utf-8');
    return {
      success: true,
      message: isUpdate
        ? `Updated: ${category}/${safeSlug}`
        : `Created: ${category}/${safeSlug}`,
      path: `brain/knowledge/${category}/${safeSlug}.md`,
    };
  } catch (err: any) {
    return { success: false, message: `Write failed: ${err.message}` };
  }
}

/**
 * Delete a knowledge entry.
 */
export async function deleteKnowledge(
  category: KnowledgeCategory,
  slug: string,
): Promise<{ success: boolean; message: string }> {
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return { success: false, message: 'Invalid category' };
  }

  const safeSlug = sanitizeFilename(slug);
  const filePath = resolve(categoryDir(category), `${safeSlug}.md`);

  // Hard path-traversal guard
  const expectedBase = categoryDir(category) + '/';
  if (!filePath.startsWith(expectedBase)) {
    return { success: false, message: 'Invalid file path' };
  }

  if (!existsSync(filePath)) {
    return { success: false, message: 'Knowledge entry not found' };
  }

  try {
    await unlink(filePath);
    return { success: true, message: `Deleted: ${category}/${safeSlug}` };
  } catch (err: any) {
    return { success: false, message: `Delete failed: ${err.message}` };
  }
}

/**
 * List all knowledge entries.
 */
export async function listKnowledge(
  category?: KnowledgeCategory,
): Promise<KnowledgeEntry[]> {
  await ensureKnowledgeStructure();

  const entries: KnowledgeEntry[] = [];
  const categories = category ? [category] : ALLOWED_CATEGORIES;

  for (const cat of categories) {
    const catDir = categoryDir(cat);
    if (!existsSync(catDir)) continue;

    const files = await readdir(catDir);

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = resolve(catDir, file);
      try {
        const content = await readFile(filePath, 'utf-8');
        const stats = await stat(filePath);

        // Extract title from first line
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch?.[1] ?? basename(file, '.md');

        entries.push({
          category: cat,
          slug: basename(file, '.md'),
          title,
          content: content.replace(/^#\s+.+\n\n?/, ''), // Remove title line
          updatedAt: stats.mtime,
          size: stats.size,
        });
      } catch {
        // Skip unreadable files
      }
    }
  }

  // Sort by most recently updated
  return entries.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * Get a specific knowledge entry.
 */
export async function getKnowledge(
  category: KnowledgeCategory,
  slug: string,
): Promise<KnowledgeEntry | null> {
  const safeSlug = sanitizeFilename(slug);
  const filePath = resolve(categoryDir(category), `${safeSlug}.md`);

  if (!existsSync(filePath)) return null;

  try {
    const content = await readFile(filePath, 'utf-8');
    const stats = await stat(filePath);
    const titleMatch = content.match(/^#\s+(.+)$/m);

    return {
      category,
      slug: safeSlug,
      title: titleMatch?.[1] ?? safeSlug,
      content: content.replace(/^#\s+.+\n\n?/, ''),
      updatedAt: stats.mtime,
      size: stats.size,
    };
  } catch {
    return null;
  }
}

/**
 * Build a formatted block of all knowledge for injection into the system prompt.
 * Groups entries by category with a compact format.
 */
export async function buildKnowledgeBlock(): Promise<string | null> {
  const entries = await listKnowledge();
  if (entries.length === 0) return null;

  const categoryLabels: Record<KnowledgeCategory, string> = {
    procedures: '📋 Procedures (How-To)',
    insights: '💡 Insights & Learnings',
    projects: '🚀 Projects Context',
    sources: '📚 Sources & References',
    corrections: '✏️ Corrections & Clarifications',
  };

  // Group by category
  const grouped = new Map<KnowledgeCategory, KnowledgeEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.category) || [];
    list.push(entry);
    grouped.set(entry.category, list);
  }

  const lines: string[] = [];

  for (const [cat, items] of grouped) {
    lines.push(`### ${categoryLabels[cat]}`);
    for (const item of items) {
      // Compact format: title + first 200 chars of content
      const preview = item.content.slice(0, 200).replace(/\n/g, ' ');
      lines.push(
        `- **${item.title}**: ${preview}${item.content.length > 200 ? '...' : ''}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get knowledge statistics.
 */
export async function getKnowledgeStats(): Promise<{
  totalFiles: number;
  totalSize: number;
  byCategory: Record<KnowledgeCategory, number>;
  recentUpdates: Array<{
    category: KnowledgeCategory;
    slug: string;
    title: string;
    updatedAt: Date;
  }>;
}> {
  const entries = await listKnowledge();

  const byCategory: Record<KnowledgeCategory, number> = {
    procedures: 0,
    insights: 0,
    projects: 0,
    sources: 0,
    corrections: 0,
  };

  let totalSize = 0;

  for (const entry of entries) {
    byCategory[entry.category]++;
    totalSize += entry.size;
  }

  return {
    totalFiles: entries.length,
    totalSize,
    byCategory,
    recentUpdates: entries.slice(0, 5).map((e) => ({
      category: e.category,
      slug: e.slug,
      title: e.title,
      updatedAt: e.updatedAt,
    })),
  };
}
