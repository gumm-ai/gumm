<script setup lang="ts">
import { computed } from 'vue';
import { languageChoices, modelChoices } from '~/utils/setupConstants';

const props = defineProps<{
  form: any;
  telegramBotInfo: { username: string; first_name: string } | null;
  error: string;
}>();

// Get the selected model and provider
const selectedModel = computed(() =>
  modelChoices.find((m) => m.id === props.form.llmModel),
);
const selectedProvider = computed(() => {
  // First check if we have it in the static list
  if (selectedModel.value?.apiProvider) {
    return selectedModel.value.apiProvider;
  }
  // Infer from model ID (Mistral models don't have provider prefix)
  const modelId = props.form.llmModel || '';
  if (
    modelId.startsWith('mistral') ||
    modelId.startsWith('pixtral') ||
    modelId.startsWith('codestral')
  ) {
    return 'mistral';
  }
  return 'openrouter';
});

// Format model name from ID if not in static list
const modelDisplayName = computed(() => {
  if (selectedModel.value?.name) return selectedModel.value.name;
  // Extract name from model ID (e.g., "google/gemini-2.5-flash" -> "Gemini 2.5 Flash")
  const modelId = props.form.llmModel || '';
  const parts = modelId.split('/');
  const name = parts[parts.length - 1] || modelId;
  return name
    .split('-')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
});

const isApiConfigured = computed(() => {
  if (selectedProvider.value === 'mistral') {
    return !!props.form.mistralApiKey;
  }
  return !!props.form.openrouterApiKey;
});
const providerLabel = computed(() => {
  if (selectedProvider.value === 'mistral') return 'Mistral AI';
  return 'OpenRouter';
});
</script>

<template>
  <div class="text-center space-y-4">
    <div
      class="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-gumm-bg border border-gumm-border mb-4"
    >
      <Icon name="lucide:rocket" class="h-8 w-8 text-gumm-text" />
    </div>
    <h2 class="text-xl font-semibold tracking-tight text-white">
      Ready to launch
    </h2>

    <div
      class="mx-auto max-w-xs rounded-md border border-gumm-border bg-gumm-bg p-4 text-left text-xs space-y-2"
    >
      <div class="flex justify-between">
        <span class="text-gumm-muted flex items-center gap-1">
          <Icon name="lucide:brain" class="h-3 w-3" />
          Brain
        </span>
        <span class="text-gumm-text">Gumm</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gumm-muted flex items-center gap-1">
          <Icon name="lucide:globe" class="h-3 w-3" />
          Language
        </span>
        <span class="text-gumm-text">{{
          languageChoices.find((l) => l.id === form.language)?.name ||
          form.language
        }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gumm-muted flex items-center gap-1">
          <Icon name="lucide:lock" class="h-3 w-3" />
          Password
        </span>
        <span class="text-emerald-400 flex items-center gap-1">
          <Icon name="lucide:check" class="h-3 w-3" />
          Set
        </span>
      </div>
      <div class="flex justify-between">
        <span class="text-gumm-muted flex items-center gap-1">
          <Icon name="lucide:zap" class="h-3 w-3" />
          {{ providerLabel }}
        </span>
        <span
          :class="isApiConfigured ? 'text-emerald-400' : 'text-amber-400'"
          >{{ isApiConfigured ? 'Configured' : 'Skipped' }}</span
        >
      </div>
      <div class="flex justify-between">
        <span class="text-gumm-muted flex items-center gap-1">
          <Icon name="lucide:cpu" class="h-3 w-3" />
          Model
        </span>
        <span class="text-gumm-text text-xs">{{ modelDisplayName }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gumm-muted flex items-center gap-1">
          <Icon name="lucide:send" class="h-3 w-3" />
          Telegram
        </span>
        <span :class="telegramBotInfo ? 'text-emerald-400' : 'text-gumm-muted'">
          {{ telegramBotInfo ? `@${telegramBotInfo.username}` : 'Skipped' }}
        </span>
      </div>
    </div>

    <p
      v-if="error"
      class="text-xs text-red-400 flex items-center justify-center gap-1"
    >
      <Icon name="lucide:alert-circle" class="h-3 w-3" />
      {{ error }}
    </p>
  </div>
</template>
