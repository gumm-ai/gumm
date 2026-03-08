<script setup lang="ts">
import type { OfficialModule } from '~/types/modules';

defineProps<{
  module: OfficialModule;
}>();

defineEmits<{
  close: [];
}>();
</script>

<template>
  <div class="mb-2 w-full flex items-center justify-between">
    <div class="flex items-center gap-2.5">
      <div
        class="flex h-8 w-8 items-center justify-center rounded-lg border shadow-sm"
        :class="module.color"
      >
        <Icon :name="module.icon" class="h-4 w-4" />
      </div>
      <h2 class="text-sm font-semibold text-gumm-text">
        Connect {{ module.name }}
      </h2>
    </div>
    <button
      class="text-gumm-muted transition-colors hover:text-gumm-text bg-gumm-surface hover:bg-gumm-bg border border-transparent hover:border-gumm-border p-1.5 rounded-lg"
      @click="$emit('close')"
    >
      <Icon name="lucide:x" class="h-4 w-4" />
    </button>
  </div>
</template>
