<script setup lang="ts">
export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

const toasts = ref<Toast[]>([]);

function addToast(toast: Omit<Toast, 'id'>) {
  const id = crypto.randomUUID();
  toasts.value.push({ ...toast, id });
  setTimeout(() => removeToast(id), toast.duration || 4000);
}

function removeToast(id: string) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

// Expose for parent usage
defineExpose({ addToast });

const iconMap: Record<string, string> = {
  success: 'lucide:check-circle',
  error: 'lucide:x-circle',
  info: 'lucide:info',
  warning: 'lucide:alert-triangle',
};

const colorMap: Record<string, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10',
  error: 'border-red-500/30 bg-red-500/10',
  info: 'border-gumm-accent/30 bg-gumm-accent/10',
  warning: 'border-amber-500/30 bg-amber-500/10',
};

const iconColorMap: Record<string, string> = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  info: 'text-gumm-accent',
  warning: 'text-amber-400',
};
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
    >
      <TransitionGroup
        enter-active-class="transition-all duration-200 ease-out"
        leave-active-class="transition-all duration-150 ease-in"
        enter-from-class="translate-x-4 opacity-0 scale-95"
        leave-to-class="translate-x-4 opacity-0 scale-95"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto flex items-center gap-2.5 rounded-xl border bg-gumm-surface px-3.5 py-2.5 text-xs text-gumm-text shadow-lg backdrop-blur-sm"
          :class="colorMap[toast.type] || colorMap.info"
        >
          <Icon
            :name="iconMap[toast.type] || iconMap.info"
            class="h-4 w-4 shrink-0"
            :class="iconColorMap[toast.type] || iconColorMap.info"
          />
          <span class="max-w-64 truncate">{{ toast.message }}</span>
          <button
            class="ml-1 text-gumm-muted hover:text-gumm-text transition-colors"
            @click="removeToast(toast.id)"
          >
            <Icon name="lucide:x" class="h-3 w-3" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
