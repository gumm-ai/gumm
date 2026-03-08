<script setup lang="ts">
const activeTab = defineModel<'official' | 'custom'>('activeTab', {
  required: true,
});

defineProps<{
  officialCount: number;
  customCount: number;
}>();
</script>

<template>
  <div
    class="flex items-center gap-2 border-b border-gumm-border px-6 pt-4 pb-0 bg-gumm-bg shrink-0"
  >
    <button
      v-for="tab in [
        {
          id: 'official',
          label: 'Official Modules',
          count: officialCount,
        },
        {
          id: 'custom',
          label: 'Installed (Custom)',
          count: customCount,
        },
      ]"
      :key="tab.id"
      class="relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors"
      :class="
        activeTab === tab.id
          ? 'text-gumm-text'
          : 'text-gumm-muted hover:text-gumm-text'
      "
      @click="activeTab = tab.id as 'official' | 'custom'"
    >
      {{ tab.label }}
      <span
        class="rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors"
        :class="
          activeTab === tab.id
            ? 'bg-gumm-accent/20 text-gumm-accent'
            : 'bg-gumm-surface text-gumm-muted'
        "
        >{{ tab.count }}</span
      >
      <span
        v-if="activeTab === tab.id"
        class="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full bg-gumm-accent"
      />
    </button>
  </div>
</template>
