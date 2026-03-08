<script setup lang="ts">
const searchQuery = defineModel<string>('searchQuery', { default: '' });
const statusFilter = defineModel<'all' | 'installed' | 'not-installed'>(
  'statusFilter',
  { default: 'all' },
);
const selectedCapability = defineModel<string>('selectedCapability', {
  default: '',
});

defineProps<{
  activeTab: 'official' | 'custom';
  allCapabilities: string[];
}>();
</script>

<template>
  <aside
    class="w-64 border-r border-gumm-border bg-gumm-bg flex flex-col shrink-0 overflow-y-auto"
  >
    <div class="p-4 space-y-6">
      <!-- Search -->
      <div class="space-y-2">
        <h3
          class="text-xs font-semibold text-gumm-muted uppercase tracking-wider"
        >
          Search
        </h3>
        <div class="relative">
          <Icon
            name="lucide:search"
            class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gumm-muted"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search modules..."
            class="w-full rounded-xl border border-gumm-border bg-gumm-surface py-2 pl-9 pr-3 text-sm text-gumm-text placeholder:text-gumm-muted/50 outline-none transition-all focus:ring-1 focus:ring-gumm-accent focus:border-gumm-accent"
          />
        </div>
      </div>

      <!-- Filters -->
      <div v-if="activeTab === 'official'" class="space-y-2">
        <h3
          class="text-xs font-semibold text-gumm-muted uppercase tracking-wider"
        >
          Status
        </h3>
        <div class="flex flex-col gap-1">
          <button
            v-for="status in [
              { id: 'all', label: 'All Modules' },
              { id: 'installed', label: 'Installed' },
              { id: 'not-installed', label: 'Not Installed' },
            ]"
            :key="status.id"
            class="text-left px-3 py-1.5 rounded-lg text-sm transition-colors"
            :class="
              statusFilter === status.id
                ? 'bg-gumm-accent/10 text-gumm-accent'
                : 'text-gumm-muted hover:bg-gumm-surface hover:text-gumm-text'
            "
            @click="statusFilter = status.id as any"
          >
            {{ status.label }}
          </button>
        </div>
      </div>

      <!-- Categories -->
      <div class="space-y-2">
        <h3
          class="text-xs font-semibold text-gumm-muted uppercase tracking-wider"
        >
          Capabilities
        </h3>
        <div class="flex flex-col gap-1">
          <button
            class="text-left px-3 py-1.5 rounded-lg text-sm transition-colors"
            :class="
              selectedCapability === ''
                ? 'bg-gumm-accent/10 text-gumm-accent'
                : 'text-gumm-muted hover:bg-gumm-surface hover:text-gumm-text'
            "
            @click="selectedCapability = ''"
          >
            All Capabilities
          </button>
          <button
            v-for="cap in allCapabilities"
            :key="cap"
            class="text-left px-3 py-1.5 rounded-lg text-sm transition-colors"
            :class="
              selectedCapability === cap
                ? 'bg-gumm-accent/10 text-gumm-accent'
                : 'text-gumm-muted hover:bg-gumm-surface hover:text-gumm-text'
            "
            @click="selectedCapability = cap"
          >
            <span class="capitalize">{{ cap }}</span>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
