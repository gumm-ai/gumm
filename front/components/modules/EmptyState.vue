<script setup lang="ts">
defineProps<{
  icon?: string;
  iconStyle?: 'solid' | 'dashed';
  title: string;
  description: string;
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center py-12 text-center">
    <div
      v-if="icon"
      class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gumm-surface text-gumm-muted mb-4"
      :class="
        iconStyle === 'dashed'
          ? 'border border-dashed border-gumm-border'
          : 'border border-gumm-border'
      "
    >
      <Icon :name="icon" class="h-6 w-6" />
    </div>
    <p class="text-sm font-medium text-gumm-text mb-1">
      {{ title }}
    </p>
    <p
      class="text-xs text-gumm-muted"
      :class="{ 'max-w-sm': iconStyle === 'dashed' }"
    >
      <!-- We can use v-html for description if it contains HTML (like <code>) or slots. Let's provide a slot for description to be safe -->
      <slot name="description">
        {{ description }}
      </slot>
    </p>
    <slot name="action" />
  </div>
</template>
