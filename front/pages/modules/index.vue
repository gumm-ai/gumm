<script setup lang="ts">
import type { ModuleInfo, OfficialModule } from '~/types/modules';

definePageMeta({ layout: 'default' });

type TabId = 'official' | 'custom';
const activeTab = ref<TabId>('official');
const searchQuery = ref('');
const selectedCapability = ref('');
const statusFilter = ref<'all' | 'installed' | 'not-installed'>('all');

const { data: officialModulesData } = await useFetch<OfficialModule[]>('/api/modules/official');
const officialModules = computed(() => officialModulesData.value ?? []);

const setupModule = ref<OfficialModule | null>(null);

function openSetupModal(official: OfficialModule) {
  setupModule.value = official;
}

function handleSetupFinish(moduleId: string) {
  flashModule(moduleId);
  refresh();
}

const flashIds = ref<Set<string>>(new Set());

function flashModule(id: string) {
  flashIds.value.add(id);
  setTimeout(() => {
    flashIds.value.delete(id);
  }, 1500);
}

const { data: modules, refresh } = await useFetch<ModuleInfo[]>('/api/modules');

const installedIds = computed(() => new Set((modules.value ?? []).map((m) => m.id)));

function getInstalledModule(id: string): ModuleInfo | undefined {
  return (modules.value ?? []).find((m) => m.id === id);
}

const customModules = computed(() => {
  const officials = new Set(officialModules.value.map((o) => o.id));
  return (modules.value ?? []).filter((m) => !officials.has(m.id));
});

const allCapabilities = computed(() => {
  const caps = new Set<string>();
  officialModules.value.forEach((m) => m.capabilities?.forEach((c) => caps.add(c)));
  customModules.value.forEach((m) => m.capabilities?.forEach((c) => caps.add(c)));
  return Array.from(caps).sort();
});

const filteredOfficialModules = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  let result = officialModules.value;

  if (q) {
    result = result.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.capabilities?.some((c) => c.toLowerCase().includes(q))
    );
  }

  if (selectedCapability.value) {
    result = result.filter((m) => m.capabilities?.includes(selectedCapability.value));
  }

  if (statusFilter.value === 'installed') {
    result = result.filter((m) => installedIds.value.has(m.id));
  } else if (statusFilter.value === 'not-installed') {
    result = result.filter((m) => !installedIds.value.has(m.id));
  }

  return result.sort((a, b) => {
    const aInst = installedIds.value.has(a.id);
    const bInst = installedIds.value.has(b.id);
    if (aInst && !bInst) return -1;
    if (!aInst && bInst) return 1;
    return a.name.localeCompare(b.name);
  });
});

const filteredCustomModules = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  let result = customModules.value;

  if (q) {
    result = result.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.capabilities?.some((c) => c.toLowerCase().includes(q))
    );
  }

  if (selectedCapability.value) {
    result = result.filter((m) => m.capabilities?.includes(selectedCapability.value));
  }

  return result;
});

const enabledOfficialModules = computed(() =>
  filteredOfficialModules.value.filter((m) => {
    const inst = getInstalledModule(m.id);
    return inst && inst.status !== 'disabled';
  })
);

const disabledOfficialModules = computed(() =>
  filteredOfficialModules.value.filter((m) => {
    const inst = getInstalledModule(m.id);
    return inst && inst.status === 'disabled';
  })
);

const availableOfficialModules = computed(() =>
  filteredOfficialModules.value.filter((m) => !installedIds.value.has(m.id))
);

const enabledCustomModules = computed(() =>
  filteredCustomModules.value.filter((m) => m.status !== 'disabled')
);
const disabledCustomModules = computed(() =>
  filteredCustomModules.value.filter((m) => m.status === 'disabled')
);

async function reloadModules() {
  await $fetch('/api/modules/reload', { method: 'POST' });
  await refresh();
}

async function toggleModule(module: ModuleInfo) {
  await $fetch(`/api/modules/${module.id}/toggle`, { method: 'PUT' });
  await refresh();
}

const updating = ref<Set<string>>(new Set());
const installing = ref<Set<string>>(new Set());

async function updateModule(module: ModuleInfo) {
  if (module.source !== 'github') return;
  updating.value.add(module.id);
  try {
    await $fetch(`/api/modules/${module.id}/update`, { method: 'POST' });
    flashModule(module.id);
    await refresh();
  } finally {
    updating.value.delete(module.id);
  }
}

async function uninstallModule(module: ModuleInfo) {
  if (!confirm(`Uninstall "${module.name}"?`)) return;
  await $fetch(`/api/modules/${module.id}`, { method: 'DELETE' });
  await refresh();
}

async function installOfficial(official: OfficialModule) {
  if (official.setup?.type === 'navigate') {
    navigateTo(official.setup.route);
    return;
  }
  if (official.setup) {
    openSetupModal(official);
    return;
  }
  installing.value.add(official.id);
  try {
    await $fetch('/api/modules/reload', { method: 'POST' });
    flashModule(official.id);
    await refresh();
  } catch (err: any) {
    alert(err.data?.message || err.message || 'Installation failed');
  } finally {
    installing.value.delete(official.id);
  }
}
</script>

<template>
  <div class="flex h-full flex-col bg-gumm-bg">
    <ModulesHeader :total-installed="modules?.length || 0" @reload="reloadModules" />

    <div class="flex flex-1 overflow-hidden">
      <ModulesSidebar
        v-model:searchQuery="searchQuery"
        v-model:statusFilter="statusFilter"
        v-model:selectedCapability="selectedCapability"
        :active-tab="activeTab"
        :all-capabilities="allCapabilities"
      />

      <main class="flex-1 flex flex-col min-w-0">
        <ModulesTabs
          v-model:active-tab="activeTab"
          :official-count="officialModules.length"
          :custom-count="customModules.length"
        />

        <div class="flex-1 overflow-y-auto p-6">
          <template v-if="activeTab === 'official'">
            <ModulesEmptyState
              v-if="!filteredOfficialModules.length"
              icon="lucide:search-x"
              title="No modules found"
              description="Try adjusting your search or filters."
            >
              <template #action>
                <button
                  v-if="searchQuery || selectedCapability || statusFilter !== 'all'"
                  class="mt-4 text-xs text-gumm-accent hover:underline"
                  @click="searchQuery = ''; selectedCapability = ''; statusFilter = 'all'"
                >
                  Clear all filters
                </button>
              </template>
            </ModulesEmptyState>

            <div v-else class="space-y-8">
              <div v-if="enabledOfficialModules.length">
                <h2 class="text-[10px] text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  Enabled ({{ enabledOfficialModules.length }})
                </h2>
                <div class="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  <ModulesOfficialCard
                    v-for="official in enabledOfficialModules"
                    :key="official.id"
                    :official="official"
                    :is-installed="true"
                    :installed-module="getInstalledModule(official.id)"
                    :is-flashing="flashIds.has(official.id)"
                    :is-installing="installing.has(official.id)"
                    @install="installOfficial(official)"
                    @toggle="toggleModule($event)"
                  />
                </div>
              </div>

              <div v-if="disabledOfficialModules.length">
                <h2 class="text-[10px] text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                  Disabled ({{ disabledOfficialModules.length }})
                </h2>
                <div class="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  <ModulesOfficialCard
                    v-for="official in disabledOfficialModules"
                    :key="official.id"
                    :official="official"
                    :is-installed="true"
                    :installed-module="getInstalledModule(official.id)"
                    :is-flashing="flashIds.has(official.id)"
                    :is-installing="installing.has(official.id)"
                    @install="installOfficial(official)"
                    @toggle="toggleModule($event)"
                  />
                </div>
              </div>

              <div v-if="availableOfficialModules.length">
                <h2 class="text-[10px] text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span class="h-1.5 w-1.5 rounded-full bg-white/20"></span>
                  Available ({{ availableOfficialModules.length }})
                </h2>
                <div class="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  <ModulesOfficialCard
                    v-for="official in availableOfficialModules"
                    :key="official.id"
                    :official="official"
                    :is-installed="false"
                    :installed-module="undefined"
                    :is-flashing="flashIds.has(official.id)"
                    :is-installing="installing.has(official.id)"
                    @install="installOfficial(official)"
                    @toggle="toggleModule($event)"
                  />
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="activeTab === 'custom'">
            <ModulesEmptyState
              v-if="!customModules.length"
              icon="lucide:package-open"
              icon-style="dashed"
              title="No custom modules"
              description=""
            >
              <template #description>
                Install third-party modules from GitHub, or drop a module folder into
                <code class="rounded bg-white/[0.06] px-1 py-0.5 text-[10px] text-white/50">/modules/user/</code>
              </template>
              <template #action>
                <NuxtLink
                  to="/modules/install"
                  class="mt-5 flex items-center gap-1.5 rounded-lg bg-white text-black px-4 py-2 text-xs font-medium transition-all hover:bg-white/90"
                >
                  <Icon name="lucide:plus" class="h-3.5 w-3.5" />
                  Install from GitHub
                </NuxtLink>
              </template>
            </ModulesEmptyState>

            <ModulesEmptyState
              v-else-if="!filteredCustomModules.length"
              title="No modules found"
              description="Try adjusting your search or filters."
            >
              <template #action>
                <button
                  v-if="searchQuery || selectedCapability"
                  class="mt-4 text-xs text-gumm-accent hover:underline"
                  @click="searchQuery = ''; selectedCapability = ''"
                >
                  Clear all filters
                </button>
              </template>
            </ModulesEmptyState>

            <div v-else class="space-y-8">
              <div v-if="enabledCustomModules.length">
                <h2 class="text-[10px] text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  Enabled ({{ enabledCustomModules.length }})
                </h2>
                <div class="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  <ModulesCustomCard
                    v-for="module in enabledCustomModules"
                    :key="module.id"
                    :module="module"
                    :is-flashing="flashIds.has(module.id)"
                    :is-updating="updating.has(module.id)"
                    :is-disabled="false"
                    @toggle="toggleModule(module)"
                    @update="updateModule(module)"
                    @uninstall="uninstallModule(module)"
                  />
                </div>
              </div>

              <div v-if="disabledCustomModules.length">
                <h2 class="text-[10px] text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                  Disabled ({{ disabledCustomModules.length }})
                </h2>
                <div class="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  <ModulesCustomCard
                    v-for="module in disabledCustomModules"
                    :key="module.id"
                    :module="module"
                    :is-flashing="flashIds.has(module.id)"
                    :is-updating="updating.has(module.id)"
                    :is-disabled="true"
                    @toggle="toggleModule(module)"
                    @update="updateModule(module)"
                    @uninstall="uninstallModule(module)"
                  />
                </div>
              </div>
            </div>
          </template>
        </div>
      </main>
    </div>
  </div>

  <ModulesSetupModal :module="setupModule" @close="setupModule = null" @finish="handleSetupFinish" />
</template>
