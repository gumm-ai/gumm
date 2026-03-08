<script setup lang="ts">
const revealed = ref(false);
const copied = ref(false);
const regenerating = ref(false);
const confirmRegenerate = ref(false);
const error = ref<string | null>(null);

const { data, refresh } = await useFetch<{ secret: string; revealed: boolean }>(
  () => `/api/webhooks/secret${revealed.value ? '?reveal=1' : ''}`,
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
    const result = await $fetch<{ secret: string }>(
      '/api/webhooks/secret/regenerate',
      { method: 'POST' },
    );
    // Show the new secret immediately
    revealed.value = true;
    await refresh();
    // Replace the returned value manually since the fetch key changed
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
  <section
    class="rounded-xl border border-gumm-border bg-gumm-surface p-4 max-w-lg"
  >
    <div class="flex items-center gap-2 mb-4">
      <Icon name="lucide:webhook" class="h-4 w-4 text-gumm-accent" />
      <h2 class="text-sm font-semibold">Webhooks</h2>
    </div>

    <p class="text-xs text-gumm-muted mb-3">
      Send HTTP POST requests to
      <code class="text-gumm-text bg-gumm-bg rounded px-1 py-0.5"
        >/api/webhooks/&lt;name&gt;</code
      >
      with the secret below in the
      <code class="text-gumm-text bg-gumm-bg rounded px-1 py-0.5"
        >X-Webhook-Secret</code
      >
      header.
    </p>

    <!-- Secret display -->
    <div class="space-y-2 mb-4">
      <label class="block text-xs text-gumm-muted">Webhook Secret</label>
      <div class="flex items-center gap-2">
        <input
          :value="data?.secret ?? ''"
          :type="revealed ? 'text' : 'password'"
          readonly
          class="flex-1 rounded-md border border-gumm-border bg-gumm-bg px-3 py-2 text-sm text-gumm-text font-mono outline-none select-all"
        />
        <!-- Toggle visibility -->
        <button
          type="button"
          :title="revealed ? 'Hide' : 'Reveal'"
          class="rounded-md border border-gumm-border bg-gumm-bg p-2 text-gumm-muted hover:text-gumm-text transition-colors"
          @click="revealed = !revealed"
        >
          <Icon
            :name="revealed ? 'lucide:eye-off' : 'lucide:eye'"
            class="h-4 w-4"
          />
        </button>
        <!-- Copy -->
        <button
          type="button"
          title="Copy"
          class="rounded-md border border-gumm-border bg-gumm-bg p-2 text-gumm-muted hover:text-gumm-text transition-colors"
          :disabled="!revealed"
          @click="copySecret"
        >
          <Icon
            :name="copied ? 'lucide:check' : 'lucide:copy'"
            class="h-4 w-4"
            :class="copied ? 'text-green-400' : ''"
          />
        </button>
      </div>
    </div>

    <!-- Regenerate -->
    <div v-if="!confirmRegenerate">
      <button
        type="button"
        class="text-xs text-gumm-muted hover:text-red-400 transition-colors flex items-center gap-1.5"
        @click="confirmRegenerate = true"
      >
        <Icon name="lucide:refresh-cw" class="h-3.5 w-3.5" />
        Regenerate secret…
      </button>
    </div>

    <div
      v-else
      class="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-2"
    >
      <p class="text-xs text-red-400">
        All webhook clients will stop working until updated with the new secret.
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          :disabled="regenerating"
          class="rounded-md bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
          @click="regenerate"
        >
          <Icon
            v-if="regenerating"
            name="lucide:loader-circle"
            class="h-3.5 w-3.5 animate-spin inline mr-1"
          />
          Confirm regenerate
        </button>
        <button
          type="button"
          class="rounded-md border border-gumm-border px-3 py-1.5 text-xs text-gumm-muted hover:text-gumm-text transition-colors"
          @click="confirmRegenerate = false"
        >
          Cancel
        </button>
      </div>
    </div>

    <p v-if="error" class="mt-2 text-xs text-red-400">{{ error }}</p>

    <!-- Usage hint -->
    <div class="mt-4 rounded-md bg-gumm-bg border border-gumm-border p-3">
      <p class="text-xs text-gumm-muted mb-1.5 font-medium">Example (curl)</p>
      <pre class="text-xs text-gumm-text overflow-x-auto">
curl -X POST https://your-gumm/api/webhooks/n8n \
  -H "X-Webhook-Secret: &lt;secret&gt;" \
  -H "Content-Type: application/json" \
  -d '{"action":"trigger"}'</pre
      >
    </div>
  </section>
</template>
