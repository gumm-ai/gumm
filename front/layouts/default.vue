<script setup lang="ts">
const route = useRoute();

const navItems = [
  { label: 'Chat', to: '/', icon: 'lucide:message-square' },
  { label: 'Isles', to: '/isles', icon: 'lucide:palmtree' },
  { label: 'APIs', to: '/apis', icon: 'lucide:plug' },
  { label: 'Commands', to: '/commands', icon: 'lucide:terminal' },
  { label: 'Tasks', to: '/tasks', icon: 'lucide:clock' },
  { label: 'Devices', to: '/devices', icon: 'lucide:monitor-smartphone' },
  { label: 'Brain', to: '/brain', icon: 'lucide:brain' },
  { label: 'History', to: '/history', icon: 'lucide:history' },
  { label: 'Settings', to: '/settings', icon: 'lucide:settings' },
];

const sidebarExpanded = ref(false);

// Fetch module status for sidebar error indicator
const { data: sidebarModules } = useFetch<
  { id: string; status: string; runtimeStatus: string }[]
>('/api/modules', { lazy: true, server: false });

const hasModuleError = computed(
  () =>
    sidebarModules.value?.some(
      (m) => m.runtimeStatus === 'error' || m.status === 'error',
    ) ?? false,
);

// Fetch updates status
interface UpdatesResponse {
  hasGummUpdate: boolean;
  moduleUpdatesCount: number;
  currentVersion: string;
  latestVersion: string;
  moduleUpdates: Array<{
    id: string;
    name: string;
    currentVersion: string;
    latestVersion: string;
  }>;
}

const { data: updatesData } = useFetch<UpdatesResponse>('/api/system/updates', {
  lazy: true,
  server: false,
});

const hasUpdates = computed(
  () =>
    updatesData.value?.hasGummUpdate ||
    (updatesData.value?.moduleUpdatesCount ?? 0) > 0,
);

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
  <div class="flex h-screen bg-gumm-bg text-gumm-text font-sans text-sm">
    <!-- Sidebar -->
    <aside
      class="group flex flex-col border-r border-gumm-border bg-gumm-surface transition-all duration-200 ease-out"
      :class="sidebarExpanded ? 'w-52' : 'w-16'"
      @mouseenter="sidebarExpanded = true"
      @mouseleave="sidebarExpanded = false"
    >
      <!-- Logo -->
      <div
        class="flex h-14 items-center gap-3 px-4 border-b border-gumm-border"
      >
        <div
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gumm-surface border border-gumm-border"
        >
          <Icon name="lucide:sparkles" class="h-3.5 w-3.5 text-gumm-text" />
        </div>
        <span
          v-if="sidebarExpanded"
          class="text-sm font-bold gradient-text truncate"
          >Gumm</span
        >
      </div>

      <!-- Nav -->
      <nav class="flex flex-1 flex-col gap-0.5 px-2 py-3">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="relative flex h-9 items-center gap-3 rounded-md px-3 text-gumm-muted transition-colors duration-150 hover:bg-gumm-border/30 hover:text-white"
          :class="{
            'bg-gumm-border/30 text-white font-medium':
              item.to === '/'
                ? route.path === '/'
                : route.path.startsWith(item.to),
          }"
          :title="item.label"
        >
          <!-- Active indicator bar -->
          <span
            v-if="
              item.to === '/'
                ? route.path === '/'
                : route.path.startsWith(item.to)
            "
            class="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-r-full bg-white"
          />
          <Icon :name="item.icon" class="h-[16px] w-[16px] shrink-0" />
          <span v-if="sidebarExpanded" class="truncate text-xs font-medium">{{
            item.label
          }}</span>
          <!-- Error badge on Modules nav item -->
          <span
            v-if="item.to === '/isles' && hasModuleError"
            class="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 animate-pulse-dot"
            title="A module has an error"
          />
        </NuxtLink>
      </nav>

      <!-- Bottom -->
      <div class="border-t border-gumm-border px-2 py-2 flex flex-col gap-0.5">
        <!-- Updates button -->
        <button
          v-if="hasUpdates"
          class="relative flex h-9 w-full items-center gap-3 rounded-md px-3 text-amber-400 transition-colors duration-150 hover:bg-amber-500/10"
          title="Updates available"
          @click="showUpdatesModal = true"
        >
          <Icon name="lucide:download" class="h-[16px] w-[16px] shrink-0" />
          <span v-if="sidebarExpanded" class="truncate text-xs font-medium"
            >Updates</span
          >
          <!-- Update count badge -->
          <span
            class="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black"
          >
            {{ totalUpdatesCount }}
          </span>
        </button>

        <!-- Logout button -->
        <button
          class="flex h-9 w-full items-center gap-3 rounded-md px-3 text-gumm-muted transition-colors duration-150 hover:bg-red-500/10 hover:text-red-400"
          title="Logout"
          @click="logout"
        >
          <Icon name="lucide:log-out" class="h-[16px] w-[16px] shrink-0" />
          <span v-if="sidebarExpanded" class="truncate text-xs font-medium"
            >Logout</span
          >
        </button>
      </div>
    </aside>

    <!-- Main content -->
    <main class="flex-1 overflow-hidden">
      <slot />
    </main>

    <!-- Updates Modal -->
    <Teleport to="body">
      <div
        v-if="showUpdatesModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @click.self="showUpdatesModal = false"
      >
        <div
          class="w-full max-w-md rounded-xl border border-gumm-border bg-gumm-surface p-6 shadow-2xl"
        >
          <!-- Header -->
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-white">Updates Available</h2>
            <button
              class="text-gumm-muted hover:text-white transition-colors"
              @click="showUpdatesModal = false"
            >
              <Icon name="lucide:x" class="h-5 w-5" />
            </button>
          </div>

          <!-- Gumm Update -->
          <div v-if="updatesData?.hasGummUpdate" class="mb-4">
            <div
              class="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20"
            >
              <div
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20"
              >
                <Icon name="lucide:sparkles" class="h-5 w-5 text-amber-400" />
              </div>
              <div class="flex-1">
                <p class="font-medium text-white">Gumm Core</p>
                <p class="text-xs text-gumm-muted">
                  {{ updatesData?.currentVersion }} →
                  <span class="text-amber-400">{{
                    updatesData?.latestVersion
                  }}</span>
                </p>
              </div>
            </div>
          </div>

          <!-- Module Updates -->
          <div v-if="updatesData?.moduleUpdates?.length" class="space-y-2 mb-4">
            <p
              class="text-xs font-medium text-gumm-muted uppercase tracking-wide"
            >
              Module Updates
            </p>
            <div
              v-for="mod in updatesData.moduleUpdates"
              :key="mod.id"
              class="flex items-center gap-3 p-3 rounded-lg bg-gumm-bg/50 border border-gumm-border"
            >
              <div
                class="flex h-8 w-8 items-center justify-center rounded-md bg-gumm-border/50"
              >
                <Icon name="lucide:puzzle" class="h-4 w-4 text-gumm-muted" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-medium text-white truncate">{{ mod.name }}</p>
                <p class="text-xs text-gumm-muted">
                  {{ mod.currentVersion }} →
                  <span class="text-green-400">{{ mod.latestVersion }}</span>
                </p>
              </div>
            </div>
          </div>

          <!-- Instructions -->
          <div class="p-3 rounded-lg bg-gumm-bg/50 border border-gumm-border">
            <p class="text-xs text-gumm-muted mb-2">
              To update, run on your server:
            </p>
            <code
              class="block p-2 rounded bg-black/30 text-xs text-green-400 font-mono"
            >
              sudo gumm update
            </code>
          </div>

          <!-- Close button -->
          <button
            class="mt-4 w-full py-2 rounded-lg bg-gumm-border/50 text-sm font-medium text-white hover:bg-gumm-border transition-colors"
            @click="showUpdatesModal = false"
          >
            Close
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
