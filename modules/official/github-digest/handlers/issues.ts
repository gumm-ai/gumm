import { ghFetch, formatRelative } from '../utils';

/**
 * List GitHub issues
 */
export async function handleIssues(
  token: string,
  args: Record<string, any>,
): Promise<string> {
  const maxResults = Math.min(50, Math.max(1, Number(args.maxResults) || 15));
  const state = args.state ?? 'open';
  const repo = args.repo as string | undefined;

  if (repo) {
    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) {
      return JSON.stringify({
        error: 'Invalid repo format. Use "owner/repo".',
      });
    }

    const data = await ghFetch(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/issues`,
      { state, per_page: maxResults.toString() },
    );

    // The issues API also returns PRs, filter them out
    const issues = (data as any[])
      .filter((i: any) => !i.pull_request)
      .map((i: any) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        author: i.user?.login,
        assignees: i.assignees?.map((a: any) => a.login) ?? [],
        labels: i.labels?.map((l: any) => l.name) ?? [],
        createdAt: formatRelative(i.created_at),
        updatedAt: formatRelative(i.updated_at),
        url: i.html_url,
        comments: i.comments,
      }));

    return JSON.stringify({ repo, issues, count: issues.length }, null, 2);
  }

  // Search across repos for issues assigned to the user
  const data = await ghFetch(token, '/search/issues', {
    q: `is:issue is:${state === 'all' ? 'open' : state} assignee:@me`,
    per_page: maxResults.toString(),
    sort: 'updated',
    order: 'desc',
  });

  const issues = (data.items ?? []).map((i: any) => ({
    number: i.number,
    title: i.title,
    state: i.state,
    repo: i.repository_url?.split('/').slice(-2).join('/'),
    labels: i.labels?.map((l: any) => l.name) ?? [],
    createdAt: formatRelative(i.created_at),
    updatedAt: formatRelative(i.updated_at),
    url: i.html_url,
    comments: i.comments,
  }));

  return JSON.stringify({ issues, count: issues.length }, null, 2);
}
