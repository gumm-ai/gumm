import { ghFetch, formatRelative } from '../utils';

/**
 * Get recent activity for a repository
 */
export async function handleRepoActivity(
  token: string,
  args: Record<string, any>,
): Promise<string> {
  const maxResults = Math.min(50, Math.max(1, Number(args.maxResults) || 15));
  const repo = args.repo as string;
  const [owner, repoName] = repo.split('/');

  if (!owner || !repoName) {
    return JSON.stringify({
      error: 'Invalid repo format. Use "owner/repo".',
    });
  }

  const data = await ghFetch(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/events`,
    { per_page: maxResults.toString() },
  );

  const events = (data as any[]).map((e: any) => {
    const event: Record<string, any> = {
      type: e.type,
      actor: e.actor?.login,
      createdAt: formatRelative(e.created_at),
    };

    // Add relevant payload details based on event type
    switch (e.type) {
      case 'PushEvent':
        event.commits = e.payload?.commits?.length ?? 0;
        event.ref = e.payload?.ref?.replace('refs/heads/', '');
        break;
      case 'PullRequestEvent':
        event.action = e.payload?.action;
        event.title = e.payload?.pull_request?.title;
        event.number = e.payload?.pull_request?.number;
        break;
      case 'IssuesEvent':
        event.action = e.payload?.action;
        event.title = e.payload?.issue?.title;
        event.number = e.payload?.issue?.number;
        break;
      case 'ReleaseEvent':
        event.action = e.payload?.action;
        event.tag = e.payload?.release?.tag_name;
        break;
      case 'CreateEvent':
        event.refType = e.payload?.ref_type;
        event.ref = e.payload?.ref;
        break;
      case 'DeleteEvent':
        event.refType = e.payload?.ref_type;
        event.ref = e.payload?.ref;
        break;
      case 'IssueCommentEvent':
        event.action = e.payload?.action;
        event.issueTitle = e.payload?.issue?.title;
        event.issueNumber = e.payload?.issue?.number;
        break;
      case 'PullRequestReviewEvent':
        event.action = e.payload?.action;
        event.prTitle = e.payload?.pull_request?.title;
        event.state = e.payload?.review?.state;
        break;
    }

    return event;
  });

  return JSON.stringify({ repo, events, count: events.length }, null, 2);
}
