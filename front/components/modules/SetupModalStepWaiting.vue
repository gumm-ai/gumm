<script setup lang="ts">
defineEmits<{
  close: [];
}>();
</script>

<template>
  <div class="flex flex-col items-center gap-5 py-8 w-full">
    <div class="relative">
      <div class="h-12 w-12 rounded-full border-2 border-gumm-accent/30" />
      <div
        class="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-gumm-accent"
      />
    </div>
    <div class="text-center space-y-1">
      <p class="text-sm font-semibold text-gumm-text">
        Waiting for authorization…
      </p>
      <p
        class="text-[11px] text-gumm-muted max-w-[240px] mx-auto leading-relaxed"
      >
        Complete the sign-in in the secure Google popup window that just opened.
      </p>
    </div>
    <button
      class="mt-4 rounded-xl border border-gumm-border px-6 py-2 text-xs font-medium text-gumm-muted transition-colors hover:bg-gumm-surface"
      @click="$emit('close')"
    >
      Cancel Setup
    </button>
  </div>
</template>
