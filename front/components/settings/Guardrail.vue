<script setup lang="ts">
// ── Brain Config (for guardrail) ─────────────────────────────────
const { data: brainData, refresh } = await useFetch<{
  config: Record<string, string>;
}>('/api/brain/config');

// ── Guardrail Settings ────────────────────────────────────────────────────
const guardrailEnabled = ref(
  brainData.value?.config?.['guardrail.enabled'] !== 'false',
);
const guardrailAutoDetect = ref(
  brainData.value?.config?.['guardrail.autoDetect'] !== 'false',
);
const guardrailPattern = ref(
  brainData.value?.config?.['guardrail.pattern'] || '[[...]]',
);

const loading = ref(false);
const success = ref(false);
const error = ref<string | null>(null);

// Predefined patterns
const patternOptions = [
  {
    id: '[[...]]',
    label: 'Double Brackets [[secret]]',
    example: '[[mypassword]]',
  },
  {
    id: '{{...}}',
    label: 'Double Curly Braces {{secret}}',
    example: '{{mypassword}}',
  },
  {
    id: '<<...>>',
    label: 'Double Angle Brackets <<secret>>',
    example: '<<mypassword>>',
  },
  {
    id: '[!...!]',
    label: 'Bang Brackets [!secret!]',
    example: '[!mypassword!]',
  },
];

// Test message for preview
const testMessage = ref('');
const previewResult = ref<{
  hasUserSecrets: boolean;
  autoDetected: string[];
  details: Array<{ type: string; masked: string }>;
} | null>(null);

async function testGuardrail() {
  if (!testMessage.value.trim()) {
    previewResult.value = null;
    return;
  }

  try {
    const result = await $fetch<{
      hasUserSecrets: boolean;
      autoDetected: string[];
      details: Array<{ type: string; masked: string }>;
    }>('/api/guardrail/test', {
      method: 'POST',
      body: {
        message: testMessage.value,
        pattern: guardrailPattern.value,
      },
    });
    previewResult.value = result;
  } catch (e: any) {
    console.error('Preview failed:', e);
  }
}

// Debounced test
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
          {
            key: 'guardrail.enabled',
            value: guardrailEnabled.value ? 'true' : 'false',
          },
          {
            key: 'guardrail.autoDetect',
            value: guardrailAutoDetect.value ? 'true' : 'false',
          },
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

// Sensitive data types that will be auto-detected
const autoDetectedTypes = [
  { type: 'Credit Card Numbers', icon: 'lucide:credit-card' },
  { type: 'API Keys', icon: 'lucide:key' },
  { type: 'Tokens (JWT, Bearer, GitHub, etc.)', icon: 'lucide:shield' },
  { type: 'Passwords', icon: 'lucide:lock' },
  { type: 'Private Keys (SSH, PEM)', icon: 'lucide:file-key' },
  { type: 'Database Connection Strings', icon: 'lucide:database' },
  { type: 'Social Security Numbers', icon: 'lucide:user-check' },
  { type: 'AWS Credentials', icon: 'lucide:cloud' },
];
</script>

<template>
  <section
    class="rounded-xl border border-gumm-border bg-gumm-surface p-5 flex flex-col h-full"
  >
    <div class="flex items-center gap-2 mb-1">
      <Icon name="lucide:shield-alert" class="h-4 w-4 text-gumm-accent" />
      <h2 class="text-sm font-semibold">Data Guardrail</h2>
    </div>
    <p class="text-xs text-gumm-muted mb-4">
      Protect sensitive data from being sent to online LLMs. The guardrail
      blocks messages containing credit card numbers, API keys, tokens,
      passwords, and more.
    </p>

    <div class="space-y-4">
      <!-- Enable Guardrail Toggle -->
      <div class="flex items-start justify-between">
        <div>
          <label class="text-sm font-medium text-gumm-text"
            >Enable Guardrail</label
          >
          <p class="text-xs text-gumm-muted mt-0.5">
            Block messages with detected sensitive data before reaching LLMs
          </p>
        </div>
        <button
          type="button"
          role="switch"
          :aria-checked="guardrailEnabled"
          class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-gumm-accent focus:ring-offset-2 focus:ring-offset-gumm-bg"
          :class="guardrailEnabled ? 'bg-gumm-accent' : 'bg-gumm-border'"
          @click="guardrailEnabled = !guardrailEnabled"
        >
          <span
            class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition"
            :class="guardrailEnabled ? 'translate-x-4' : 'translate-x-0'"
          />
        </button>
      </div>

      <!-- Auto-Detection Toggle -->
      <div
        class="flex items-start justify-between"
        :class="{ 'opacity-50': !guardrailEnabled }"
      >
        <div>
          <label class="text-sm font-medium text-gumm-text"
            >Auto-Detect Sensitive Data</label
          >
          <p class="text-xs text-gumm-muted mt-0.5">
            Automatically detect and block credit cards, tokens, API keys, etc.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          :disabled="!guardrailEnabled"
          :aria-checked="guardrailAutoDetect"
          class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-gumm-accent focus:ring-offset-2 focus:ring-offset-gumm-bg disabled:cursor-not-allowed"
          :class="
            guardrailAutoDetect && guardrailEnabled
              ? 'bg-gumm-accent'
              : 'bg-gumm-border'
          "
          @click="guardrailAutoDetect = !guardrailAutoDetect"
        >
          <span
            class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition"
            :class="guardrailAutoDetect ? 'translate-x-4' : 'translate-x-0'"
          />
        </button>
      </div>

      <!-- Auto-detected types list -->
      <div
        v-if="guardrailEnabled && guardrailAutoDetect"
        class="bg-gumm-bg rounded-lg p-3"
      >
        <p class="text-xs font-medium text-gumm-muted mb-2">
          Auto-detected data types:
        </p>
        <div class="grid grid-cols-2 gap-1.5">
          <div
            v-for="item in autoDetectedTypes"
            :key="item.type"
            class="flex items-center gap-1.5 text-xs text-gumm-text"
          >
            <Icon :name="item.icon" class="h-3 w-3 text-gumm-muted shrink-0" />
            <span>{{ item.type }}</span>
          </div>
        </div>
      </div>

      <!-- Secret Pattern Selector -->
      <div :class="{ 'opacity-50': !guardrailEnabled }">
        <label class="text-sm font-medium text-gumm-text block mb-2">
          Secret Marker Pattern
        </label>
        <p class="text-xs text-gumm-muted mb-2">
          Wrap intentional secrets in this pattern to save them locally (not
          blocked).
        </p>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="opt in patternOptions"
            :key="opt.id"
            type="button"
            :disabled="!guardrailEnabled"
            class="flex flex-col items-start p-2 rounded-md border transition-colors text-left disabled:cursor-not-allowed"
            :class="
              guardrailPattern === opt.id
                ? 'border-gumm-accent bg-gumm-accent/10 text-gumm-accent'
                : 'border-gumm-border bg-gumm-bg text-gumm-text hover:border-gumm-border-hover'
            "
            @click="guardrailPattern = opt.id"
          >
            <span class="text-sm font-medium">{{ opt.label }}</span>
            <code class="text-xs mt-0.5 text-gumm-muted">{{
              opt.example
            }}</code>
          </button>
        </div>
      </div>

      <!-- Test Input -->
      <div :class="{ 'opacity-50': !guardrailEnabled }">
        <label class="text-sm font-medium text-gumm-text block mb-2">
          Test Message
        </label>
        <p class="text-xs text-gumm-muted mb-2">
          Enter a message to preview what would be detected.
        </p>
        <textarea
          v-model="testMessage"
          :disabled="!guardrailEnabled"
          placeholder="Enter a test message... e.g., 'My card is 4242424242424242' or 'My password is [[secret123]]'"
          class="w-full rounded-md border border-gumm-border bg-gumm-bg px-3 py-2 text-sm text-gumm-text placeholder-gumm-muted outline-none transition-colors focus:border-gumm-border-hover focus:ring-1 focus:ring-gumm-border-hover resize-none disabled:cursor-not-allowed"
          rows="2"
        />

        <!-- Preview Results -->
        <div
          v-if="previewResult"
          class="mt-2 bg-gumm-bg rounded-md p-3 space-y-2"
        >
          <div
            v-if="previewResult.hasUserSecrets"
            class="flex items-center gap-2 text-xs text-green-400"
          >
            <Icon name="lucide:check-circle" class="h-3.5 w-3.5 shrink-0" />
            <span>User-marked secrets detected (will be saved locally)</span>
          </div>
          <div v-if="previewResult.autoDetected.length > 0" class="space-y-1">
            <div class="flex items-center gap-2 text-xs text-red-400">
              <Icon name="lucide:alert-triangle" class="h-3.5 w-3.5 shrink-0" />
              <span>Auto-detected sensitive data (would be BLOCKED):</span>
            </div>
            <ul class="ml-5 space-y-1">
              <li
                v-for="detail in previewResult.details"
                :key="detail.type + detail.masked"
                class="text-xs text-gumm-muted"
              >
                <span class="text-gumm-text font-medium"
                  >{{ detail.type }}:</span
                >
                <code class="ml-1 bg-red-500/10 text-red-400 px-1 rounded">{{
                  detail.masked
                }}</code>
              </li>
            </ul>
          </div>
          <div
            v-if="
              !previewResult.hasUserSecrets &&
              previewResult.autoDetected.length === 0
            "
            class="flex items-center gap-2 text-xs text-gumm-muted"
          >
            <Icon name="lucide:check" class="h-3.5 w-3.5 shrink-0" />
            <span>No sensitive data detected — message is safe to send</span>
          </div>
        </div>
      </div>

      <!-- Success -->
      <div
        v-if="success"
        class="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 rounded-md px-3 py-2"
      >
        <Icon name="lucide:check-circle" class="h-3.5 w-3.5 shrink-0" />
        Guardrail settings saved successfully.
      </div>

      <!-- Error -->
      <div
        v-if="error"
        class="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 rounded-md px-3 py-2"
      >
        <Icon name="lucide:alert-circle" class="h-3.5 w-3.5 shrink-0" />
        {{ error }}
      </div>

      <button
        type="button"
        :disabled="loading"
        class="flex items-center gap-2 rounded-md bg-white text-black px-4 py-2 text-xs font-semibold transition-colors hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
        @click="saveSettings"
      >
        <Icon
          v-if="loading"
          name="lucide:loader"
          class="h-3.5 w-3.5 animate-spin"
        />
        <Icon v-else name="lucide:save" class="h-3.5 w-3.5" />
        {{ loading ? 'Saving...' : 'Save Settings' }}
      </button>
    </div>
  </section>
</template>
