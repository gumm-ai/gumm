<script setup lang="ts">
import type { OfficialModule, ModuleInfo } from '~/types/modules';

defineProps<{
  official: OfficialModule;
  isInstalled: boolean;
  installedModule?: ModuleInfo;
  isFlashing: boolean;
  isInstalling: boolean;
}>();

defineEmits<{
  install: [];
  toggle: [module: ModuleInfo];
}>();
</script>

<template>
  <div
    class="rounded-xl border bg-gumm-surface p-4 transition-all duration-200"
    :class="[
      isInstalled
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : 'border-gumm-border hover:border-gumm-border-hover',
      isFlashing ? 'ring-2 ring-gumm-accent/50 animate-flash' : '',
    ]"
  >
    <!-- Module Header -->
    <div class="flex items-start justify-between mb-3">
      <div class="flex items-center gap-3">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm"
          :class="official.color"
        >
          <Icon :name="official.icon" class="h-5 w-5" />
        </div>
        <div>
          <h3 class="font-semibold text-sm text-gumm-text">
            {{ official.name }}
          </h3>
          <span
            v-if="official.repository !== 'built-in'"
            class="text-[10px] text-gumm-muted font-mono"
            >{{ official.repository }}</span
          >
        </div>
      </div>

      <div class="flex gap-1.5">
        <span
          v-if="official.setup?.type === 'navigate'"
          class="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-gumm-muted border border-gumm-border/50"
        >
          Built-in
        </span>
        <span
          v-else-if="isInstalled"
          class="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20"
        >
          <Icon name="lucide:check-circle-2" class="h-3 w-3" />
          Installed
        </span>
      </div>
    </div>

    <p class="text-xs text-gumm-muted line-clamp-2 min-h-[32px]">
      {{ official.description }}
    </p>

    <div class="mt-3 flex flex-wrap gap-1.5 min-h-[22px]">
      <span
        v-for="cap in official.capabilities"
        :key="cap"
        class="rounded-md bg-gumm-bg border border-gumm-border/50 px-2 py-0.5 text-[10px] text-gumm-muted"
      >
        {{ cap }}
      </span>
    </div>

    <!-- If installed, show runtime status and management -->
    <template v-if="isInstalled">
      <div
        v-if="installedModule?.runtimeError"
        class="mt-3 rounded-lg bg-red-500/10 px-2.5 py-2 text-xs text-red-400 border border-red-500/20"
      >
        <Icon name="lucide:alert-circle" class="h-3 w-3 inline mr-1" />
        {{ installedModule.runtimeError }}
      </div>

      <div
        class="mt-4 pt-3 flex items-center justify-between border-t border-gumm-border/50"
      >
        <div class="flex items-center gap-1.5">
          <span class="flex h-2 w-2 relative">
            <span
              class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              :class="{
                'bg-emerald-400': installedModule?.runtimeStatus === 'loaded',
                hidden: installedModule?.runtimeStatus !== 'loaded',
              }"
            ></span>
            <span
              class="relative inline-flex rounded-full h-2 w-2"
              :class="{
                'bg-emerald-500': installedModule?.runtimeStatus === 'loaded',
                'bg-amber-500': installedModule?.status === 'disabled',
                'bg-red-500': installedModule?.runtimeStatus === 'error',
                'bg-slate-500': installedModule?.runtimeStatus === 'not-loaded',
              }"
            ></span>
          </span>
          <span
            class="text-[10px] font-medium text-gumm-muted uppercase tracking-wider"
          >
            {{
              installedModule?.status === 'disabled'
                ? 'Disabled'
                : installedModule?.runtimeStatus
            }}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <NuxtLink
            :to="`/modules/${official.id}`"
            class="flex items-center gap-1 rounded-lg bg-gumm-accent/10 px-2.5 py-1.5 text-xs font-medium text-gumm-accent transition-colors hover:bg-gumm-accent/20"
          >
            <Icon name="lucide:settings-2" class="h-3.5 w-3.5" />
            Manage
          </NuxtLink>
          <button
            v-if="installedModule?.status !== 'disabled'"
            class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
            @click="$emit('toggle', installedModule!)"
          >
            Disable
          </button>
          <button
            v-else
            class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
            @click="$emit('toggle', installedModule!)"
          >
            Enable
          </button>
        </div>
      </div>
    </template>

    <!-- If not installed -->
    <template v-else>
      <div
        class="mt-4 pt-3 flex items-center justify-end border-t border-gumm-border/50"
      >
        <NuxtLink
          v-if="official.setup?.type === 'navigate'"
          :to="official.setup.route"
          class="flex items-center gap-1.5 rounded-lg bg-gumm-accent px-3 py-1.5 text-xs font-medium text-gumm-bg transition-colors hover:bg-gumm-accent-hover"
        >
          <Icon name="lucide:arrow-right" class="h-3.5 w-3.5" />
          Configure to enable
        </NuxtLink>
        <button
          v-else
          class="flex items-center gap-1.5 rounded-lg bg-gumm-accent px-3 py-1.5 text-xs font-medium text-gumm-bg transition-colors hover:bg-gumm-accent-hover disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          :disabled="isInstalling"
          @click="$emit('install')"
        >
          <Icon
            :name="isInstalling ? 'lucide:loader' : 'lucide:download'"
            class="h-3.5 w-3.5"
            :class="isInstalling ? 'animate-spin' : ''"
          />
          {{ isInstalling ? 'Installing…' : 'Install' }}
        </button>
      </div>
    </template>
  </div>
</template>
