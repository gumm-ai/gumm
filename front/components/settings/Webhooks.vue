<script setup lang="ts">
const revealed = ref(false);
const copied = ref(false);
const regenerating = ref(false);
const confirmRegenerate = ref(false);
const error = ref<string | null>(null);

const { data, refresh } = await useFetch<{ secret: string; revealed: boolean }>(
  () => `/api/webhooks/secret${revealed.value ? '?reveal=1' : ''}`
);

watch(revealed, () => refresh());

async function copySecret() {
  if (!data.value?.secret) return;
  try {
    await navigator.clipboard.writeText(data.value.secret);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    error.value = 'Clipboard copy failed';
  }
}

async function regenerate() {
  regenerating.value = true;
  error.value = null;
  try {
    const result = await $fetch<{ secret: string }>('/api/webhooks/secret/regenerate', { method: 'POST' });
    revealed.value = true;
    await refresh();
    if (data.value) data.value.secret = result.secret;
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to regenerate secret';
  } finally {
    regenerating.value = false;
    confirmRegenerate.value = false;
  }
}
</script>

<template>
  <section class="rounded-xl bg-white/[0.02] border border-white/[0.04] overflow-hidden">
    <div class="flex items-center gap-3 px-5 py-4 border-b border-white/[0.04]">
      <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
        <Icon name="lucide:webhook" class="h-4 w-4 text-white/50" />
      </div>
      <div>
        <h2 class="text-sm font-medium text-white">Webhooks</h2>
        <p class="text-[11px] text-white/40">HTTP triggers</p>
      </div>
    </div>

    <div class="p-4 space-y-4">
      <p class="text-xs text-white/50">
        Send POST to <code class="text-white/70 bg-white/[0.06] rounded px-1.5 py-0.5">/api/webhooks/&lt;name&gt;</code> with
        <code class="text-white/70 bg-white/[0.06] rounded px-1.5 py-0.5">X-Webhook-Secret</code> header.
      </p>

      <div>
        <label class="text-[11px] text-white/40 uppercase tracking-wider block mb-2">Webhook Secret</label>
        <div class="flex items-center gap-2">
          <input
            :value="data?.secret ?? ''"
            :type="revealed ? 'text' : 'password'"
            readonly
            class="flex-1 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-sm text-white/80 font-mono outline-none"
          />
          <button
            type="button"
            :title="revealed ? 'Hide' : 'Reveal'"
            class="rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-white/50 transition-all hover:text-white/80 hover:bg-white/[0.06]"
            @click="revealed = !revealed"
          >
            <Icon :name="revealed ? 'lucide:eye-off' : 'lucide:eye'" class="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Copy"
            class="rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-white/50 transition-all hover:text-white/80 hover:bg-white/[0.06]"
            :disabled="!revealed"
            @click="copySecret"
          >
            <Icon :name="copied ? 'lucide:check' : 'lucide:copy'" class="h-4 w-4" :class="copied ? 'text-emerald-400' : ''" />
          </button>
        </div>
      </div>

      <div v-if="!confirmRegenerate">
        <button
          type="button"
          class="text-xs text-white/40 hover:text-red-400 transition-colors flex items-center gap-1.5"
          @click="confirmRegenerate = true"
        >
          <Icon name="lucide:refresh-cw" class="h-3.5 w-3.5" />
          Regenerate secret
        </button>
      </div>

      <div v-else class="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-2">
        <p class="text-xs text-red-400/80">All webhook clients will stop working until updated with the new secret.</p>
        <div class="flex gap-2">
          <button
            type="button"
            :disabled="regenerating"
            class="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-all hover:bg-red-500/30 disabled:opacity-50"
            @click="regenerate"
          >
            <Icon v-if="regenerating" name="lucide:loader-circle" class="h-3.5 w-3.5 animate-spin inline mr-1" />
            Confirm
          </button>
          <button
            type="button"
            class="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-white/60 transition-all hover:text-white/80"
            @click="confirmRegenerate = false"
          >
            Cancel
          </button>
        </div>
      </div>

      <p v-if="error" class="text-xs text-red-400">{{ error }}</p>

      <div class="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3">
        <p class="text-[10px] text-white/40 mb-1.5 font-medium uppercase tracking-wider">Example</p>
        <pre class="text-[10px] text-white/60 overflow-x-auto"><code>curl -X POST https://your-gumm/api/webhooks/n8n \
  -H "X-Webhook-Secret: &lt;secret&gt;" \
  -H "Content-Type: application/json" \
  -d '{"action":"trigger"}'</code></pre>
      </div>
    </div>
  </section>
</template>
