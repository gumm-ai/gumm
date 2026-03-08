<script setup lang="ts">
definePageMeta({ layout: 'default' });

function handleRefreshAll() {
  // Reload the page to refresh all data after a fresh start
  window.location.reload();
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <header
      class="flex items-center gap-2.5 border-b border-gumm-border px-4 py-2.5"
    >
      <Icon name="lucide:brain" class="h-4 w-4 text-gumm-accent" />
      <h1 class="text-base font-semibold">Brain Dashboard</h1>
    </header>

    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <BrainStats />
      <BrainIdentity />
      <BrainPersonalFacts />
      <BrainOpenRouter />
      <BrainMistral />
      <BrainTelegram />
      <BrainActiveModules />
      <BrainMemory />
      <BrainEvents />
      <BrainFreshStart @refresh-all="handleRefreshAll" />
    </div>
  </div>
</template>
