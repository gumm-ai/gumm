import type { ModuleContext } from '../../../back/utils/brain';
import { GITHUB_API } from './constants';

// ─── Auth Utilities ─────────────────────────────────────────────────────────

/**
 * Get GitHub Personal Access Token from brain config
 */
export async function getToken(ctx: ModuleContext): Promise<string> {
  const token = await ctx.brain.getConfig('api.github.apiKey');

  if (!token) {
    throw new Error(
      'GitHub not configured. Please add a Personal Access Token in the APIs page under GitHub.',
    );
  }

  return token;
}

/**
 * Make an authenticated request to the GitHub API
 */
export async function ghFetch(
  token: string,
  path: string,
  params?: Record<string, string>,
): Promise<any> {
  const url = new URL(`${GITHUB_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Gumm-GitHub-Digest',
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${err}`);
  }

  return res.json();
}

// ─── Formatters ─────────────────────────────────────────────────────────────

/**
 * Format a date as relative time (e.g., "5m ago", "2h ago", "3d ago")
 */
export function formatRelative(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
