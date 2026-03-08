<script setup lang="ts">
defineProps<{
  email: string;
  error: string;
  loading: boolean;
}>();

defineEmits<{
  finish: [];
}>();
</script>

<template>
  <div class="space-y-6 w-full py-4">
    <div class="flex flex-col items-center gap-4">
      <div
        class="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-inner"
      >
        <Icon name="lucide:check-circle-2" class="h-8 w-8" />
      </div>
      <div class="text-center space-y-1">
        <p class="text-base font-bold text-gumm-text">
          Connected successfully!
        </p>
        <p
          v-if="email"
          class="text-xs font-medium text-gumm-muted bg-gumm-surface px-2 py-1 rounded inline-block"
        >
          {{ email }}
        </p>
      </div>
    </div>

    <p
      v-if="error"
      class="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-500 border border-red-500/20 text-center"
    >
      {{ error }}
    </p>

    <button
      class="w-full rounded-xl bg-gumm-accent px-5 py-3 text-xs font-bold text-gumm-bg transition-all hover:bg-gumm-accent-hover shadow-md hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="loading"
      @click="$emit('finish')"
    >
      {{ loading ? 'Activating Module…' : 'Finish & Enable Module' }}
    </button>
  </div>
</template>
