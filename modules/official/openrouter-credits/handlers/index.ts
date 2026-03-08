import type { ModuleContext } from '../../../../back/utils/brain';
import { handleCredits } from './credits';
import { handleHistory } from './history';
import { handleSnapshot } from './snapshot';

export async function routeHandler(
  toolName: string,
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  switch (toolName) {
    case 'openrouter_credits':
      return handleCredits(ctx);

    case 'openrouter_credits_history':
      return handleHistory(ctx, args.days ?? 7);

    case 'snapshot_credits':
      return handleSnapshot(ctx);

    default:
      return 'Unknown tool';
  }
}
