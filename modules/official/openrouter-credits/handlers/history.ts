import type { ModuleContext } from '../../../../back/utils/brain';
import { SNAPSHOT_KEY } from '../constants';
import { fetchBalance } from '../utils';

export async function handleHistory(
  ctx: ModuleContext,
  days: number,
): Promise<string> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const snapshots = await ctx.storage.list(SNAPSHOT_KEY, {
    since,
    limit: days + 1,
  });

  if (snapshots.length === 0) {
    return JSON.stringify({
      message: `No credit snapshots found for the last ${days} days. Snapshots are recorded daily at midnight.`,
    });
  }

  // Also get current balance for comparison with latest snapshot
  const apiKey = await ctx.brain.getConfig('openrouter.apiKey');
  let currentRemaining: number | null = null;
  if (apiKey) {
    const balance = await fetchBalance(apiKey);
    if (balance) currentRemaining = balance.total_credits - balance.total_usage;
  }

  const history = snapshots.map((s) => {
    const v = s.value as {
      remaining: number;
      total_credits: number;
      total_usage: number;
    };
    return {
      date: s.createdAt.toISOString().split('T')[0] ?? '',
      remaining: `$${v.remaining.toFixed(4)}`,
      total_usage: `$${v.total_usage.toFixed(4)}`,
    };
  });

  // Calculate daily consumption between snapshots
  const consumption: Array<{ date: string; consumed: string }> = [];
  for (let i = 0; i < history.length - 1; i++) {
    const currentSnapshot = snapshots[i];
    const previousSnapshot = snapshots[i + 1];
    const historyEntry = history[i];
    if (currentSnapshot && previousSnapshot && historyEntry) {
      const current = currentSnapshot.value as { remaining: number };
      const previous = previousSnapshot.value as { remaining: number };
      const consumed = previous.remaining - current.remaining;
      consumption.push({
        date: historyEntry.date,
        consumed: `$${consumed.toFixed(4)}`,
      });
    }
  }

  return JSON.stringify(
    {
      current_balance:
        currentRemaining !== null
          ? `$${currentRemaining.toFixed(4)}`
          : 'unavailable',
      snapshots: history,
      daily_consumption: consumption,
    },
    null,
    2,
  );
}
