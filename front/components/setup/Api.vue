<script setup lang="ts">
import { computed, ref } from 'vue';

interface SetupModel {
  id: string;
  name: string;
  provider: string;
  apiProvider: 'openrouter' | 'mistral';
  modalities: string[];
  context: string;
  price: string;
  description: string;
  recommended?: boolean;
  flag?: string;
}

const props = defineProps<{ form: any }>();

// Fetch models dynamically from OpenRouter public API
const { data: modelsData, status: modelsStatus } = await useFetch<{
  models: SetupModel[];
  providers: string[];
}>('/api/setup/models');

const modelChoices = computed(() => modelsData.value?.models || []);
const providers = computed(() => modelsData.value?.providers || []);

// Search and filter state
const search = ref('');
const selectedProviderFilter = ref<string | null>(null);

// Filter models based on search and provider
const filteredModels = computed(() => {
  let models = modelChoices.value;

  // Filter by provider
  if (selectedProviderFilter.value) {
    models = models.filter((m) => m.provider === selectedProviderFilter.value);
  }

  // Filter by search
  if (search.value.trim()) {
    const query = search.value.toLowerCase();
    models = models.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.provider.toLowerCase().includes(query) ||
        m.description.toLowerCase().includes(query),
    );
  }

  return models;
});

// Get the selected model's provider
const selectedModel = computed(() =>
  modelChoices.value.find((m) => m.id === props.form.llmModel),
);
const selectedProvider = computed(
  () => selectedModel.value?.apiProvider || 'openrouter',
);

function toggleProviderFilter(provider: string) {
  if (selectedProviderFilter.value === provider) {
    selectedProviderFilter.value = null;
  } else {
    selectedProviderFilter.value = provider;
  }
}

function clearFilters() {
  search.value = '';
  selectedProviderFilter.value = null;
}

const hasActiveFilters = computed(
  () => search.value.trim() || selectedProviderFilter.value,
);

// Set default model to recommended one if not already set
if (!props.form.llmModel && modelsData.value?.models?.length) {
  const recommended = modelsData.value.models.find((m) => m.recommended);
  if (recommended) {
    props.form.llmModel = recommended.id;
  } else {
    props.form.llmModel = modelsData.value.models[0]?.id;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h2
        class="text-base font-semibold text-gumm-text flex items-center gap-2"
      >
        <Icon name="lucide:zap" class="h-4 w-4 text-amber-400" />
        AI Model
      </h2>
      <p class="mt-1 text-xs text-gumm-muted">
        Choose your preferred AI model. Gemini uses OpenRouter, Mistral connects
        directly to the European API.
      </p>
    </div>

    <!-- Model selector -->
    <div class="space-y-3">
      <!-- Loading state -->
      <div
        v-if="modelsStatus === 'pending'"
        class="flex items-center justify-center p-8"
      >
        <Icon
          name="lucide:loader-2"
          class="h-5 w-5 text-gumm-muted animate-spin"
        />
        <span class="ml-2 text-xs text-gumm-muted">Loading models...</span>
      </div>

      <template v-else>
        <!-- Search bar -->
        <div class="relative">
          <Icon
            name="lucide:search"
            class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gumm-muted"
          />
          <input
            v-model="search"
            type="text"
            placeholder="Search models..."
            class="w-full rounded-md border border-gumm-border bg-gumm-bg pl-9 pr-3 py-2 text-xs text-gumm-text placeholder-gumm-muted outline-none transition-colors focus:border-gumm-accent"
          />
        </div>

        <!-- Provider filters -->
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="provider in providers"
            :key="provider"
            type="button"
            class="rounded-md px-2 py-1 text-[11px] transition-colors"
            :class="
              selectedProviderFilter === provider
                ? 'bg-gumm-accent/20 text-gumm-accent'
                : 'bg-white/5 text-gumm-muted hover:text-gumm-text'
            "
            @click="toggleProviderFilter(provider)"
          >
            {{ provider }}
          </button>
          <button
            v-if="hasActiveFilters"
            type="button"
            class="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-gumm-muted hover:text-gumm-text transition-colors"
            @click="clearFilters"
          >
            <Icon name="lucide:x" class="h-3 w-3" />
            Clear
          </button>
        </div>

        <!-- Models list with scroll -->
        <div
          class="max-h-80 overflow-y-auto rounded-lg border border-gumm-border/50 bg-gumm-bg/50"
        >
          <div
            v-if="filteredModels.length === 0"
            class="p-6 text-center text-xs text-gumm-muted"
          >
            No models found matching your search.
          </div>
          <div v-else class="p-1.5 space-y-1">
            <UiModelListItem
              v-for="m in filteredModels"
              :key="m.id"
              :model="m"
              :selected="form.llmModel === m.id"
              @click="form.llmModel = m.id"
            />
          </div>
        </div>
      </template>
    </div>

    <!-- API key - OpenRouter -->
    <div v-if="selectedProvider === 'openrouter'">
      <label class="mb-1 block text-xs text-gumm-muted"
        >OpenRouter API Key</label
      >
      <input
        v-model="form.openrouterApiKey"
        type="password"
        placeholder="sk-or-..."
        class="w-full rounded-md border border-gumm-border bg-gumm-bg px-3 py-2 text-sm text-gumm-text placeholder-gumm-muted outline-none transition-colors focus:border-gumm-border-hover focus:ring-1 focus:ring-gumm-border-hover"
      />
      <p class="mt-2 text-xs text-gumm-muted">
        Get your key at
        <a
          href="https://openrouter.ai/keys"
          target="_blank"
          class="text-gumm-accent hover:underline"
          >openrouter.ai/keys</a
        >. You can change it later in Brain settings.
      </p>
    </div>

    <!-- API key - Mistral -->
    <div v-else-if="selectedProvider === 'mistral'">
      <label class="mb-1 block text-xs text-gumm-muted"
        >Mistral AI API Key</label
      >
      <input
        v-model="form.mistralApiKey"
        type="password"
        placeholder="..."
        class="w-full rounded-md border border-gumm-border bg-gumm-bg px-3 py-2 text-sm text-gumm-text placeholder-gumm-muted outline-none transition-colors focus:border-gumm-border-hover focus:ring-1 focus:ring-gumm-border-hover"
      />
      <p class="mt-2 text-xs text-gumm-muted">
        Get your key at
        <a
          href="https://console.mistral.ai/api-keys"
          target="_blank"
          class="text-gumm-accent hover:underline"
          >console.mistral.ai</a
        >. European data residency. You can change it later in Brain settings.
      </p>
    </div>
  </div>
</template>
