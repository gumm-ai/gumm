<script setup lang="ts">
const loading = ref(false);
const error = ref('');

interface TelegramStatus {
  configured: boolean;
  configuredViaEnv: boolean;
  enabled: boolean;
  mode: 'webhook' | 'polling';
  bot: {
    username: string;
    name: string;
  };
  webhook: {
    url: string;
    info: any;
  };
  allowedChatIds: string;
}

const status = ref<TelegramStatus | null>(null);

async function fetchStatus() {
  loading.value = true;
  error.value = '';
  try {
    const data = await $fetch<TelegramStatus>('/api/telegram/status');
    status.value = data;
  } catch (err: any) {
    error.value = err.data?.message || 'Failed to fetch Telegram status';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchStatus();
});
</script>

<template>
  <section
    class="rounded-xl border border-gumm-border bg-gumm-surface p-5 flex flex-col h-full"
  >
    <div class="flex items-center justify-between mb-1">
      <div class="flex items-center gap-2">
        <Icon name="lucide:send" class="h-4 w-4 text-gumm-accent" />
        <h2 class="text-sm font-semibold">Telegram Bot</h2>
      </div>
      <button
        type="button"
        class="text-xs text-gumm-muted hover:text-gumm-text transition-colors"
        @click="fetchStatus"
      >
        <Icon
          name="lucide:refresh-cw"
          class="h-3.5 w-3.5"
          :class="{ 'animate-spin': loading }"
        />
      </button>
    </div>
    <p class="text-xs text-gumm-muted mb-3">
      Chat with Gumm from anywhere via Telegram.
    </p>

    <!-- Error -->
    <div
      v-if="error"
      class="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 rounded-md px-3 py-2 mb-3"
    >
      <Icon name="lucide:alert-circle" class="h-3.5 w-3.5 shrink-0" />
      {{ error }}
    </div>

    <!-- Loading state -->
    <div
      v-if="loading && !status"
      class="flex items-center gap-2 text-xs text-gumm-muted py-4"
    >
      <Icon name="lucide:loader" class="h-3.5 w-3.5 animate-spin" />
      Loading Telegram status...
    </div>

    <template v-if="status">
      <!-- Configured via env (read-only) -->
      <div
        v-if="status.configuredViaEnv"
        class="rounded-md border border-gumm-border bg-gumm-bg p-3"
      >
        <div class="flex items-center gap-2 mb-2">
          <Icon name="lucide:bot" class="h-4 w-4 text-gumm-accent" />
          <span
            v-if="status.bot.username"
            class="text-sm font-medium text-gumm-text"
          >
            @{{ status.bot.username }}
          </span>
          <span v-else class="text-sm font-medium text-gumm-text"
            >Bot Connected</span
          >
          <span class="ml-auto flex items-center gap-1 text-xs text-green-400">
            <span class="h-2 w-2 rounded-full bg-green-400" />
            Active
          </span>
        </div>

        <div class="space-y-1.5 text-xs text-gumm-muted">
          <div class="flex items-center gap-2">
            <Icon name="lucide:radio" class="h-3 w-3 shrink-0" />
            <span
              >Mode:
              <strong class="text-gumm-text">{{
                status.mode === 'polling' ? 'Long Polling' : 'Webhook'
              }}</strong></span
            >
          </div>
          <div v-if="status.allowedChatIds" class="flex items-center gap-2">
            <Icon name="lucide:shield-check" class="h-3 w-3 shrink-0" />
            <span
              >Restricted to Chat ID:
              <strong class="text-gumm-text">{{
                status.allowedChatIds
              }}</strong></span
            >
          </div>
          <div v-else class="flex items-center gap-2">
            <Icon
              name="lucide:shield-alert"
              class="h-3 w-3 shrink-0 text-yellow-400"
            />
            <span class="text-yellow-400"
              >Open to all users (no Chat ID restriction)</span
            >
          </div>
        </div>

        <p
          class="text-xs text-gumm-muted mt-3 pt-3 border-t border-gumm-border"
        >
          Telegram configured during server installation. To change it, update
          the
          <code class="bg-gumm-surface px-1 py-0.5 rounded text-gumm-text"
            >TELEGRAM_BOT_TOKEN</code
          >
          environment variable and restart the container.
        </p>
      </div>

      <!-- Configured via dashboard -->
      <div
        v-else-if="status.configured"
        class="rounded-md border border-gumm-border bg-gumm-bg p-3"
      >
        <div class="flex items-center gap-2 mb-2">
          <Icon name="lucide:bot" class="h-4 w-4 text-gumm-accent" />
          <span
            v-if="status.bot.username"
            class="text-sm font-medium text-gumm-text"
          >
            @{{ status.bot.username }}
          </span>
          <span v-else class="text-sm font-medium text-gumm-text"
            >Bot Connected</span
          >
          <span
            class="ml-auto flex items-center gap-1 text-xs"
            :class="status.enabled ? 'text-green-400' : 'text-gumm-muted'"
          >
            <span
              class="h-2 w-2 rounded-full"
              :class="status.enabled ? 'bg-green-400' : 'bg-gumm-muted'"
            />
            {{ status.enabled ? 'Active' : 'Paused' }}
          </span>
        </div>

        <div class="space-y-1.5 text-xs text-gumm-muted">
          <div class="flex items-center gap-2">
            <Icon name="lucide:radio" class="h-3 w-3 shrink-0" />
            <span
              >Mode:
              <strong class="text-gumm-text">{{
                status.mode === 'polling' ? 'Long Polling' : 'Webhook'
              }}</strong></span
            >
          </div>
          <div v-if="status.allowedChatIds" class="flex items-center gap-2">
            <Icon name="lucide:shield-check" class="h-3 w-3 shrink-0" />
            <span
              >Restricted to:
              <strong class="text-gumm-text">{{
                status.allowedChatIds
              }}</strong></span
            >
          </div>
        </div>
      </div>

      <!-- Not configured -->
      <div v-else class="rounded-md border border-gumm-border bg-gumm-bg p-3">
        <div class="flex items-center gap-2 mb-2">
          <Icon name="lucide:bot" class="h-4 w-4 text-gumm-muted" />
          <span class="text-sm font-medium text-gumm-text">Not Configured</span>
        </div>
        <p class="text-xs text-gumm-muted">
          Telegram was not configured during server installation. To enable it,
          re-run the setup script or manually set
          <code class="bg-gumm-surface px-1 py-0.5 rounded text-gumm-text"
            >TELEGRAM_BOT_TOKEN</code
          >
          in your .env file.
        </p>
      </div>
    </template>
  </section>
</template>
