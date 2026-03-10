<script setup lang="ts">
import type { ApiConnection } from '~/types/api';
import { getProviderForConnection, statusColor, statusBorder, authTypeLabels, isModuleConnection } from '~/utils/apiProviders';

const props = defineProps<{
  conn: ApiConnection;
  isOAuthConnecting: boolean;
  isTesting: boolean;
}>();

defineEmits<{
  test: [conn: ApiConnection];
  edit: [conn: ApiConnection];
  delete: [conn: ApiConnection];
  connect: [conn: ApiConnection];
  disconnect: [conn: ApiConnection];
}>();

const provider = computed(() => getProviderForConnection(props.conn));
const isModule = computed(() => isModuleConnection(props.conn));
const moduleId = computed(() => props.conn.config?._moduleId as string | undefined);

const displayConfig = computed(() => {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(props.conn.config || {})) {
    if (!k.startsWith('_')) {
      result[k] = v;
    }
  }
  return result;
});

function formatDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString();
}
</script>

<template>
  <div
    class="rounded-xl border p-4 transition-all duration-200"
    :class="[statusBorder(conn.status), conn.status === 'connected' ? 'bg-emerald-500/[0.02]' : 'bg-white/[0.01]']"
  >
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="h-2 w-2 rounded-full" :class="[statusColor(conn), conn.status === 'connected' ? 'animate-pulse' : '']" />
        <div class="flex items-center gap-2">
          <div v-if="provider" class="flex h-7 w-7 items-center justify-center rounded-lg border" :class="provider.color">
            <Icon :name="provider.icon" class="h-3.5 w-3.5" />
          </div>
          <h3 class="font-medium text-sm text-white/90">{{ conn.name }}</h3>
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        <span
          v-if="isModule"
          class="rounded-md bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-400"
          :title="`Required by: ${moduleId}`"
        >
          <Icon name="lucide:puzzle" class="inline h-2.5 w-2.5 mr-0.5" />
          Module
        </span>
        <span class="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/40">
          {{ authTypeLabels[conn.authType] || conn.authType }}
        </span>
      </div>
    </div>

    <div class="mt-1.5 flex items-center gap-2 text-xs text-white/30">
      <span class="font-mono">{{ conn.id }}</span>
      <span class="text-white/10">·</span>
      <span class="capitalize">{{ conn.provider }}</span>
    </div>

    <div v-if="Object.keys(displayConfig).length" class="mt-2 flex flex-wrap gap-1">
      <span
        v-for="(val, key) in displayConfig"
        :key="key"
        class="rounded-md bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/40 font-mono"
      >
        {{ key }}
      </span>
    </div>

    <p v-if="conn.error" class="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400 border border-red-500/20">
      {{ conn.error }}
    </p>

    <div class="mt-2 flex items-center gap-3 text-xs text-white/30">
      <span v-if="conn.lastTestedAt" class="flex items-center gap-1">
        <Icon name="lucide:activity" class="h-3 w-3" />
        {{ formatDate(conn.lastTestedAt) }}
      </span>
      <span class="flex items-center gap-1">
        <Icon name="lucide:calendar" class="h-3 w-3" />
        {{ formatDate(conn.createdAt) }}
      </span>
    </div>

    <div class="mt-3 flex items-center gap-1.5 border-t border-white/[0.06] pt-3">
      <button
        v-if="conn.authType === 'oauth2' && conn.status !== 'connected'"
        class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gumm-accent hover:bg-gumm-accent/10 transition-colors disabled:opacity-50"
        :disabled="isOAuthConnecting"
        @click="$emit('connect', conn)"
      >
        <Icon :name="isOAuthConnecting ? 'lucide:loader' : 'lucide:log-in'" class="h-3.5 w-3.5" :class="isOAuthConnecting ? 'animate-spin' : ''" />
        {{ isOAuthConnecting ? 'Connecting…' : 'Connect' }}
      </button>
      <button
        v-if="conn.authType === 'oauth2' && conn.status === 'connected'"
        class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
        @click="$emit('disconnect', conn)"
      >
        <Icon name="lucide:unplug" class="h-3.5 w-3.5" />
        Disconnect
      </button>
      <button
        v-if="conn.authType !== 'oauth2'"
        class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gumm-accent hover:bg-gumm-accent/10 transition-colors disabled:opacity-50"
        :disabled="isTesting"
        @click="$emit('test', conn)"
      >
        <Icon :name="isTesting ? 'lucide:loader' : 'lucide:zap'" class="h-3.5 w-3.5" :class="isTesting ? 'animate-spin' : ''" />
        {{ isTesting ? 'Testing…' : 'Test' }}
      </button>
      <button
        class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-colors"
        @click="$emit('edit', conn)"
      >
        <Icon name="lucide:pencil" class="h-3.5 w-3.5" />
      </button>
      <button
        class="ml-auto rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
        @click="$emit('delete', conn)"
      >
        <Icon name="lucide:trash-2" class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</template>
