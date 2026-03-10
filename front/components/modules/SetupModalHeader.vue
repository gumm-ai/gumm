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
    <div class="flex items-center gap-3">
      <div class="flex h-9 w-9 items-center justify-center rounded-lg border shadow-sm" :class="module.color">
        <Icon :name="module.icon" class="h-4 w-4" />
      </div>
      <h2 class="text-sm font-medium text-white/90">Connect {{ module.name }}</h2>
    </div>
    <button
      class="text-white/40 transition-colors hover:text-white/80 bg-white/[0.04] hover:bg-white/[0.06] p-1.5 rounded-lg"
      @click="$emit('close')"
    >
      <Icon name="lucide:x" class="h-4 w-4" />
    </button>
  </div>
</template>
