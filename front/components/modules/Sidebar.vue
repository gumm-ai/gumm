<script setup lang="ts">
const searchQuery = defineModel<string>('searchQuery', { default: '' });
const statusFilter = defineModel<'all' | 'installed' | 'not-installed'>('statusFilter', { default: 'all' });
const selectedCapability = defineModel<string>('selectedCapability', { default: '' });

defineProps<{
  activeTab: 'official' | 'custom';
  allCapabilities: string[];
}>();
</script>

<template>
  <aside class="w-60 border-r border-white/[0.06] bg-gumm-bg/50 flex flex-col shrink-0 overflow-y-auto">
    <div class="p-4 space-y-5">
      <div class="space-y-1.5">
        <label class="text-[10px] text-white/40 uppercase tracking-wider">Search</label>
        <div class="relative">
          <Icon name="lucide:search" class="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search modules..."
            class="w-full rounded-lg bg-white/[0.04] border border-white/[0.06] py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-white/20"
          />
        </div>
      </div>

      <div v-if="activeTab === 'official'" class="space-y-1.5">
        <label class="text-[10px] text-white/40 uppercase tracking-wider">Status</label>
        <div class="flex flex-col gap-0.5">
          <button
            v-for="status in [{ id: 'all', label: 'All' }, { id: 'installed', label: 'Installed' }, { id: 'not-installed', label: 'Available' }]"
            :key="status.id"
            class="text-left px-3 py-1.5 rounded-lg text-sm transition-colors"
            :class="statusFilter === status.id ? 'bg-white/[0.06] text-white/90' : 'text-white/50 hover:bg-white/[0.03] hover:text-white/70'"
            @click="statusFilter = status.id as any"
          >
            {{ status.label }}
          </button>
        </div>
      </div>

      <div v-if="allCapabilities.length" class="space-y-1.5">
        <label class="text-[10px] text-white/40 uppercase tracking-wider">Capabilities</label>
        <div class="flex flex-col gap-0.5">
          <button
            class="text-left px-3 py-1.5 rounded-lg text-sm transition-colors"
            :class="selectedCapability === '' ? 'bg-white/[0.06] text-white/90' : 'text-white/50 hover:bg-white/[0.03] hover:text-white/70'"
            @click="selectedCapability = ''"
          >
            All
          </button>
          <button
            v-for="cap in allCapabilities"
            :key="cap"
            class="text-left px-3 py-1.5 rounded-lg text-sm transition-colors capitalize"
            :class="selectedCapability === cap ? 'bg-white/[0.06] text-white/90' : 'text-white/50 hover:bg-white/[0.03] hover:text-white/70'"
            @click="selectedCapability = cap"
          >
            {{ cap }}
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
