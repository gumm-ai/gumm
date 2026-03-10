<script setup lang="ts">
const { data: brainData, refresh } = await useFetch<{ config: Record<string, string> }>('/api/brain/config');

const guardrailEnabled = ref(brainData.value?.config?.['guardrail.enabled'] !== 'false');
const guardrailAutoDetect = ref(brainData.value?.config?.['guardrail.autoDetect'] !== 'false');
const guardrailPattern = ref(brainData.value?.config?.['guardrail.pattern'] || '[[...]]');

const loading = ref(false);
const success = ref(false);
const error = ref<string | null>(null);

const patternOptions = [
  { id: '[[...]]', label: '[[secret]]', example: 'Double brackets' },
  { id: '{{...}}', label: '{{secret}}', example: 'Double curly' },
  { id: '<<...>>', label: '<<secret>>', example: 'Double angle' },
  { id: '[!...!]', label: '[!secret!]', example: 'Bang brackets' },
];

const testMessage = ref('');
const previewResult = ref<{ hasUserSecrets: boolean; autoDetected: string[]; details: Array<{ type: string; masked: string }> } | null>(null);

async function testGuardrail() {
  if (!testMessage.value.trim()) {
    previewResult.value = null;
    return;
  }
  try {
    const result = await $fetch<{ hasUserSecrets: boolean; autoDetected: string[]; details: Array<{ type: string; masked: string }> }>('/api/guardrail/test', {
      method: 'POST',
      body: { message: testMessage.value, pattern: guardrailPattern.value },
    });
    previewResult.value = result;
  } catch (e: any) {
    console.error('Preview failed:', e);
  }
}

let testTimeout: ReturnType<typeof setTimeout>;
watch(testMessage, () => {
  clearTimeout(testTimeout);
  testTimeout = setTimeout(testGuardrail, 500);
});

async function saveSettings() {
  loading.value = true;
  success.value = false;
  error.value = null;
  try {
    await $fetch('/api/brain/config', {
      method: 'PUT',
      body: {
        entries: [
          { key: 'guardrail.enabled', value: guardrailEnabled.value ? 'true' : 'false' },
          { key: 'guardrail.autoDetect', value: guardrailAutoDetect.value ? 'true' : 'false' },
          { key: 'guardrail.pattern', value: guardrailPattern.value },
        ],
      },
    });
    success.value = true;
    setTimeout(() => (success.value = false), 3000);
  } catch (e: any) {
    error.value = e.message || 'Failed to save settings';
  } finally {
    loading.value = false;
  }
}

const autoDetectedTypes = [
  { type: 'Credit Cards', icon: 'lucide:credit-card' },
  { type: 'API Keys', icon: 'lucide:key' },
  { type: 'Tokens', icon: 'lucide:shield' },
  { type: 'Passwords', icon: 'lucide:lock' },
  { type: 'Private Keys', icon: 'lucide:file-key' },
  { type: 'DB Strings', icon: 'lucide:database' },
];
</script>

<template>
  <section class="rounded-xl bg-white/[0.02] border border-white/[0.04] overflow-hidden">
    <div class="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
      <div class="flex items-center gap-3">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
          <Icon name="lucide:shield-alert" class="h-4 w-4 text-white/50" />
        </div>
        <div>
          <h2 class="text-sm font-medium text-white">Data Guardrail</h2>
          <p class="text-[11px] text-white/40">Protect sensitive data from LLMs</p>
        </div>
      </div>
      <span
        class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium"
        :class="guardrailEnabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/[0.04] text-white/40'"
      >
        <span class="h-1.5 w-1.5 rounded-full" :class="guardrailEnabled ? 'bg-emerald-400' : 'bg-white/30'" />
        {{ guardrailEnabled ? 'Active' : 'Disabled' }}
      </span>
    </div>

    <div class="p-5 space-y-5">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <label class="text-sm font-medium text-white/90">Enable Guardrail</label>
          <p class="text-xs text-white/40 mt-0.5">Block messages containing sensitive data</p>
        </div>
        <button
          type="button"
          role="switch"
          :aria-checked="guardrailEnabled"
          class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
          :class="guardrailEnabled ? 'bg-white/20' : 'bg-white/[0.08]'"
          @click="guardrailEnabled = !guardrailEnabled"
        >
          <span
            class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition"
            :class="guardrailEnabled ? 'translate-x-4' : 'translate-x-0'"
          />
        </button>
      </div>

      <div class="flex items-start justify-between" :class="{ 'opacity-40': !guardrailEnabled }">
        <div class="flex-1">
          <label class="text-sm font-medium text-white/90">Auto-Detect</label>
          <p class="text-xs text-white/40 mt-0.5">Automatically detect credit cards, tokens, API keys, etc.</p>
        </div>
        <button
          type="button"
          role="switch"
          :disabled="!guardrailEnabled"
          :aria-checked="guardrailAutoDetect"
          class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:cursor-not-allowed"
          :class="guardrailAutoDetect && guardrailEnabled ? 'bg-white/20' : 'bg-white/[0.08]'"
          @click="guardrailAutoDetect = !guardrailAutoDetect"
        >
          <span
            class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition"
            :class="guardrailAutoDetect ? 'translate-x-4' : 'translate-x-0'"
          />
        </button>
      </div>

      <div v-if="guardrailEnabled && guardrailAutoDetect" class="flex flex-wrap gap-2">
        <div v-for="item in autoDetectedTypes" :key="item.type" class="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2.5 py-1 text-[10px] text-white/50">
          <Icon :name="item.icon" class="h-3 w-3" />
          {{ item.type }}
        </div>
      </div>

      <div :class="{ 'opacity-40': !guardrailEnabled }">
        <label class="text-sm font-medium text-white/90 block mb-2">Secret Marker Pattern</label>
        <p class="text-xs text-white/40 mb-3">Wrap intentional secrets to save them locally (not blocked)</p>
        <div class="flex gap-2">
          <button
            v-for="opt in patternOptions"
            :key="opt.id"
            type="button"
            :disabled="!guardrailEnabled"
            class="flex flex-col items-center p-2.5 rounded-lg border transition-all disabled:cursor-not-allowed"
            :class="guardrailPattern === opt.id ? 'bg-white/[0.08] border-white/20 text-white' : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:bg-white/[0.04]'"
            @click="guardrailPattern = opt.id"
          >
            <code class="text-xs font-mono">{{ opt.label }}</code>
            <span class="text-[9px] text-white/40 mt-0.5">{{ opt.example }}</span>
          </button>
        </div>
      </div>

      <div :class="{ 'opacity-40': !guardrailEnabled }">
        <label class="text-sm font-medium text-white/90 block mb-2">Test Message</label>
        <textarea
          v-model="testMessage"
          :disabled="!guardrailEnabled"
          placeholder="e.g., 'My card is 4242424242424242' or 'My password is [[secret123]]'"
          class="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-sm text-white outline-none transition-all focus:border-white/20 placeholder:text-white/30 resize-none disabled:cursor-not-allowed"
          rows="2"
        />

        <div v-if="previewResult" class="mt-2 rounded-lg bg-white/[0.02] border border-white/[0.06] p-3 space-y-2">
          <div v-if="previewResult.hasUserSecrets" class="flex items-center gap-2 text-xs text-emerald-400">
            <Icon name="lucide:check-circle" class="h-3.5 w-3.5 shrink-0" />
            <span>User-marked secrets detected (will be saved locally)</span>
          </div>
          <div v-if="previewResult.autoDetected.length > 0" class="space-y-1">
            <div class="flex items-center gap-2 text-xs text-red-400">
              <Icon name="lucide:alert-triangle" class="h-3.5 w-3.5 shrink-0" />
              <span>Auto-detected (would be BLOCKED):</span>
            </div>
            <ul class="ml-5 space-y-0.5">
              <li v-for="detail in previewResult.details" :key="detail.type + detail.masked" class="text-xs text-white/60">
                <span class="text-white/80 font-medium">{{ detail.type }}:</span>
                <code class="ml-1 bg-red-500/10 text-red-400 px-1 rounded">{{ detail.masked }}</code>
              </li>
            </ul>
          </div>
          <div v-if="!previewResult.hasUserSecrets && previewResult.autoDetected.length === 0" class="flex items-center gap-2 text-xs text-white/40">
            <Icon name="lucide:check" class="h-3.5 w-3.5 shrink-0" />
            <span>No sensitive data detected — message is safe</span>
          </div>
        </div>
      </div>

      <div v-if="success" class="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2">
        <Icon name="lucide:check-circle" class="h-3.5 w-3.5 shrink-0" />
        Settings saved successfully
      </div>

      <div v-if="error" class="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
        <Icon name="lucide:alert-circle" class="h-3.5 w-3.5 shrink-0" />
        {{ error }}
      </div>

      <button
        type="button"
        :disabled="loading"
        class="flex items-center gap-2 rounded-lg bg-white text-black px-4 py-2 text-xs font-medium transition-all hover:bg-white/90 disabled:opacity-40"
        @click="saveSettings"
      >
        <Icon :name="loading ? 'lucide:loader-2' : 'lucide:save'" class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
        {{ loading ? 'Saving...' : 'Save Settings' }}
      </button>
    </div>
  </section>
</template>
