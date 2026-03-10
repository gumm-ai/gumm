<script setup lang="ts">
defineProps<{
  icon?: string;
  iconStyle?: 'solid' | 'dashed';
  title: string;
  description: string;
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center py-16 text-center">
    <div
      v-if="icon"
      class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.03] border mb-4"
      :class="iconStyle === 'dashed' ? 'border-dashed border-white/[0.1]' : 'border-white/[0.06]'"
    >
      <Icon :name="icon" class="h-6 w-6 text-white/50" />
    </div>
    <p class="text-base font-medium text-white/90 mb-1">{{ title }}</p>
    <p class="text-sm text-white/40 max-w-sm">
      <slot name="description">{{ description }}</slot>
    </p>
    <slot name="action" />
  </div>
</template>
