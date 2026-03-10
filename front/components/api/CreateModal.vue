<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ProviderTemplate, ApiConnection } from '~/types/api';
import { providers, authTypeLabels } from '~/utils/apiProviders';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ close: []; created: [providerId: string, connId: string] }>();

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

watch(() => createForm.value.name, (name) => {
  if (createStep.value === 'form' && selectedProvider.value) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    createForm.value.id = slug || selectedProvider.value.id;
  }
});

watch(() => props.show, (show) => {
  if (show) {
    createStep.value = 'provider';
    selectedProvider.value = null;
    createForm.value = { id: '', name: '', authType: 'api_key', fields: {} };
    createError.value = '';
  }
});

function selectProvider(p: ProviderTemplate) {
  selectedProvider.value = p;
  createForm.value = { id: '', name: p.name, authType: p.defaultAuthType, fields: {} };
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
    createError.value = err.data?.message || err.message || 'Failed to create connection';
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
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="handleClose" />

        <div class="relative z-10 w-full max-w-lg rounded-2xl border border-white/[0.08] bg-gumm-bg p-6 shadow-2xl">
          <div class="mb-5 flex items-center justify-between">
            <h2 class="text-sm font-medium text-white/90">
              {{ createStep === 'provider' ? 'Choose a provider' : `Configure ${selectedProvider?.name}` }}
            </h2>
            <button class="text-white/40 transition-colors hover:text-white/80" @click="handleClose">
              <Icon name="lucide:x" class="h-4 w-4" />
            </button>
          </div>

          <div v-if="createStep === 'provider'" class="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
            <button
              v-for="p in providers"
              :key="p.id"
              class="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.01] p-3 text-left transition-all hover:border-white/20 hover:bg-white/[0.03]"
              @click="selectProvider(p)"
            >
              <div class="flex h-8 w-8 items-center justify-center rounded-lg border" :class="p.color">
                <Icon :name="p.icon" class="h-4 w-4" />
              </div>
              <div>
                <span class="text-xs font-medium text-white/90">{{ p.name }}</span>
                <span class="block text-[10px] text-white/40">{{ authTypeLabels[p.defaultAuthType] }}</span>
              </div>
            </button>
          </div>

          <div v-else-if="createStep === 'form' && selectedProvider" class="space-y-4">
            <button
              class="flex items-center gap-1 text-xs text-white/40 transition-colors hover:text-white/70"
              @click="createStep = 'provider'"
            >
              <Icon name="lucide:arrow-left" class="h-3 w-3" />
              Back
            </button>

            <div>
              <label class="mb-1 block text-[10px] text-white/40 uppercase tracking-wider">Name</label>
              <input
                v-model="createForm.name"
                type="text"
                :placeholder="`My ${selectedProvider.name} API`"
                class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-white/20"
              />
            </div>

            <div>
              <label class="mb-1 block text-[10px] text-white/40 uppercase tracking-wider">ID <span class="text-white/20">(auto)</span></label>
              <input
                v-model="createForm.id"
                type="text"
                placeholder="my-api"
                class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-white font-mono placeholder:text-white/30 outline-none transition-all focus:border-white/20"
              />
            </div>

            <div>
              <label class="mb-1 block text-[10px] text-white/40 uppercase tracking-wider">Auth Type</label>
              <select
                v-model="createForm.authType"
                class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition-all focus:border-white/20"
              >
                <option value="api_key">API Key</option>
                <option value="bearer">Bearer Token</option>
                <option value="oauth2">OAuth 2.0</option>
                <option value="basic">Basic Auth</option>
                <option value="none">No Auth</option>
              </select>
            </div>

            <div v-if="selectedProvider.helpSteps?.length" class="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
              <p class="text-xs font-medium text-white/70 flex items-center gap-1.5">
                <Icon name="lucide:help-circle" class="h-3.5 w-3.5 text-gumm-accent" />
                How to get your {{ selectedProvider.name }} credentials
              </p>
              <ol class="list-decimal list-inside space-y-1 text-xs text-white/40">
                <li v-for="(step, i) in selectedProvider.helpSteps" :key="i">{{ step }}</li>
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
              <div v-if="selectedProvider.helpLinks?.length" class="flex flex-wrap gap-2 pt-1">
                <a
                  v-for="(link, i) in selectedProvider.helpLinks"
                  :key="i"
                  :href="link.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-1 text-xs text-gumm-accent hover:bg-white/[0.06] transition-colors"
                >
                  <Icon name="lucide:external-link" class="h-3 w-3" />
                  {{ link.label }}
                </a>
              </div>
            </div>

            <div v-for="field in selectedProvider.fields" :key="field.key">
              <label class="mb-1 block text-[10px] text-white/40 uppercase tracking-wider">{{ field.label }}</label>
              <input
                v-model="createForm.fields[field.key]"
                :type="field.secret ? 'password' : 'text'"
                :placeholder="field.placeholder"
                class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-white/20"
              />
            </div>

            <p v-if="createError" class="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {{ createError }}
            </p>

            <div class="flex items-center gap-2 pt-2">
              <button
                class="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black transition-all hover:bg-white/90 disabled:opacity-50"
                :disabled="createLoading || !createForm.id || !createForm.name"
                @click="submitCreate"
              >
                <Icon :name="createLoading ? 'lucide:loader' : 'lucide:check'" class="h-3.5 w-3.5" :class="createLoading ? 'animate-spin' : ''" />
                {{ createLoading ? 'Creating…' : 'Create Connection' }}
              </button>
              <button
                class="rounded-lg border border-white/[0.06] px-3 py-2 text-xs text-white/50 transition-colors hover:bg-white/[0.04] hover:text-white/70"
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
