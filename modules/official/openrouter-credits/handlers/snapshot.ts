import type { ModuleContext } from '../../../../back/utils/brain';
import { SNAPSHOT_KEY } from '../constants';
import { fetchBalance } from '../utils';

export async function handleSnapshot(ctx: ModuleContext): Promise<string> {
  const apiKey = await ctx.brain.getConfig('openrouter.apiKey');
  if (!apiKey) {
    ctx.log.warn('Snapshot skipped: OpenRouter API key not configured');
    return 'Skipped: no API key';
  }

  const balance = await fetchBalance(apiKey);
  if (!balance) {
    ctx.log.warn('Snapshot skipped: could not fetch balance');
    return 'Skipped: API error';
  }

  const remaining = balance.total_credits - balance.total_usage;

  await ctx.storage.store(SNAPSHOT_KEY, {
    remaining,
    total_credits: balance.total_credits,
    total_usage: balance.total_usage,
  });

  ctx.log.info(`Credits snapshot saved: $${remaining.toFixed(4)} remaining`);
  return `Snapshot saved: $${remaining.toFixed(4)} remaining`;
}
