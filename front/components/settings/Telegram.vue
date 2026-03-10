<script setup lang="ts">
const loading = ref(false);
const error = ref('');

interface TelegramStatus {
  configured: boolean;
  configuredViaEnv: boolean;
  enabled: boolean;
  mode: 'webhook' | 'polling';
  bot: { username: string; name: string };
  webhook: { url: string; info: any };
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
  <section class="rounded-xl bg-white/[0.02] border border-white/[0.04] overflow-hidden">
    <div class="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
      <div class="flex items-center gap-3">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
          <Icon name="lucide:send" class="h-4 w-4 text-white/50" />
        </div>
        <div>
          <h2 class="text-sm font-medium text-white">Telegram Bot</h2>
          <p class="text-[11px] text-white/40">Remote access</p>
        </div>
      </div>
      <button type="button" class="text-white/40 hover:text-white/70 transition-colors" @click="fetchStatus">
        <Icon name="lucide:refresh-cw" class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
      </button>
    </div>

    <div class="p-4">
      <div v-if="error" class="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 mb-3">
        <Icon name="lucide:alert-circle" class="h-3.5 w-3.5 shrink-0" />
        {{ error }}
      </div>

      <div v-if="loading && !status" class="flex items-center gap-2 text-xs text-white/40 py-4">
        <Icon name="lucide:loader-2" class="h-3.5 w-3.5 animate-spin" />
        Loading...
      </div>

      <template v-if="status">
        <div v-if="status.configuredViaEnv" class="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <div class="flex items-center gap-2 mb-2">
            <Icon name="lucide:bot" class="h-4 w-4 text-white/60" />
            <span v-if="status.bot.username" class="text-sm font-medium text-white/90">@{{ status.bot.username }}</span>
            <span v-else class="text-sm font-medium text-white/90">Bot Connected</span>
            <span class="ml-auto flex items-center gap-1.5 text-xs text-emerald-400">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Active
            </span>
          </div>
          <div class="space-y-1 text-xs text-white/50">
            <div class="flex items-center gap-2">
              <Icon name="lucide:radio" class="h-3 w-3 shrink-0" />
              <span>Mode: <strong class="text-white/70">{{ status.mode === 'polling' ? 'Long Polling' : 'Webhook' }}</strong></span>
            </div>
            <div v-if="status.allowedChatIds" class="flex items-center gap-2">
              <Icon name="lucide:shield-check" class="h-3 w-3 shrink-0" />
              <span>Restricted to: <strong class="text-white/70">{{ status.allowedChatIds }}</strong></span>
            </div>
          </div>
          <p class="text-[10px] text-white/30 mt-3 pt-3 border-t border-white/[0.06]">
            Configured via env. Update <code class="bg-white/[0.06] px-1 py-0.5 rounded">TELEGRAM_BOT_TOKEN</code> to change.
          </p>
        </div>

        <div v-else-if="status.configured" class="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <div class="flex items-center gap-2 mb-2">
            <Icon name="lucide:bot" class="h-4 w-4 text-white/60" />
            <span v-if="status.bot.username" class="text-sm font-medium text-white/90">@{{ status.bot.username }}</span>
            <span v-else class="text-sm font-medium text-white/90">Bot Connected</span>
            <span class="ml-auto flex items-center gap-1.5 text-xs" :class="status.enabled ? 'text-emerald-400' : 'text-white/40'">
              <span class="h-1.5 w-1.5 rounded-full" :class="status.enabled ? 'bg-emerald-400' : 'bg-white/30'" />
              {{ status.enabled ? 'Active' : 'Paused' }}
            </span>
          </div>
          <div class="space-y-1 text-xs text-white/50">
            <div class="flex items-center gap-2">
              <Icon name="lucide:radio" class="h-3 w-3 shrink-0" />
              <span>Mode: <strong class="text-white/70">{{ status.mode === 'polling' ? 'Long Polling' : 'Webhook' }}</strong></span>
            </div>
          </div>
        </div>

        <div v-else class="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <div class="flex items-center gap-2 mb-2">
            <Icon name="lucide:bot" class="h-4 w-4 text-white/30" />
            <span class="text-sm font-medium text-white/60">Not Configured</span>
          </div>
          <p class="text-xs text-white/40">
            Set <code class="bg-white/[0.06] px-1 py-0.5 rounded">TELEGRAM_BOT_TOKEN</code> in your .env to enable.
          </p>
        </div>
      </template>
    </div>
  </section>
</template>
