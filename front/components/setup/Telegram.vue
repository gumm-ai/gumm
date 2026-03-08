<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  form: any;
  telegramBotInfo: { username: string; first_name: string } | null;
  networkMode?: string;
}>();

const emit = defineEmits<{
  (
    e: 'update:telegramBotInfo',
    val: { username: string; first_name: string } | null,
  ): void;
}>();

// NetBird/Tailscale users don't need webhook (uses polling instead)
const needsWebhook = computed(
  () => props.networkMode !== 'netbird' && props.networkMode !== 'tailscale',
);

const telegramValidating = ref(false);
const telegramError = ref('');

async function validateTelegramToken() {
  const token = props.form.telegram.botToken.trim();
  if (!token) return;
  telegramValidating.value = true;
  telegramError.value = '';
  emit('update:telegramBotInfo', null);

  try {
    const res = await $fetch<any>(`https://api.telegram.org/bot${token}/getMe`);
    if (res.ok) {
      emit('update:telegramBotInfo', res.result);
    } else {
      telegramError.value = 'Invalid token';
    }
  } catch {
    telegramError.value = 'Could not validate token';
  } finally {
    telegramValidating.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h2
        class="text-base font-semibold text-gumm-text flex items-center gap-2"
      >
        <Icon name="lucide:send" class="h-4 w-4 text-sky-400" />
        Telegram Bot
      </h2>
      <p class="mt-1 text-xs text-gumm-muted">
        Optionally connect a Telegram bot. Create one via
        <a
          href="https://t.me/BotFather"
          target="_blank"
          class="text-gumm-accent hover:underline"
          >@BotFather</a
        >.
      </p>
    </div>

    <div class="space-y-3">
      <div>
        <label class="mb-1 block text-xs text-gumm-muted">Bot Token</label>
        <div class="flex gap-2">
          <input
            v-model="form.telegram.botToken"
            type="password"
            placeholder="123456:ABC-DEF..."
            class="flex-1 rounded-md border border-gumm-border bg-gumm-bg px-3 py-2 text-sm text-gumm-text placeholder-gumm-muted outline-none transition-colors focus:border-gumm-border-hover focus:ring-1 focus:ring-gumm-border-hover"
          />
          <button
            :disabled="!form.telegram.botToken.trim() || telegramValidating"
            class="flex items-center gap-1.5 rounded-md border border-gumm-border px-3 py-2 text-xs text-gumm-muted transition-colors duration-150 hover:bg-gumm-border/30 hover:text-white disabled:opacity-40"
            @click="validateTelegramToken"
          >
            <Icon name="lucide:check-circle" class="h-3.5 w-3.5" />
            {{ telegramValidating ? '...' : 'Test' }}
          </button>
        </div>
        <p
          v-if="telegramBotInfo"
          class="mt-1 text-xs text-emerald-400 flex items-center gap-1"
        >
          <Icon name="lucide:check" class="h-3 w-3" />
          Connected to @{{ telegramBotInfo.username }} ({{
            telegramBotInfo.first_name
          }})
        </p>
        <p
          v-if="telegramError"
          class="mt-1 text-xs text-red-400 flex items-center gap-1"
        >
          <Icon name="lucide:alert-circle" class="h-3 w-3" />
          {{ telegramError }}
        </p>
      </div>

      <div v-if="needsWebhook">
        <label class="mb-1 block text-xs text-gumm-muted">Webhook URL</label>
        <input
          v-model="form.telegram.webhookUrl"
          type="text"
          placeholder="https://your-domain.com"
          class="w-full rounded-xl border border-gumm-border bg-gumm-bg px-3 py-2 text-sm text-gumm-text placeholder-gumm-muted outline-none transition-colors focus:border-gumm-accent"
        />
        <p class="mt-1 text-xs text-gumm-muted">
          Your public URL. Gumm will register
          <code class="rounded-md bg-gumm-bg px-1.5 py-0.5"
            >/api/telegram/webhook</code
          >
          automatically.
        </p>
      </div>
      <div
        v-else
        class="rounded-lg border border-gumm-border/50 bg-gumm-bg/30 p-3"
      >
        <p class="text-xs text-gumm-muted flex items-center gap-2">
          <Icon
            name="lucide:check-circle"
            class="h-3.5 w-3.5 text-emerald-400"
          />
          Using {{ networkMode === 'netbird' ? 'NetBird' : 'Tailscale' }} — no
          webhook needed (polling mode enabled).
        </p>
      </div>

      <div>
        <label class="mb-1 block text-xs text-gumm-muted"
          >Allowed Chat IDs</label
        >
        <input
          v-model="form.telegram.allowedChatIds"
          type="text"
          placeholder="123456789,987654321"
          class="w-full rounded-xl border border-gumm-border bg-gumm-bg px-3 py-2 text-sm text-gumm-text placeholder-gumm-muted outline-none transition-colors focus:border-gumm-accent"
        />
      </div>
    </div>
  </div>
</template>
