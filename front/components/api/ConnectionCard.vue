<script setup lang="ts">
import type { ApiConnection } from '~/types/api';
import {
  getProviderForConnection,
  statusColor,
  statusBorder,
  authTypeLabels,
  isModuleConnection,
} from '~/utils/apiProviders';

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

// Get provider info (works for both built-in and module configs)
const provider = computed(() => getProviderForConnection(props.conn));
const isModule = computed(() => isModuleConnection(props.conn));
const moduleId = computed(
  () => props.conn.config?._moduleId as string | undefined,
);

// Filter config keys to display (skip metadata fields starting with _)
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
    class="rounded-xl border bg-gumm-surface p-3.5 transition-all duration-200 hover:border-gumm-border-hover"
    :class="statusBorder(conn.status)"
  >
    <!-- Card header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span
          class="h-2 w-2 rounded-full"
          :class="[
            statusColor(conn.status),
            conn.status === 'connected' ? 'animate-pulse-dot' : '',
          ]"
        />
        <div class="flex items-center gap-2">
          <div
            v-if="provider"
            class="flex h-6 w-6 items-center justify-center rounded-md border"
            :class="provider.color"
          >
            <Icon :name="provider.icon" class="h-3.5 w-3.5" />
          </div>
          <h3 class="font-semibold text-sm">{{ conn.name }}</h3>
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        <!-- Module badge -->
        <span
          v-if="isModule"
          class="rounded-md bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-400 border border-purple-500/20"
          :title="`Required by module: ${moduleId}`"
        >
          <Icon name="lucide:puzzle" class="inline h-2.5 w-2.5 mr-0.5" />
          Module
        </span>
        <span
          class="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-gumm-muted"
        >
          {{ authTypeLabels[conn.authType] || conn.authType }}
        </span>
      </div>
    </div>

    <!-- Provider + ID -->
    <div class="mt-1.5 flex items-center gap-2 text-xs text-gumm-muted">
      <span class="font-mono">{{ conn.id }}</span>
      <span class="text-gumm-border">·</span>
      <span class="capitalize">{{ conn.provider }}</span>
    </div>

    <!-- Config preview (masked keys, excluding metadata) -->
    <div
      v-if="Object.keys(displayConfig).length"
      class="mt-2 flex flex-wrap gap-1"
    >
      <span
        v-for="(val, key) in displayConfig"
        :key="key"
        class="rounded-md bg-gumm-bg px-1.5 py-0.5 text-[10px] text-gumm-muted font-mono"
      >
        {{ key }}
      </span>
    </div>

    <!-- Error -->
    <p
      v-if="conn.error"
      class="mt-2 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400"
    >
      {{ conn.error }}
    </p>

    <!-- Meta -->
    <div class="mt-2 flex items-center gap-3 text-xs text-gumm-muted">
      <span v-if="conn.lastTestedAt" class="flex items-center gap-1">
        <Icon name="lucide:activity" class="h-3 w-3" />
        Tested {{ formatDate(conn.lastTestedAt) }}
      </span>
      <span class="flex items-center gap-1">
        <Icon name="lucide:calendar" class="h-3 w-3" />
        {{ formatDate(conn.createdAt) }}
      </span>
    </div>

    <!-- Actions -->
    <div
      class="mt-3 flex items-center gap-1.5 border-t border-gumm-border pt-2.5"
    >
      <!-- OAuth: Connect / Disconnect -->
      <button
        v-if="conn.authType === 'oauth2' && conn.status !== 'connected'"
        class="flex items-center gap-1 rounded-lg bg-gumm-accent/10 px-2 py-1 text-xs text-gumm-accent transition-colors hover:bg-gumm-accent/20 disabled:opacity-50"
        :disabled="isOAuthConnecting"
        @click="$emit('connect', conn)"
      >
        <Icon
          :name="isOAuthConnecting ? 'lucide:loader' : 'lucide:log-in'"
          class="h-3 w-3"
          :class="isOAuthConnecting ? 'animate-spin' : ''"
        />
        {{ isOAuthConnecting ? 'Connecting…' : 'Connect' }}
      </button>
      <button
        v-if="conn.authType === 'oauth2' && conn.status === 'connected'"
        class="flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-400 transition-colors hover:bg-amber-500/20"
        @click="$emit('disconnect', conn)"
      >
        <Icon name="lucide:unplug" class="h-3 w-3" />
        Disconnect
      </button>
      <!-- Test (non-OAuth or as secondary for OAuth) -->
      <button
        v-if="conn.authType !== 'oauth2'"
        class="flex items-center gap-1 rounded-lg bg-gumm-accent/10 px-2 py-1 text-xs text-gumm-accent transition-colors hover:bg-gumm-accent/20 disabled:opacity-50"
        :disabled="isTesting"
        @click="$emit('test', conn)"
      >
        <Icon
          :name="isTesting ? 'lucide:loader' : 'lucide:zap'"
          class="h-3 w-3"
          :class="isTesting ? 'animate-spin' : ''"
        />
        {{ isTesting ? 'Testing…' : 'Test' }}
      </button>
      <button
        class="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gumm-muted transition-colors hover:bg-white/5 hover:text-gumm-text"
        @click="$emit('edit', conn)"
      >
        <Icon name="lucide:pencil" class="h-3 w-3" />
        Edit
      </button>
      <button
        class="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10"
        @click="$emit('delete', conn)"
      >
        <Icon name="lucide:trash-2" class="h-3 w-3" />
      </button>
    </div>
  </div>
</template>
