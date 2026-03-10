<script setup lang="ts">
const activeTab = defineModel<'official' | 'custom'>('activeTab', { required: true });

defineProps<{
  officialCount: number;
  customCount: number;
}>();
</script>

<template>
  <div class="flex items-center gap-1 border-b border-white/[0.06] px-6 py-2 bg-gumm-bg/50 shrink-0">
    <button
      v-for="tab in [{ id: 'official', label: 'Official', count: officialCount }, { id: 'custom', label: 'Custom', count: customCount }]"
      :key="tab.id"
      class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
      :class="activeTab === tab.id ? 'bg-white/[0.06] text-white/90' : 'text-white/40 hover:text-white/60'"
      @click="activeTab = tab.id as 'official' | 'custom'"
    >
      {{ tab.label }}
      <span class="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/50">{{ tab.count }}</span>
    </button>
  </div>
</template>
