<script setup lang="ts">
import type { ModuleInfo } from '~/types/modules';

const props = defineProps<{
  module: ModuleInfo;
  isFlashing: boolean;
  isUpdating: boolean;
  isDisabled: boolean;
}>();

defineEmits<{
  toggle: [];
  update: [];
  uninstall: [];
}>();

function borderColor(module: ModuleInfo | undefined): string {
  if (!module) return 'border-white/[0.06]';
  if (module.status === 'disabled') return 'border-amber-500/20';
  if (module.runtimeStatus === 'error' || module.status === 'error') return 'border-red-500/20';
  if (module.runtimeStatus === 'loaded') return 'border-emerald-500/20';
  return 'border-white/[0.06]';
}
</script>

<template>
  <div
    v-if="!isDisabled"
    class="rounded-xl border p-4 transition-all duration-200 cursor-pointer"
    :class="[borderColor(module), isFlashing ? 'ring-2 ring-gumm-accent/50 animate-flash' : '']"
    @click="navigateTo(`/modules/${module.id}`)"
  >
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2.5">
        <span class="flex h-2 w-2 relative">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <h3 class="font-medium text-sm text-white/90">{{ module.name }}</h3>
      </div>
      <div class="flex items-center gap-1.5">
        <span v-if="module.source === 'github'" class="flex items-center rounded bg-white/[0.04] px-1.5 py-0.5 text-white/40" title="GitHub">
          <Icon name="lucide:github" class="h-3 w-3" />
        </span>
        <span v-else class="flex items-center rounded bg-white/[0.04] px-1.5 py-0.5 text-white/40" title="Local">
          <Icon name="lucide:folder" class="h-3 w-3" />
        </span>
        <span class="text-[10px] font-mono text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded">v{{ module.version }}</span>
      </div>
    </div>

    <p class="text-xs text-white/40 line-clamp-2 min-h-[32px] mt-2 mb-3">{{ module.description }}</p>

    <div v-if="module.capabilities?.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="cap in module.capabilities"
        :key="cap"
        class="rounded-md bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 text-[10px] text-white/40"
      >
        {{ cap }}
      </span>
    </div>

    <div v-if="module.runtimeError || module.error" class="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400 border border-red-500/20">
      <Icon name="lucide:alert-circle" class="h-3 w-3 inline mr-1" />
      {{ module.runtimeError || module.error }}
    </div>

    <div class="mt-4 pt-3 flex items-center justify-between border-t border-white/[0.06]" @click.stop>
      <button
        class="rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
        @click="$emit('toggle')"
      >
        Disable
      </button>

      <div class="flex gap-1.5">
        <button
          v-if="module.source === 'github' && module.updateAvailable"
          class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gumm-accent hover:bg-gumm-accent/10 transition-colors"
          :disabled="isUpdating"
          @click="$emit('update')"
        >
          <Icon :name="isUpdating ? 'lucide:loader' : 'lucide:download'" class="h-3.5 w-3.5" :class="isUpdating ? 'animate-spin' : ''" />
          {{ isUpdating ? 'Updating...' : `v${module.remoteVersion}` }}
        </button>
        <button
          class="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
          @click="$emit('uninstall')"
        >
          <Icon name="lucide:trash-2" class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  </div>

  <div
    v-else
    class="rounded-xl border border-amber-500/20 bg-amber-500/[0.02] p-4 transition-all duration-200 cursor-pointer opacity-60 hover:opacity-100"
    :class="[isFlashing ? 'ring-2 ring-gumm-accent/50 animate-flash' : '']"
    @click="navigateTo(`/modules/${module.id}`)"
  >
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2.5">
        <span class="h-2 w-2 rounded-full bg-amber-500"></span>
        <h3 class="font-medium text-sm text-white/90">{{ module.name }}</h3>
      </div>
      <span class="text-[10px] font-mono text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded">v{{ module.version }}</span>
    </div>

    <p class="text-xs text-white/40 line-clamp-2 min-h-[32px] mt-2 mb-3">{{ module.description }}</p>

    <div class="mt-4 pt-3 flex items-center justify-between border-t border-white/[0.06]" @click.stop>
      <button
        class="rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors"
        @click="$emit('toggle')"
      >
        Enable
      </button>

      <button
        class="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
        @click="$emit('uninstall')"
      >
        <Icon name="lucide:trash-2" class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</template>
