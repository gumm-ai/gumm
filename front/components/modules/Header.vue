<script setup lang="ts">
defineProps<{
  totalInstalled: number;
}>();

defineEmits<{
  reload: [];
}>();
</script>

<template>
  <header class="shrink-0 border-b border-white/[0.06] bg-gumm-bg/80 backdrop-blur-sm sticky top-0 z-10">
    <div class="flex items-center justify-between px-6 h-14">
      <div class="flex items-center gap-3">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03]">
          <Icon name="lucide:boxes" class="h-4 w-4 text-white/70" />
        </div>
        <div>
          <h1 class="text-sm font-medium text-white tracking-tight">Modules</h1>
          <p class="text-[11px] text-white/40">Extend Gumm's capabilities</p>
        </div>
        <span class="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/50">{{ totalInstalled }} installed</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-white/50 transition-all hover:bg-white/[0.04] hover:text-white/80"
          @click="$emit('reload')"
        >
          <Icon name="lucide:refresh-cw" class="h-3.5 w-3.5" />
          Reload
        </button>
        <NuxtLink
          to="/modules/install"
          class="flex items-center gap-1.5 rounded-lg bg-white text-black px-3 py-1.5 text-xs font-medium transition-all hover:bg-white/90"
        >
          <Icon name="lucide:plus" class="h-3.5 w-3.5" />
          From GitHub
        </NuxtLink>
      </div>
    </div>
  </header>
</template>
