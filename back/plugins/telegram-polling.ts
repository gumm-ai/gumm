/**
 * Nitro Plugin — Telegram long-polling.
 *
 * When Telegram is enabled and no webhook URL is configured, this plugin
 * polls the Telegram Bot API for new messages using getUpdates (long-polling).
 *
 * This is the default mode for Tailscale / private network setups where the
 * server is not reachable from the public internet. No ports need to be exposed.
 *
 * The plugin also listens for brain config changes so it can start/stop
 * dynamically when Telegram is toggled from the dashboard.
 */
import { telegramGetUpdates, telegramDeleteWebhook } from '../utils/telegram';
import { processTelegramUpdate } from '../utils/telegram-handler';

let polling = false;
let stopRequested = false;

async function shouldPoll(): Promise<{
  enabled: boolean;
  token: string | null;
}> {
  try {
    // Check environment variable first (set by setup-server.sh)
    const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (envToken) {
      // Env-based config: always enabled, no webhook (since netbird/tailscale = private network)
      return { enabled: true, token: envToken };
    }

    // Fallback to brain config
    const brain = useBrain();
    await brain.ready();
    const enabled = await brain.getConfig('telegram.enabled');
    const token = await brain.getConfig('telegram.botToken');
    const webhookUrl = await brain.getConfig('telegram.webhookUrl');

    // Only poll when there's no webhook — webhook mode is handled by the HTTP endpoint
    if (webhookUrl) return { enabled: false, token: null };
    return {
      enabled: enabled === 'true' && !!token,
      token: token || null,
    };
  } catch {
    return { enabled: false, token: null };
  }
}

async function pollLoop() {
  if (polling) return;
  polling = true;
  stopRequested = false;
  console.log('[telegram-polling] Starting long-polling loop');

  let offset: number | undefined;

  while (!stopRequested) {
    try {
      const { enabled, token } = await shouldPoll();
      if (!enabled || !token) {
        console.log(
          '[telegram-polling] Telegram disabled or webhook set — stopping poll',
        );
        break;
      }

      // Ensure no stale webhook is registered (Telegram ignores getUpdates when a webhook exists)
      // This is done once at the start — the flag avoids doing it on every iteration
      if (offset === undefined) {
        try {
          await telegramDeleteWebhook(token);
          console.log('[telegram-polling] Cleared any existing webhook');
        } catch {
          // Ignore — may already be cleared
        }
      }

      const updates = await telegramGetUpdates(token, offset, 30);

      for (const update of updates) {
        offset = update.update_id + 1;
        try {
          await processTelegramUpdate(update);
        } catch (err: any) {
          console.error(
            `[telegram-polling] Error processing update ${update.update_id}:`,
            err.message,
          );
        }
      }
    } catch (err: any) {
      // Network errors, rate limits, etc. — wait and retry
      console.warn('[telegram-polling] Poll error:', err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  polling = false;
  console.log('[telegram-polling] Stopped');
}

function stopPolling() {
  stopRequested = true;
}

export default defineNitroPlugin(async () => {
  // Wait for DB / brain to be ready
  setTimeout(async () => {
    try {
      const { enabled } = await shouldPoll();
      if (enabled) {
        pollLoop();
      } else {
        console.log(
          '[telegram-polling] Skipped — Telegram disabled or webhook configured',
        );
      }
    } catch (err: any) {
      console.warn('[telegram-polling] Init error:', err.message);
    }

    // Listen for config changes to start/stop polling dynamically
    try {
      const brain = useBrain();
      await brain.ready();

      brain.events.on('telegram', async (event) => {
        if (
          event.type === 'bot.configured' ||
          event.type === 'bot.disconnected'
        ) {
          stopPolling();
          // Small delay to let config settle
          await new Promise((r) => setTimeout(r, 1000));
          const { enabled } = await shouldPoll();
          if (enabled) {
            pollLoop();
          }
        }
      });
    } catch {
      // Event bus not available — polling will just run in its initial state
    }
  }, 4000); // 4s — after brain & tailscale plugins init
});
