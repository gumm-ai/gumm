import { ghFetch, formatRelative } from '../utils';

/**
 * List GitHub notifications
 */
export async function handleNotifications(
  token: string,
  args: Record<string, any>,
): Promise<string> {
  const maxResults = Math.min(50, Math.max(1, Number(args.maxResults) || 20));
  const all = args.all === true;

  const data = await ghFetch(token, '/notifications', {
    all: String(all),
    per_page: maxResults.toString(),
  });

  if (!Array.isArray(data) || data.length === 0) {
    return JSON.stringify({
      message: all
        ? 'No notifications found.'
        : "No unread notifications. You're all caught up!",
    });
  }

  const notifications = data.map((n: any) => ({
    title: n.subject?.title,
    type: n.subject?.type,
    reason: n.reason,
    repo: n.repository?.full_name,
    unread: n.unread,
    updatedAt: formatRelative(n.updated_at),
    url: n.subject?.url,
  }));

  return JSON.stringify(
    { notifications, count: notifications.length },
    null,
    2,
  );
}
