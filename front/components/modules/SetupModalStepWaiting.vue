<script setup lang="ts">
defineEmits<{
  close: [];
}>();
</script>

<template>
  <div class="flex flex-col items-center gap-5 py-8 w-full">
    <div class="relative">
      <div class="h-12 w-12 rounded-full border-2 border-gumm-accent/30" />
      <div class="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-gumm-accent" />
    </div>
    <div class="text-center space-y-1">
      <p class="text-sm font-medium text-white/90">Waiting for authorization…</p>
      <p class="text-[11px] text-white/40 max-w-[240px] mx-auto leading-relaxed">
        Complete the sign-in in the secure Google popup window that just opened.
      </p>
    </div>
    <button
      class="mt-4 rounded-lg border border-white/[0.06] px-6 py-2 text-xs font-medium text-white/50 transition-colors hover:bg-white/[0.04] hover:text-white/70"
      @click="$emit('close')"
    >
      Cancel Setup
    </button>
  </div>
</template>
