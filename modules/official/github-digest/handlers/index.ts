import { handleNotifications } from './notifications';
import { handlePullRequests } from './pull-requests';
import { handleIssues } from './issues';
import { handleRepoActivity } from './activity';
import { handleStarred } from './starred';

export {
  handleNotifications,
  handlePullRequests,
  handleIssues,
  handleRepoActivity,
  handleStarred,
};

/**
 * Main handler router for GitHub Digest module
 */
export async function routeHandler(
  toolName: string,
  args: Record<string, any>,
  token: string,
): Promise<string> {
  switch (toolName) {
    case 'github_notifications':
      return handleNotifications(token, args);
    case 'github_pull_requests':
      return handlePullRequests(token, args);
    case 'github_issues':
      return handleIssues(token, args);
    case 'github_repo_activity':
      return handleRepoActivity(token, args);
    case 'github_starred':
      return handleStarred(token, args);
    default:
      return 'Unknown tool';
  }
}
