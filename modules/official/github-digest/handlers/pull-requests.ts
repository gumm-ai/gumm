import { ghFetch, formatRelative } from '../utils';

/**
 * List pull requests
 */
export async function handlePullRequests(
  token: string,
  args: Record<string, any>,
): Promise<string> {
  const maxResults = Math.min(50, Math.max(1, Number(args.maxResults) || 15));
  const state = args.state ?? 'open';
  const filter = args.filter ?? 'all';
  const repo = args.repo as string | undefined;

  if (repo) {
    // Fetch PRs for a specific repo
    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) {
      return JSON.stringify({
        error: 'Invalid repo format. Use "owner/repo".',
      });
    }

    const data = await ghFetch(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/pulls`,
      { state, per_page: maxResults.toString() },
    );

    const prs = (data as any[]).map((pr: any) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      author: pr.user?.login,
      draft: pr.draft,
      createdAt: formatRelative(pr.created_at),
      updatedAt: formatRelative(pr.updated_at),
      url: pr.html_url,
      reviewers: pr.requested_reviewers?.map((r: any) => r.login) ?? [],
    }));

    return JSON.stringify(
      { repo, pullRequests: prs, count: prs.length },
      null,
      2,
    );
  }

  // Search across repos using the search API
  const queries: string[] = [];
  if (filter === 'authored' || filter === 'all') {
    queries.push(`is:pr is:${state === 'all' ? 'open' : state} author:@me`);
  }
  if (filter === 'review-requested' || filter === 'all') {
    queries.push(
      `is:pr is:${state === 'all' ? 'open' : state} review-requested:@me`,
    );
  }

  const allPrs: any[] = [];
  const seen = new Set<number>();

  for (const q of queries) {
    const data = await ghFetch(token, '/search/issues', {
      q,
      per_page: maxResults.toString(),
      sort: 'updated',
      order: 'desc',
    });

    for (const item of data.items ?? []) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        allPrs.push({
          number: item.number,
          title: item.title,
          state: item.state,
          author: item.user?.login,
          repo: item.repository_url?.split('/').slice(-2).join('/'),
          createdAt: formatRelative(item.created_at),
          updatedAt: formatRelative(item.updated_at),
          url: item.html_url,
        });
      }
    }
  }

  const limited = allPrs.slice(0, maxResults);
  return JSON.stringify(
    { pullRequests: limited, count: limited.length },
    null,
    2,
  );
}
