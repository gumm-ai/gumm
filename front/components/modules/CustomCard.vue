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
  if (!module) return 'border-gumm-border';
  if (module.status === 'disabled') return 'border-amber-500/20';
  if (module.runtimeStatus === 'error' || module.status === 'error')
    return 'border-red-500/20';
  if (module.runtimeStatus === 'loaded') return 'border-emerald-500/20';
  return 'border-gumm-border';
}
</script>

<template>
  <div
    v-if="!isDisabled"
    class="rounded-xl border bg-gumm-surface p-4 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md"
    :class="[
      borderColor(module),
      isFlashing ? 'ring-2 ring-gumm-accent/50 animate-flash' : '',
    ]"
    @click="navigateTo(`/modules/${module.id}`)"
  >
    <!-- Header -->
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2.5">
        <span class="flex h-2.5 w-2.5 relative">
          <span
            class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400"
          ></span>
          <span
            class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"
          ></span>
        </span>
        <h3 class="font-semibold text-sm text-gumm-text">
          {{ module.name }}
        </h3>
      </div>
      <div class="flex items-center gap-1.5">
        <span
          v-if="module.source === 'github'"
          class="flex items-center rounded-md bg-white/5 border border-gumm-border/50 px-1.5 py-0.5 text-gumm-muted"
          title="GitHub"
        >
          <Icon name="lucide:github" class="h-3 w-3" />
        </span>
        <span
          v-else
          class="flex items-center rounded-md bg-white/5 border border-gumm-border/50 px-1.5 py-0.5 text-gumm-muted"
          title="Local"
        >
          <Icon name="lucide:folder" class="h-3 w-3" />
        </span>
        <span
          class="text-xs font-mono text-gumm-muted bg-gumm-bg px-1.5 py-0.5 rounded border border-gumm-border/30"
          >v{{ module.version }}</span
        >
      </div>
    </div>

    <p class="text-xs text-gumm-muted line-clamp-2 min-h-[32px] mt-2 mb-3">
      {{ module.description }}
    </p>

    <div
      v-if="module.capabilities?.length"
      class="flex flex-wrap gap-1.5 min-h-[22px]"
    >
      <span
        v-for="cap in module.capabilities"
        :key="cap"
        class="rounded-md bg-gumm-bg border border-gumm-border/50 px-2 py-0.5 text-[10px] text-gumm-muted"
      >
        {{ cap }}
      </span>
    </div>

    <div
      v-if="module.runtimeError || module.error"
      class="mt-3 rounded-lg bg-red-500/10 px-2.5 py-2 text-xs text-red-400 border border-red-500/20"
    >
      <Icon name="lucide:alert-circle" class="h-3 w-3 inline mr-1" />
      {{ module.runtimeError || module.error }}
    </div>

    <div
      class="mt-4 pt-3 flex items-center justify-between border-t border-gumm-border/50"
      @click.stop
    >
      <button
        class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
        @click="$emit('toggle')"
      >
        <Icon name="lucide:power-off" class="h-3.5 w-3.5" />
        Disable
      </button>

      <div class="flex gap-1.5">
        <button
          v-if="module.source === 'github' && module.updateAvailable"
          class="flex items-center gap-1 rounded-lg bg-gumm-accent/10 px-2.5 py-1.5 text-xs font-medium text-gumm-accent transition-colors hover:bg-gumm-accent/20"
          :disabled="isUpdating"
          @click="$emit('update')"
        >
          <Icon
            :name="isUpdating ? 'lucide:loader' : 'lucide:download'"
            class="h-3.5 w-3.5"
            :class="isUpdating ? 'animate-spin' : ''"
          />
          {{
            isUpdating ? 'Updating...' : `Update to v${module.remoteVersion}`
          }}
        </button>
        <button
          class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
          @click="$emit('uninstall')"
        >
          <Icon name="lucide:trash-2" class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  </div>

  <div
    v-else
    class="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 transition-all duration-200 cursor-pointer opacity-70 hover:opacity-100"
    :class="[isFlashing ? 'ring-2 ring-gumm-accent/50 animate-flash' : '']"
    @click="navigateTo(`/modules/${module.id}`)"
  >
    <!-- Header -->
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2.5">
        <span class="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-sm"></span>
        <h3 class="font-semibold text-sm text-gumm-text">
          {{ module.name }}
        </h3>
      </div>
      <div class="flex items-center gap-1.5">
        <span
          class="text-xs font-mono text-gumm-muted bg-gumm-bg px-1.5 py-0.5 rounded border border-gumm-border/30"
          >v{{ module.version }}</span
        >
      </div>
    </div>

    <p class="text-xs text-gumm-muted line-clamp-2 min-h-[32px] mt-2 mb-3">
      {{ module.description }}
    </p>

    <div
      class="mt-4 pt-3 flex items-center justify-between border-t border-gumm-border/50"
      @click.stop
    >
      <button
        class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20"
        @click="$emit('toggle')"
      >
        <Icon name="lucide:power" class="h-3.5 w-3.5" />
        Enable Module
      </button>

      <button
        class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
        @click="$emit('uninstall')"
      >
        <Icon name="lucide:trash-2" class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</template>
