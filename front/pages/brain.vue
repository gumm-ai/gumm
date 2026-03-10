<script setup lang="ts">
definePageMeta({ layout: 'default' });

function handleRefreshAll() {
  window.location.reload();
}
</script>

<template>
  <div class="flex h-full flex-col bg-gumm-bg">
    <header class="shrink-0 border-b border-white/[0.06] bg-gumm-bg/80 backdrop-blur-sm sticky top-0 z-10">
      <div class="flex items-center gap-3 px-6 h-14">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03]">
          <Icon name="lucide:brain" class="h-4 w-4 text-white/70" />
        </div>
        <div>
          <h1 class="text-sm font-medium text-white tracking-tight">Brain</h1>
          <p class="text-[11px] text-white/40">Identity, memory & configuration</p>
        </div>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-5xl mx-auto p-6 space-y-6">
        <BrainStats />
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="space-y-6">
            <BrainIdentity />
            <BrainLLMProvider />
          </div>
          <div class="space-y-6">
            <BrainActiveModules />
            <BrainTelegram />
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BrainPersonalFacts />
          <BrainMemory />
        </div>

        <BrainEvents />
        <BrainFreshStart @refresh-all="handleRefreshAll" />
      </div>
    </div>
  </div>
</template>
