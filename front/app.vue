<script setup lang="ts">
import type { BrainEvent } from './composables/useEventStream';

const toast = ref<InstanceType<typeof AppToast> | null>(null);

// Provide toast function globally
provide(
  'toast',
  (msg: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    toast.value?.addToast({ message: msg, type });
  },
);

// ── Real-time SSE events → toast notifications ────────────────────────
const { lastEvent } = useEventStream();

const eventToast: Record<
  string,
  {
    msg: (e: BrainEvent) => string;
    type: 'success' | 'error' | 'info' | 'warning';
  }
> = {
  'module.installed': {
    msg: (e) => `Module "${(e.payload as any)?.id || 'unknown'}" installed`,
    type: 'success',
  },
  'module.updated': {
    msg: (e) =>
      `Module "${(e.payload as any)?.id || 'unknown'}" updated to v${(e.payload as any)?.version || '?'}`,
    type: 'success',
  },
  'module.uninstalled': {
    msg: (e) => `Module "${(e.payload as any)?.id || 'unknown'}" uninstalled`,
    type: 'info',
  },
  'module.enabled': {
    msg: (e) => `Module "${(e.payload as any)?.id || 'unknown'}" enabled`,
    type: 'success',
  },
  'module.disabled': {
    msg: (e) => `Module "${(e.payload as any)?.id || 'unknown'}" disabled`,
    type: 'warning',
  },
  'module.error': {
    msg: (e) => `Module error: ${(e.payload as any)?.error || 'unknown'}`,
    type: 'error',
  },
  'memory.updated': { msg: () => 'Memory updated', type: 'info' },
};

watch(lastEvent, (ev) => {
  if (!ev) return;
  const mapping = eventToast[ev.type];
  if (mapping) {
    toast.value?.addToast({ message: mapping.msg(ev), type: mapping.type });
  }
});
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <AppToast ref="toast" />
</template>
