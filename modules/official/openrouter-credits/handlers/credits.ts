import type { ModuleContext } from '../../../../back/utils/brain';
import { SNAPSHOT_KEY } from '../constants';
import { fetchBalance, fetchActivity } from '../utils';

export async function handleCredits(ctx: ModuleContext): Promise<string> {
  const apiKey = await ctx.brain.getConfig('openrouter.apiKey');
  if (!apiKey) {
    return JSON.stringify({ error: 'OpenRouter API key not configured.' });
  }

  const [balance, activity] = await Promise.all([
    fetchBalance(apiKey),
    fetchActivity(apiKey),
  ]);

  // Aggregate spending
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  if (weekStart > todayStart) weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let costToday = 0,
    costWeek = 0,
    costMonth = 0;

  for (const entry of activity) {
    const d = new Date(entry.created_at);
    const cost = entry.total_cost ?? 0;
    if (d >= todayStart) costToday += cost;
    if (d >= weekStart) costWeek += cost;
    if (d >= monthStart) costMonth += cost;
  }

  const remaining = balance
    ? balance.total_credits - balance.total_usage
    : null;

  // Fetch today's midnight snapshot for comparison
  let snapshotComparison: string | null = null;
  try {
    const snapshots = await ctx.storage.list(SNAPSHOT_KEY, {
      since: todayStart,
      limit: 1,
    });
    const firstSnapshot = snapshots[0];
    if (firstSnapshot) {
      const snap = firstSnapshot.value as { remaining: number };
      if (remaining !== null && snap.remaining) {
        const consumed = snap.remaining - remaining;
        snapshotComparison = `$${consumed.toFixed(4)} consumed since midnight (was $${snap.remaining.toFixed(4)} at 00:00)`;
      }
    }
  } catch {
    // Storage not available yet — ignore
  }

  const result: Record<string, any> = {
    balance: balance
      ? `$${remaining?.toFixed(4)} remaining out of $${balance.total_credits.toFixed(2)} total ($${balance.total_usage.toFixed(4)} used)`
      : 'Unable to fetch balance',
    spending: {
      today: `$${costToday.toFixed(4)}`,
      this_week: `$${costWeek.toFixed(4)}`,
      this_month: `$${costMonth.toFixed(4)}`,
    },
  };

  if (snapshotComparison) {
    result.consumption_since_midnight = snapshotComparison;
  }

  return JSON.stringify(result, null, 2);
}
