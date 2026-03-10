<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { ApiConnection } from '~/types/api';
import { getProviderForConnection, isModuleConnection } from '~/utils/apiProviders';

const props = defineProps<{ conn: ApiConnection | null }>();
const emit = defineEmits<{ close: []; updated: [] }>();

const editFields = ref<Record<string, string>>({});
const editLoading = ref(false);
const editError = ref('');

const provider = computed(() => (props.conn ? getProviderForConnection(props.conn) : undefined));
const isModule = computed(() => (props.conn ? isModuleConnection(props.conn) : false));

const displayConfig = computed(() => {
  if (!props.conn) return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(props.conn.config || {})) {
    if (!k.startsWith('_') && typeof v === 'string') {
      result[k] = v;
    }
  }
  return result;
});

watch(
  () => props.conn,
  (conn) => {
    if (conn) {
      const prov = getProviderForConnection(conn);
      const fields: Record<string, string> = {};
      if (prov) {
        for (const f of prov.fields) {
          fields[f.key] = '';
        }
      }
      editFields.value = fields;
      editError.value = '';
    } else {
      editFields.value = {};
      editError.value = '';
    }
  }
);

function handleClose() {
  emit('close');
}

async function submitEdit() {
  if (!props.conn) return;
  editLoading.value = true;
  editError.value = '';
  try {
    const config: Record<string, string> = {};
    for (const [k, v] of Object.entries(editFields.value)) {
      if (v.trim()) config[k] = v.trim();
    }
    if (Object.keys(config).length === 0) {
      editError.value = 'Enter at least one credential to update';
      editLoading.value = false;
      return;
    }
    await $fetch(`/api/connections/${props.conn.id}`, { method: 'PUT', body: { config } });
    handleClose();
    emit('updated');
  } catch (err: any) {
    editError.value = err.data?.message || err.message || 'Failed to update';
  } finally {
    editLoading.value = false;
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
      <div v-if="conn" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="handleClose" />

        <div class="relative z-10 w-full max-w-lg rounded-2xl border border-white/[0.08] bg-gumm-bg p-6 shadow-2xl">
          <div class="mb-5 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div v-if="provider" class="flex h-9 w-9 items-center justify-center rounded-lg border" :class="provider.color">
                <Icon :name="provider.icon" class="h-4 w-4" />
              </div>
              <div>
                <h2 class="text-sm font-medium text-white/90">Edit {{ conn.name }}</h2>
                <span class="text-[10px] text-white/30 font-mono">{{ conn.id }}</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span v-if="isModule" class="rounded-md bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-400">
                <Icon name="lucide:puzzle" class="inline h-2.5 w-2.5 mr-0.5" />
                Module Config
              </span>
              <button class="text-white/40 transition-colors hover:text-white/80" @click="handleClose">
                <Icon name="lucide:x" class="h-4 w-4" />
              </button>
            </div>
          </div>

          <div v-if="isModule && provider?.helpSteps?.length" class="mb-4 rounded-xl border border-purple-500/20 bg-purple-500/[0.02] p-3">
            <p class="text-xs font-medium text-purple-300 mb-2">Setup instructions:</p>
            <ol class="list-decimal list-inside text-xs text-white/40 space-y-0.5">
              <li v-for="(step, i) in provider.helpSteps" :key="i">{{ step }}</li>
            </ol>
            <a v-if="provider.helpUrl" :href="provider.helpUrl" target="_blank" class="mt-2 inline-flex items-center gap-1 text-xs text-purple-400 hover:underline">
              <Icon name="lucide:external-link" class="h-3 w-3" />
              Open documentation
            </a>
          </div>

          <p class="mb-4 text-xs text-white/40">Leave fields blank to keep current values. Only non-empty fields will be updated.</p>

          <div class="space-y-3">
            <div
              v-for="field in provider?.fields || [{ key: 'apiKey', label: 'API Key', placeholder: 'Enter value', secret: true }]"
              :key="field.key"
            >
              <label class="mb-1 block text-[10px] text-white/40 uppercase tracking-wider">{{ field.label }}</label>
              <input
                v-model="editFields[field.key]"
                :type="field.secret ? 'password' : 'text'"
                :placeholder="field.placeholder"
                class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-white/20"
              />
              <p v-if="displayConfig[field.key]" class="mt-0.5 text-[10px] text-white/30">
                Current: {{ displayConfig[field.key] }}
              </p>
            </div>
          </div>

          <p v-if="editError" class="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {{ editError }}
          </p>

          <div class="mt-4 flex items-center gap-2">
            <button
              class="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black transition-all hover:bg-white/90 disabled:opacity-50"
              :disabled="editLoading"
              @click="submitEdit"
            >
              <Icon :name="editLoading ? 'lucide:loader' : 'lucide:save'" class="h-3.5 w-3.5" :class="editLoading ? 'animate-spin' : ''" />
              {{ editLoading ? 'Saving…' : 'Save Changes' }}
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
    </Transition>
  </Teleport>
</template>
