<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ProviderTemplate, ApiConnection } from '~/types/api';
import { providers, authTypeLabels } from '~/utils/apiProviders';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  close: [];
  created: [providerId: string, connId: string];
}>();

const createStep = ref<'provider' | 'form'>('provider');
const selectedProvider = ref<ProviderTemplate | null>(null);
const createForm = ref({
  id: '',
  name: '',
  authType: 'api_key' as ApiConnection['authType'],
  fields: {} as Record<string, string>,
});
const createLoading = ref(false);
const createError = ref('');

// Auto-generate ID from name
watch(
  () => createForm.value.name,
  (name) => {
    if (createStep.value === 'form' && selectedProvider.value) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      createForm.value.id = slug || selectedProvider.value.id;
    }
  },
);

// Reset form when opened
watch(
  () => props.show,
  (show) => {
    if (show) {
      createStep.value = 'provider';
      selectedProvider.value = null;
      createForm.value = { id: '', name: '', authType: 'api_key', fields: {} };
      createError.value = '';
    }
  },
);

function selectProvider(p: ProviderTemplate) {
  selectedProvider.value = p;
  createForm.value = {
    id: '',
    name: p.name,
    authType: p.defaultAuthType,
    fields: {},
  };
  createStep.value = 'form';
}

function handleClose() {
  emit('close');
}

async function submitCreate() {
  if (!selectedProvider.value) return;
  createLoading.value = true;
  createError.value = '';
  try {
    await $fetch('/api/connections', {
      method: 'POST',
      body: {
        id: createForm.value.id,
        name: createForm.value.name,
        provider: selectedProvider.value.id,
        authType: createForm.value.authType,
        config: createForm.value.fields,
      },
    });
    const { id } = createForm.value;
    const providerId = selectedProvider.value.id;
    handleClose();
    emit('created', providerId, id);
  } catch (err: any) {
    createError.value =
      err.data?.message || err.message || 'Failed to create connection';
  } finally {
    createLoading.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-all duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          class="absolute inset-0 bg-black/70 backdrop-blur-sm"
          @click="handleClose"
        />

        <div
          class="relative z-10 w-full max-w-lg rounded-2xl border border-gumm-border bg-gumm-bg p-6 shadow-2xl"
        >
          <!-- Header -->
          <div class="mb-5 flex items-center justify-between">
            <h2 class="text-sm font-semibold">
              {{
                createStep === 'provider'
                  ? 'Choose a provider'
                  : `Configure ${selectedProvider?.name}`
              }}
            </h2>
            <button
              class="text-gumm-muted transition-colors hover:text-gumm-text"
              @click="handleClose"
            >
              <Icon name="lucide:x" class="h-4 w-4" />
            </button>
          </div>

          <!-- Step: Provider selection -->
          <div v-if="createStep === 'provider'" class="grid grid-cols-2 gap-2">
            <button
              v-for="p in providers"
              :key="p.id"
              class="flex items-center gap-2.5 rounded-xl border bg-gumm-surface p-3 text-left transition-all duration-150 hover:border-gumm-accent/40 hover:bg-gumm-accent/5"
              :class="'border-gumm-border'"
              @click="selectProvider(p)"
            >
              <div
                class="flex h-8 w-8 items-center justify-center rounded-lg border"
                :class="p.color"
              >
                <Icon :name="p.icon" class="h-4 w-4" />
              </div>
              <div>
                <span class="text-xs font-medium text-gumm-text">{{
                  p.name
                }}</span>
                <span class="block text-[10px] text-gumm-muted">{{
                  authTypeLabels[p.defaultAuthType]
                }}</span>
              </div>
            </button>
          </div>

          <!-- Step: Config form -->
          <div
            v-else-if="createStep === 'form' && selectedProvider"
            class="space-y-4"
          >
            <button
              class="flex items-center gap-1 text-xs text-gumm-muted transition-colors hover:text-gumm-text"
              @click="createStep = 'provider'"
            >
              <Icon name="lucide:arrow-left" class="h-3 w-3" />
              Back
            </button>

            <!-- Name -->
            <div>
              <label class="mb-1 block text-xs text-gumm-muted">Name</label>
              <input
                v-model="createForm.name"
                type="text"
                :placeholder="`My ${selectedProvider.name} API`"
                class="w-full rounded-lg border border-gumm-border bg-gumm-surface px-3 py-1.5 text-xs text-gumm-text placeholder:text-gumm-muted/50 outline-none transition-all focus:ring-1 focus:ring-gumm-accent focus:border-gumm-accent"
              />
            </div>

            <!-- ID (auto-generated) -->
            <div>
              <label class="mb-1 block text-xs text-gumm-muted"
                >ID <span class="text-gumm-muted/50">(auto)</span></label
              >
              <input
                v-model="createForm.id"
                type="text"
                placeholder="my-api"
                class="w-full rounded-lg border border-gumm-border bg-gumm-surface px-3 py-1.5 text-xs font-mono text-gumm-text placeholder:text-gumm-muted/50 outline-none transition-all focus:ring-1 focus:ring-gumm-accent focus:border-gumm-accent"
              />
            </div>

            <!-- Auth type -->
            <div>
              <label class="mb-1 block text-xs text-gumm-muted"
                >Auth Type</label
              >
              <select
                v-model="createForm.authType"
                class="w-full rounded-lg border border-gumm-border bg-gumm-surface px-3 py-1.5 text-xs text-gumm-text placeholder:text-gumm-muted/50 outline-none transition-all focus:ring-1 focus:ring-gumm-accent focus:border-gumm-accent"
              >
                <option value="api_key">API Key</option>
                <option value="bearer">Bearer Token</option>
                <option value="oauth2">OAuth 2.0</option>
                <option value="basic">Basic Auth</option>
                <option value="none">No Auth</option>
              </select>
            </div>

            <!-- Help: How to get your credentials -->
            <div
              v-if="selectedProvider.helpSteps?.length"
              class="rounded-lg border border-gumm-border bg-gumm-surface p-3 space-y-2"
            >
              <p
                class="text-xs font-medium text-gumm-text flex items-center gap-1.5"
              >
                <Icon
                  name="lucide:help-circle"
                  class="h-3.5 w-3.5 text-gumm-accent"
                />
                How to get your {{ selectedProvider.name }} credentials
              </p>
              <ol
                class="list-decimal list-inside space-y-1 text-xs text-gumm-muted"
              >
                <li v-for="(step, i) in selectedProvider.helpSteps" :key="i">
                  {{ step }}
                </li>
              </ol>
              <a
                v-if="selectedProvider.helpUrl"
                :href="selectedProvider.helpUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 text-xs text-gumm-accent hover:underline pt-1"
              >
                Open {{ selectedProvider.name }} dashboard
                <Icon name="lucide:external-link" class="h-3 w-3" />
              </a>
              <div
                v-if="selectedProvider.helpLinks?.length"
                class="flex flex-wrap gap-2 pt-1"
              >
                <a
                  v-for="(link, i) in selectedProvider.helpLinks"
                  :key="i"
                  :href="link.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 rounded-md border border-gumm-border bg-gumm-bg px-2 py-1 text-xs text-gumm-accent hover:bg-gumm-hover transition-colors"
                >
                  <Icon name="lucide:external-link" class="h-3 w-3" />
                  {{ link.label }}
                </a>
              </div>
            </div>

            <!-- Dynamic fields from provider template -->
            <div v-for="field in selectedProvider.fields" :key="field.key">
              <label class="mb-1 block text-xs text-gumm-muted">{{
                field.label
              }}</label>
              <input
                v-model="createForm.fields[field.key]"
                :type="field.secret ? 'password' : 'text'"
                :placeholder="field.placeholder"
                class="w-full rounded-lg border border-gumm-border bg-gumm-surface px-3 py-1.5 text-xs text-gumm-text placeholder:text-gumm-muted/50 outline-none transition-all focus:ring-1 focus:ring-gumm-accent focus:border-gumm-accent"
              />
            </div>

            <!-- Error -->
            <p
              v-if="createError"
              class="rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400"
            >
              {{ createError }}
            </p>

            <!-- Submit -->
            <div class="flex items-center gap-2 pt-2">
              <button
                class="flex items-center gap-1.5 rounded-lg bg-gumm-accent px-3 py-1.5 text-xs font-medium text-gumm-bg transition-colors hover:bg-gumm-accent-hover disabled:opacity-50"
                :disabled="createLoading || !createForm.id || !createForm.name"
                @click="submitCreate"
              >
                <Icon
                  :name="createLoading ? 'lucide:loader' : 'lucide:check'"
                  class="h-3.5 w-3.5"
                  :class="createLoading ? 'animate-spin' : ''"
                />
                {{ createLoading ? 'Creating…' : 'Create Connection' }}
              </button>
              <button
                class="rounded-lg border border-gumm-border px-3 py-1.5 text-xs text-gumm-muted transition-colors hover:bg-white/5"
                @click="handleClose"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
