<script setup lang="ts">
defineProps<{
  totalInstalled: number;
}>();

defineEmits<{
  reload: [];
}>();
</script>

<template>
  <header
    class="flex items-center justify-between border-b border-gumm-border px-4 py-2.5 shrink-0"
  >
    <div class="flex items-center gap-2.5">
      <Icon name="lucide:palmtree" class="h-5 w-5 text-emerald-400" />
      <h1 class="text-base font-semibold">Modules</h1>
      <span
        class="rounded-md bg-gumm-surface px-1.5 py-0.5 text-xs text-gumm-muted"
      >
        {{ totalInstalled }} total installed
      </span>
    </div>
    <div class="flex items-center gap-2">
      <NuxtLink
        to="/modules/install"
        class="flex items-center gap-1.5 rounded-lg bg-gumm-accent px-3 py-1.5 text-xs font-medium text-gumm-bg transition-colors hover:bg-gumm-accent-hover"
      >
        <Icon name="lucide:plus" class="h-3.5 w-3.5" />
        From GitHub
      </NuxtLink>
      <button
        class="flex items-center gap-1.5 rounded-lg border border-gumm-border px-3 py-1.5 text-xs text-gumm-muted transition-all duration-150 hover:bg-white/5 hover:text-gumm-text hover:border-gumm-border-hover"
        @click="$emit('reload')"
      >
        <Icon name="lucide:refresh-cw" class="h-3.5 w-3.5" />
        Reload
      </button>
    </div>
  </header>
</template>
