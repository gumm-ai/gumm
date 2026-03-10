<script setup lang="ts">
const route = useRoute();

const navItems = [
  { label: 'Chat', to: '/', icon: 'lucide:message-square' },
  { label: 'Modules', to: '/modules', icon: 'lucide:blocks' },
  { label: 'APIs', to: '/apis', icon: 'lucide:plug' },
  { label: 'Commands', to: '/commands', icon: 'lucide:terminal' },
  { label: 'Tasks', to: '/tasks', icon: 'lucide:clock' },
  { label: 'Jobs', to: '/jobs', icon: 'lucide:layers' },
  { label: 'Devices', to: '/devices', icon: 'lucide:monitor-smartphone' },
  { label: 'Brain', to: '/brain', icon: 'lucide:brain' },
  { label: 'History', to: '/history', icon: 'lucide:history' },
  { label: 'Settings', to: '/settings', icon: 'lucide:settings' },
];

const sidebarExpanded = ref(false);

const { data: sidebarModules } = useFetch<{ id: string; status: string; runtimeStatus: string }[]>('/api/modules', { lazy: true, server: false });

const hasModuleError = computed(
  () => sidebarModules.value?.some((m) => m.runtimeStatus === 'error' || m.status === 'error') ?? false
);

const { data: sidebarJobs, refresh: refreshSidebarJobs } = useFetch<{ jobs: { status: string }[] }>('/api/jobs', { lazy: true, server: false });

const runningJobsCount = computed(
  () => sidebarJobs.value?.jobs.filter((j) => j.status === 'running' || j.status === 'pending').length ?? 0
);

onMounted(() => {
  const es = new EventSource('/api/jobs/stream');
  es.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type?.startsWith('job.')) refreshSidebarJobs();
    } catch {}
  };
  onUnmounted(() => es.close());
});

interface UpdatesResponse {
  hasGummUpdate: boolean;
  moduleUpdatesCount: number;
  currentVersion: string;
  latestVersion: string;
  moduleUpdates: Array<{ id: string; name: string; currentVersion: string; latestVersion: string }>;
}

const { data: updatesData } = useFetch<UpdatesResponse>('/api/system/updates', { lazy: true, server: false });

const hasUpdates = computed(() => updatesData.value?.hasGummUpdate || (updatesData.value?.moduleUpdatesCount ?? 0) > 0);

const totalUpdatesCount = computed(() => {
  const moduleCount = updatesData.value?.moduleUpdatesCount ?? 0;
  const gummCount = updatesData.value?.hasGummUpdate ? 1 : 0;
  return moduleCount + gummCount;
});

const showUpdatesModal = ref(false);

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' });
  await navigateTo('/login');
}
</script>

<template>
  <div class="flex h-screen bg-gumm-bg text-white font-sans text-sm">
    <aside
      class="group flex flex-col border-r border-white/[0.06] bg-gumm-surface/50 transition-all duration-200 ease-out"
      :class="sidebarExpanded ? 'w-56' : 'w-16'"
      @mouseenter="sidebarExpanded = true"
      @mouseleave="sidebarExpanded = false"
    >
      <div class="flex h-14 items-center gap-3 px-4 border-b border-white/[0.06]">
        <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
          <Icon name="lucide:sparkles" class="h-3.5 w-3.5 text-white/70" />
        </div>
        <span v-if="sidebarExpanded" class="text-sm font-semibold text-white/90 tracking-tight">Gumm</span>
      </div>

      <nav class="flex flex-1 flex-col gap-0.5 px-2 py-3">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="relative flex h-9 items-center gap-3 rounded-lg px-3 text-white/50 transition-all duration-150 hover:bg-white/[0.04] hover:text-white/80"
          :class="{
            'bg-white/[0.06] text-white/90': item.to === '/' ? route.path === '/' : route.path.startsWith(item.to),
          }"
          :title="item.label"
        >
          <span
            v-if="item.to === '/' ? route.path === '/' : route.path.startsWith(item.to)"
            class="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-r-full bg-white/80"
          />
          <Icon :name="item.icon" class="h-[16px] w-[16px] shrink-0" />
          <span v-if="sidebarExpanded" class="truncate text-xs font-medium">{{ item.label }}</span>
          <span
            v-if="item.to === '/modules' && hasModuleError"
            class="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-400"
            title="Module error"
          />
          <span
            v-if="item.to === '/jobs' && runningJobsCount > 0"
            class="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 text-[10px] font-bold"
          >
            {{ runningJobsCount }}
          </span>
        </NuxtLink>
      </nav>

      <div class="border-t border-white/[0.06] px-2 py-2 flex flex-col gap-0.5">
        <button
          v-if="hasUpdates"
          class="relative flex h-9 w-full items-center gap-3 rounded-lg px-3 text-amber-400/80 transition-all hover:bg-amber-500/10"
          title="Updates available"
          @click="showUpdatesModal = true"
        >
          <Icon name="lucide:download" class="h-[16px] w-[16px] shrink-0" />
          <span v-if="sidebarExpanded" class="truncate text-xs font-medium">Updates</span>
          <span
            class="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500/20 px-1 text-[10px] font-bold text-amber-400"
          >
            {{ totalUpdatesCount }}
          </span>
        </button>

        <button
          class="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-white/40 transition-all hover:bg-red-500/10 hover:text-red-400"
          title="Logout"
          @click="logout"
        >
          <Icon name="lucide:log-out" class="h-[16px] w-[16px] shrink-0" />
          <span v-if="sidebarExpanded" class="truncate text-xs font-medium">Logout</span>
        </button>
      </div>
    </aside>

    <main class="flex-1 overflow-hidden">
      <slot />
    </main>

    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-150"
        leave-to-class="opacity-0"
      >
        <div
          v-if="showUpdatesModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          @click.self="showUpdatesModal = false"
        >
          <div class="w-full max-w-md rounded-xl bg-gumm-surface border border-white/[0.08] p-6 shadow-2xl">
            <div class="flex items-center justify-between mb-5">
              <h2 class="text-base font-medium text-white">Updates Available</h2>
              <button class="text-white/40 hover:text-white/80 transition-colors" @click="showUpdatesModal = false">
                <Icon name="lucide:x" class="h-5 w-5" />
              </button>
            </div>

            <div v-if="updatesData?.hasGummUpdate" class="mb-4">
              <div class="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20">
                  <Icon name="lucide:sparkles" class="h-4 w-4 text-amber-400" />
                </div>
                <div class="flex-1">
                  <p class="text-sm font-medium text-white/90">Gumm Core</p>
                  <p class="text-xs text-white/50">
                    {{ updatesData?.currentVersion }} → <span class="text-amber-400">{{ updatesData?.latestVersion }}</span>
                  </p>
                </div>
              </div>
            </div>

            <div v-if="updatesData?.moduleUpdates?.length" class="space-y-2 mb-4">
              <p class="text-[10px] font-medium text-white/40 uppercase tracking-wider">Module Updates</p>
              <div
                v-for="mod in updatesData.moduleUpdates"
                :key="mod.id"
                class="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]"
              >
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
                  <Icon name="lucide:blocks" class="h-4 w-4 text-white/50" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-white/90 truncate">{{ mod.name }}</p>
                  <p class="text-xs text-white/40">
                    {{ mod.currentVersion }} → <span class="text-emerald-400">{{ mod.latestVersion }}</span>
                  </p>
                </div>
              </div>
            </div>

            <div class="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3">
              <p class="text-[10px] text-white/40 mb-1.5 font-medium uppercase tracking-wider">Update command</p>
              <code class="block text-xs text-emerald-400 font-mono">sudo gumm update</code>
            </div>

            <button
              class="mt-4 w-full py-2 rounded-lg bg-white/[0.06] text-sm font-medium text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors"
              @click="showUpdatesModal = false"
            >
              Close
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
