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
    class="rounded-xl border p-4 transition-all duration-200"
    :class="[
      isInstalled ? 'border-emerald-500/20 bg-emerald-500/[0.02]' : 'border-white/[0.06] bg-white/[0.01]',
      isFlashing ? 'ring-2 ring-gumm-accent/50 animate-flash' : '',
    ]"
  >
    <div class="flex items-start justify-between mb-3">
      <div class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 items-center justify-center rounded-lg border shadow-sm"
          :class="official.color"
        >
          <Icon :name="official.icon" class="h-4 w-4" />
        </div>
        <div>
          <h3 class="font-medium text-sm text-white/90">{{ official.name }}</h3>
          <span v-if="official.repository !== 'built-in'" class="text-[10px] text-white/30 font-mono">
            {{ official.repository }}
          </span>
        </div>
      </div>

      <span
        v-if="isInstalled"
        class="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
      >
        <Icon name="lucide:check" class="h-3 w-3" />
        Installed
      </span>
    </div>

    <p class="text-xs text-white/40 line-clamp-2 min-h-[32px]">{{ official.description }}</p>

    <div v-if="official.capabilities?.length" class="mt-3 flex flex-wrap gap-1.5">
      <span
        v-for="cap in official.capabilities"
        :key="cap"
        class="rounded-md bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 text-[10px] text-white/40"
      >
        {{ cap }}
      </span>
    </div>

    <template v-if="isInstalled">
      <div v-if="installedModule?.runtimeError" class="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400 border border-red-500/20">
        <Icon name="lucide:alert-circle" class="h-3 w-3 inline mr-1" />
        {{ installedModule.runtimeError }}
      </div>

      <div class="mt-4 pt-3 flex items-center justify-between border-t border-white/[0.06]">
        <div class="flex items-center gap-2">
          <span class="flex h-2 w-2 relative">
            <span
              class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              :class="{ 'bg-emerald-400': installedModule?.runtimeStatus === 'loaded', hidden: installedModule?.runtimeStatus !== 'loaded' }"
            ></span>
            <span
              class="relative inline-flex rounded-full h-2 w-2"
              :class="{
                'bg-emerald-500': installedModule?.runtimeStatus === 'loaded',
                'bg-amber-500': installedModule?.status === 'disabled',
                'bg-red-500': installedModule?.runtimeStatus === 'error',
                'bg-white/20': installedModule?.runtimeStatus === 'not-loaded',
              }"
            ></span>
          </span>
          <span class="text-[10px] font-medium text-white/40 uppercase tracking-wider">
            {{ installedModule?.status === 'disabled' ? 'Disabled' : installedModule?.runtimeStatus }}
          </span>
        </div>

        <div class="flex items-center gap-1.5">
          <NuxtLink
            :to="`/modules/${official.id}`"
            class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-colors"
          >
            <Icon name="lucide:settings-2" class="h-3.5 w-3.5" />
          </NuxtLink>
          <button
            v-if="installedModule?.status !== 'disabled'"
            class="rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
            @click="$emit('toggle', installedModule!)"
          >
            Disable
          </button>
          <button
            v-else
            class="rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            @click="$emit('toggle', installedModule!)"
          >
            Enable
          </button>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="mt-4 pt-3 flex items-center justify-end border-t border-white/[0.06]">
        <NuxtLink
          v-if="official.setup?.type === 'navigate'"
          :to="official.setup.route"
          class="flex items-center gap-1.5 rounded-lg bg-white text-black px-3 py-1.5 text-xs font-medium transition-all hover:bg-white/90"
        >
          <Icon name="lucide:arrow-right" class="h-3.5 w-3.5" />
          Configure
        </NuxtLink>
        <button
          v-else
          class="flex items-center gap-1.5 rounded-lg bg-white text-black px-3 py-1.5 text-xs font-medium transition-all hover:bg-white/90 disabled:opacity-50"
          :disabled="isInstalling"
          @click="$emit('install')"
        >
          <Icon :name="isInstalling ? 'lucide:loader' : 'lucide:plus'" class="h-3.5 w-3.5" :class="isInstalling ? 'animate-spin' : ''" />
          {{ isInstalling ? 'Installing…' : 'Install' }}
        </button>
      </div>
    </template>
  </div>
</template>
