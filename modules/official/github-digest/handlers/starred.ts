import { ghFetch, formatRelative } from '../utils';

/**
 * List starred repositories
 */
export async function handleStarred(
  token: string,
  args: Record<string, any>,
): Promise<string> {
  const maxResults = Math.min(50, Math.max(1, Number(args.maxResults) || 15));

  const data = await ghFetch(token, '/user/starred', {
    per_page: maxResults.toString(),
    sort: 'created',
    direction: 'desc',
  });

  const repos = (data as any[]).map((r: any) => ({
    name: r.full_name,
    description: r.description,
    language: r.language,
    stars: r.stargazers_count,
    url: r.html_url,
    updatedAt: formatRelative(r.updated_at),
  }));

  return JSON.stringify({ starred: repos, count: repos.length }, null, 2);
}
