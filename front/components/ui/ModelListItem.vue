<script setup lang="ts">
export interface ModelItemData {
  id: string;
  name: string;
  provider: string;
  description?: string;
  modalities?: string[];
  context?: string;
  price?: string;
  flag?: string;
  recommended?: boolean;
}

defineProps<{
  model: ModelItemData;
  selected?: boolean;
  current?: boolean;
  showArrow?: boolean;
}>();

defineEmits<{
  click: [];
}>();

const modalityIcons: Record<string, { icon: string; color: string }> = {
  text: { icon: 'lucide:type', color: 'text-gumm-muted' },
  image: { icon: 'lucide:image', color: 'text-sky-400' },
  audio: { icon: 'lucide:mic', color: 'text-amber-400' },
  video: { icon: 'lucide:video', color: 'text-rose-400' },
};
</script>

<template>
  <button
    type="button"
    class="w-full rounded-lg px-3 py-2.5 text-left transition-colors duration-150"
    :class="
      selected || current
        ? 'bg-gumm-accent/10 border border-gumm-accent/30'
        : 'border border-transparent hover:bg-white/5'
    "
    @click="$emit('click')"
  >
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <span
          class="h-2 w-2 rounded-full shrink-0"
          :class="selected || current ? 'bg-gumm-accent' : 'bg-gumm-muted/30'"
        />
        <span class="text-sm font-medium text-gumm-text truncate">{{
          model.name
        }}</span>
        <span v-if="model.flag" class="text-sm shrink-0">{{ model.flag }}</span>
        <span class="text-[10px] text-gumm-muted shrink-0">{{
          model.provider
        }}</span>
        <span
          v-if="model.recommended"
          class="rounded bg-gumm-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-gumm-accent shrink-0"
        >
          recommended
        </span>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <span v-if="model.context" class="text-[10px] text-gumm-muted">{{
          model.context
        }}</span>
        <Icon
          v-if="showArrow"
          name="lucide:chevron-right"
          class="h-3.5 w-3.5 text-gumm-muted"
        />
      </div>
    </div>
    <p
      v-if="model.description"
      class="mt-1 text-[11px] text-gumm-muted line-clamp-1"
    >
      {{ model.description }}
    </p>
    <div
      v-if="model.modalities?.length || model.price"
      class="mt-1.5 flex items-center gap-3"
    >
      <div v-if="model.modalities?.length" class="flex items-center gap-1">
        <Icon
          v-for="mod in model.modalities"
          :key="mod"
          :name="modalityIcons[mod]?.icon || 'lucide:circle'"
          class="h-3 w-3"
          :class="modalityIcons[mod]?.color || 'text-gumm-muted'"
          :title="mod"
        />
      </div>
      <span v-if="model.price" class="text-[10px] text-gumm-muted"
        >{{ model.price }} per 1M tokens</span
      >
    </div>
  </button>
</template>
