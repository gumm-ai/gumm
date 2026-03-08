<script setup lang="ts">
definePageMeta({ layout: 'default' });

type TabId = 'installed' | 'available';
const activeTab = ref<TabId>('installed');
const searchQuery = ref('');

interface IsleInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  source: 'local' | 'github';
  sourceUrl?: string;
  capabilities: string[];
  status: string;
  runtimeStatus: 'loaded' | 'error' | 'not-loaded';
  runtimeError?: string;
  error?: string;
  installedAt?: number;
  updatedAt?: number;
  updateAvailable?: boolean;
  remoteVersion?: string | null;
}

interface OfficialIsle {
  id: string;
  name: string;
  description: string;
  repo: string;
  capabilities: string[];
  icon: string;
  color: string;
  setup?: { type: 'gmail-oauth' } | { type: 'navigate'; route: string };
}

const officialIsles: OfficialIsle[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description:
      'Read, send and summarize emails. Lets the Brain monitor your inbox and draft replies.',
    repo: 'gumm-isles/gmail',
    capabilities: ['mail', 'fetch', 'schedule'],
    icon: 'simple-icons:gmail',
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    setup: { type: 'gmail-oauth' },
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description:
      'Send and receive Telegram messages. Turn your bot into a natural-language interface.',
    repo: 'gumm-isles/telegram',
    capabilities: ['messaging', 'notifications'],
    icon: 'simple-icons:telegram',
    color: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  },
  {
    id: 'weather',
    name: 'Weather',
    description:
      'Fetch real-time weather and forecasts for any location via open APIs.',
    repo: 'gumm-isles/weather',
    capabilities: ['fetch'],
    icon: 'lucide:cloud-sun',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
  {
    id: 'github-digest',
    name: 'GitHub Digest',
    description:
      'Monitor repos, PR reviews and issues. Daily digests directly in the Brain.',
    repo: 'gumm-isles/github-digest',
    capabilities: ['fetch', 'schedule'],
    icon: 'simple-icons:github',
    color: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  },
  {
    id: 'calendar',
    name: 'Calendar',
    description:
      'Sync Google Calendar events. The Brain can create, update and remind you of meetings.',
    repo: 'gumm-isles/calendar',
    capabilities: ['fetch', 'schedule'],
    icon: 'lucide:calendar',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  {
    id: 'hello-world',
    name: 'Hello World',
    description:
      'Minimal example isle. Great starting point if you want to build your own.',
    repo: 'gumm-isles/hello-world',
    capabilities: ['example'],
    icon: 'lucide:hand',
    color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  },
  {
    id: 'openrouter-credits',
    name: 'OpenRouter Credits',
    description:
      'Track your LLM spending in real-time. Monitor balance, daily and weekly costs, and per-model breakdown.',
    repo: 'gumm-isles/openrouter-credits',
    capabilities: ['monitoring'],
    icon: 'lucide:activity',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    setup: { type: 'navigate', route: '/isles/openrouter-credits' },
  },
];

// ── Gmail OAuth setup wizard ─────────────────────────────────────
const setupModal = ref<{
  isle: OfficialIsle | null;
  step: 'check' | 'no-api' | 'credentials' | 'waiting' | 'success';
  loading: boolean;
  error: string;
  hasGoogleApi: boolean;
}>({
  isle: null,
  step: 'check',
  loading: false,
  error: '',
  hasGoogleApi: false,
});

const setupClientId = ref('');
const setupClientSecret = ref('');
const setupEmail = ref('');
let oauthPollInterval: ReturnType<typeof setInterval> | null = null;

async function openSetupModal(official: OfficialIsle) {
  setupModal.value = {
    isle: official,
    step: 'check',
    loading: true,
    error: '',
    hasGoogleApi: false,
  };
  setupClientId.value = '';
  setupClientSecret.value = '';
  setupEmail.value = '';

  // Check if a Google API connection already exists
  try {
    const connections =
      await $fetch<{ id: string; provider: string; status: string }[]>(
        '/api/connections',
      );
    const google = connections?.find((c) => c.provider === 'google');
    if (google) {
      setupModal.value.hasGoogleApi = true;
      // Check if already OAuth-connected
      const status = await $fetch<{ configured: boolean; email?: string }>(
        '/api/google/status',
      );
      if (status.configured) {
        setupEmail.value = status.email || '';
        setupModal.value.step = 'success';
        setupModal.value.loading = false;
        return;
      }
      // Has credentials but not yet authorized — go straight to OAuth
      setupModal.value.step = 'waiting';
      setupModal.value.loading = false;
      startOAuthPoll();
      return;
    }
  } catch {}

  // No Google API found
  setupModal.value.step = 'no-api';
  setupModal.value.loading = false;
}

function startOAuthPoll() {
  const popup = window.open(
    '/api/google/auth',
    'google-oauth',
    'width=600,height=700,scrollbars=yes',
  );
  if (oauthPollInterval) clearInterval(oauthPollInterval);
  oauthPollInterval = setInterval(async () => {
    try {
      const status = await $fetch<{ configured: boolean; email?: string }>(
        '/api/google/status',
      );
      if (status.configured) {
        clearInterval(oauthPollInterval!);
        oauthPollInterval = null;
        popup?.close();
        setupEmail.value = status.email || '';
        setupModal.value.step = 'success';
      }
    } catch {}
  }, 2000);
}

function closeSetupModal() {
  if (oauthPollInterval) {
    clearInterval(oauthPollInterval);
    oauthPollInterval = null;
  }
  if (setupModal.value.isle) {
    installing.value.delete(setupModal.value.isle.id);
  }
  setupModal.value = {
    isle: null,
    step: 'check',
    loading: false,
    error: '',
    hasGoogleApi: false,
  };
}

async function saveCredentialsAndConnect() {
  setupModal.value.loading = true;
  setupModal.value.error = '';
  try {
    await $fetch('/api/connections', {
      method: 'POST',
      body: {
        id: 'google',
        name: 'Google',
        provider: 'google',
        authType: 'oauth2',
        config: {
          clientId: setupClientId.value.trim(),
          clientSecret: setupClientSecret.value.trim(),
        },
      },
    }).catch(async () => {
      // Connection may already exist — update it instead
      await $fetch('/api/connections/google', {
        method: 'PUT',
        body: {
          config: {
            clientId: setupClientId.value.trim(),
            clientSecret: setupClientSecret.value.trim(),
          },
        },
      });
    });
  } catch (err: any) {
    setupModal.value.error =
      err.data?.message || err.message || 'Failed to save credentials';
    setupModal.value.loading = false;
    return;
  }

  setupModal.value.loading = false;
  setupModal.value.step = 'waiting';
  startOAuthPoll();
}

async function finishIsleSetup() {
  if (!setupModal.value.isle) return;
  setupModal.value.loading = true;
  setupModal.value.error = '';
  try {
    await $fetch('/api/modules/reload', { method: 'POST' });
    const isleId = setupModal.value.isle.id;
    closeSetupModal();
    flashIsle(isleId);
    await refresh();
    activeTab.value = 'installed';
  } catch (err: any) {
    setupModal.value.error =
      err.data?.message || err.message || 'Failed to enable isle';
    setupModal.value.loading = false;
  }
}

// Track recently-installed isle IDs for flash animation
const flashIds = ref<Set<string>>(new Set());

function flashIsle(id: string) {
  flashIds.value.add(id);
  setTimeout(() => {
    flashIds.value.delete(id);
  }, 1500);
}

const { data: isles, refresh } = await useFetch<IsleInfo[]>('/api/modules');

const installedIds = computed(
  () => new Set((isles.value ?? []).map((m) => m.id)),
);

// Filter isles by search query
const filteredIsles = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return isles.value ?? [];
  return (isles.value ?? []).filter(
    (isle) =>
      isle.name.toLowerCase().includes(q) ||
      isle.description.toLowerCase().includes(q) ||
      isle.id.toLowerCase().includes(q) ||
      isle.capabilities?.some((c) => c.toLowerCase().includes(q)),
  );
});

// Separate enabled and disabled isles
const enabledIsles = computed(() =>
  filteredIsles.value.filter((isle) => isle.status !== 'disabled'),
);
const disabledIsles = computed(() =>
  filteredIsles.value.filter((isle) => isle.status === 'disabled'),
);

// Filter available isles by search query
const filteredOfficialIsles = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return officialIsles;
  return officialIsles.filter(
    (isle) =>
      isle.name.toLowerCase().includes(q) ||
      isle.description.toLowerCase().includes(q) ||
      isle.id.toLowerCase().includes(q) ||
      isle.capabilities?.some((c) => c.toLowerCase().includes(q)),
  );
});

async function reloadIsles() {
  await $fetch('/api/modules/reload', { method: 'POST' });
  await refresh();
}

async function toggleIsle(isle: IsleInfo) {
  await $fetch(`/api/modules/${isle.id}/toggle`, { method: 'PUT' });
  await refresh();
}

const updating = ref<Set<string>>(new Set());
const installing = ref<Set<string>>(new Set());

async function updateIsle(isle: IsleInfo) {
  if (isle.source !== 'github') return;
  updating.value.add(isle.id);
  try {
    await $fetch(`/api/modules/${isle.id}/update`, { method: 'POST' });
    flashIsle(isle.id);
    await refresh();
  } finally {
    updating.value.delete(isle.id);
  }
}

async function uninstallIsle(isle: IsleInfo) {
  if (!confirm(`Uninstall "${isle.name}"?`)) return;
  await $fetch(`/api/modules/${isle.id}`, { method: 'DELETE' });
  await refresh();
}

async function installOfficial(official: OfficialIsle) {
  // Navigate-type isles open their dedicated page directly
  if (official.setup?.type === 'navigate') {
    navigateTo(official.setup.route);
    return;
  }
  // If isle needs OAuth, open the guided setup wizard
  if (official.setup) {
    openSetupModal(official);
    return;
  }
  // No setup needed — just trigger a registry scan
  installing.value.add(official.id);
  try {
    await $fetch('/api/modules/reload', { method: 'POST' });
    flashIsle(official.id);
    await refresh();
    activeTab.value = 'installed';
  } catch (err: any) {
    alert(err.data?.message || err.message || 'Installation failed');
  } finally {
    installing.value.delete(official.id);
  }
}

function borderColor(isle: IsleInfo): string {
  if (isle.status === 'disabled') return 'border-amber-500/20';
  if (isle.runtimeStatus === 'error' || isle.status === 'error')
    return 'border-red-500/20';
  if (isle.runtimeStatus === 'loaded') return 'border-emerald-500/20';
  return 'border-gumm-border';
}

function formatDate(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString();
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <header
      class="flex items-center justify-between border-b border-gumm-border px-4 py-2.5"
    >
      <div class="flex items-center gap-2.5">
        <Icon name="lucide:palmtree" class="h-5 w-5 text-emerald-400" />
        <h1 class="text-base font-semibold">Isles</h1>
        <span
          class="rounded-md bg-gumm-surface px-1.5 py-0.5 text-xs text-gumm-muted"
        >
          {{ isles?.length || 0 }} installed
        </span>
      </div>
      <div class="flex items-center gap-2">
        <NuxtLink
          to="/isles/install"
          class="flex items-center gap-1.5 rounded-lg bg-gumm-accent px-3 py-1.5 text-xs font-medium text-gumm-bg transition-colors hover:bg-gumm-accent-hover"
        >
          <Icon name="lucide:plus" class="h-3.5 w-3.5" />
          From GitHub
        </NuxtLink>
        <button
          class="flex items-center gap-1.5 rounded-lg border border-gumm-border px-3 py-1.5 text-xs text-gumm-muted transition-all duration-150 hover:bg-white/5 hover:text-gumm-text hover:border-gumm-border-hover"
          @click="reloadIsles"
        >
          <Icon name="lucide:refresh-cw" class="h-3.5 w-3.5" />
          Reload
        </button>
      </div>
    </header>

    <!-- Tabs + Search -->
    <div
      class="flex items-center justify-between gap-4 border-b border-gumm-border px-4"
    >
      <div class="flex gap-0">
        <button
          v-for="tab in [
            { id: 'installed', label: 'Installed', count: isles?.length ?? 0 },
            {
              id: 'available',
              label: 'Available',
              count: officialIsles.length,
            },
          ]"
          :key="tab.id"
          class="relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors"
          :class="
            activeTab === tab.id
              ? 'text-gumm-text'
              : 'text-gumm-muted hover:text-gumm-text'
          "
          @click="activeTab = tab.id as TabId"
        >
          {{ tab.label }}
          <span
            class="rounded-full px-1.5 py-0.5 text-[10px] transition-colors"
            :class="
              activeTab === tab.id
                ? 'bg-gumm-accent/20 text-gumm-accent'
                : 'bg-gumm-surface text-gumm-muted'
            "
            >{{ tab.count }}</span
          >
          <span
            v-if="activeTab === tab.id"
            class="absolute bottom-0 left-0 right-0 h-px bg-gumm-accent"
          />
        </button>
      </div>
      <!-- Search -->
      <div class="relative py-2">
        <Icon
          name="lucide:search"
          class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gumm-muted"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search isles..."
          class="w-48 rounded-lg border border-gumm-border bg-gumm-surface py-1.5 pl-8 pr-3 text-xs text-gumm-text placeholder:text-gumm-muted/50 outline-none transition-all focus:ring-1 focus:ring-gumm-accent focus:border-gumm-accent"
        />
      </div>
    </div>

    <!-- Tab: Installed -->
    <div v-if="activeTab === 'installed'" class="flex-1 overflow-y-auto p-4">
      <div
        v-if="!isles?.length"
        class="flex h-full items-center justify-center animate-fade-in"
      >
        <div class="text-center space-y-3">
          <div
            class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          >
            <Icon name="lucide:palmtree" class="h-6 w-6" />
          </div>
          <p class="text-sm font-medium text-gumm-text">
            No isles installed yet
          </p>
          <p class="text-xs text-gumm-muted">
            <button
              class="text-gumm-accent hover:underline"
              @click="activeTab = 'available'"
            >
              Browse official isles
            </button>
            or drop a folder into
            <code class="rounded-md bg-gumm-surface px-1.5 py-0.5"
              >/modules/user/</code
            >
          </p>
        </div>
      </div>

      <div v-else class="space-y-6">
        <!-- No results message -->
        <div
          v-if="!filteredIsles.length && searchQuery"
          class="text-center py-8"
        >
          <p class="text-sm text-gumm-muted">
            No isles found for "{{ searchQuery }}"
          </p>
        </div>

        <!-- Enabled Isles Section -->
        <div v-if="enabledIsles.length">
          <div class="flex items-center gap-2 mb-3">
            <span class="h-2 w-2 rounded-full bg-emerald-500" />
            <h2
              class="text-xs font-medium text-gumm-muted uppercase tracking-wide"
            >
              Enabled
            </h2>
            <span class="text-xs text-gumm-muted"
              >({{ enabledIsles.length }})</span
            >
          </div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div
              v-for="isle in enabledIsles"
              :key="isle.id"
              class="rounded-xl border bg-gumm-surface p-3.5 transition-all duration-200 cursor-pointer"
              :class="[
                borderColor(isle),
                flashIds.has(isle.id)
                  ? 'ring-2 ring-gumm-accent/50 animate-flash'
                  : 'hover:border-gumm-border-hover',
              ]"
              @click="navigateTo(`/isles/${isle.id}`)"
            >
              <!-- Header -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span
                    class="h-2 w-2 rounded-full"
                    :class="{
                      'bg-emerald-500 animate-pulse-dot':
                        isle.runtimeStatus === 'loaded' &&
                        isle.status !== 'disabled',
                      'bg-amber-500': isle.status === 'disabled',
                      'bg-red-500':
                        isle.runtimeStatus === 'error' ||
                        isle.status === 'error',
                      'bg-slate-500':
                        isle.runtimeStatus === 'not-loaded' &&
                        isle.status !== 'disabled',
                    }"
                  />
                  <h3 class="font-semibold text-sm">{{ isle.name }}</h3>
                </div>
                <div class="flex items-center gap-1.5">
                  <span
                    v-if="isle.source === 'github'"
                    class="flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-gumm-muted"
                    title="GitHub"
                  >
                    <Icon name="lucide:github" class="h-3 w-3" />
                  </span>
                  <span
                    v-else
                    class="flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-gumm-muted"
                    title="Local"
                  >
                    <Icon name="lucide:home" class="h-3 w-3" />
                  </span>
                  <span class="text-xs text-gumm-muted"
                    >v{{ isle.version }}</span
                  >
                </div>
              </div>

              <p class="mt-1.5 text-xs text-gumm-muted line-clamp-2">
                {{ isle.description }}
              </p>

              <div class="mt-2 flex items-center gap-3 text-xs text-gumm-muted">
                <span v-if="isle.installedAt" class="flex items-center gap-1">
                  <Icon name="lucide:calendar" class="h-3 w-3" />
                  {{ formatDate(isle.installedAt) }}
                </span>
                <a
                  v-if="isle.sourceUrl"
                  :href="isle.sourceUrl"
                  target="_blank"
                  class="flex items-center gap-1 hover:text-gumm-accent transition-colors"
                  @click.stop
                >
                  <Icon name="lucide:external-link" class="h-3 w-3" />
                  GitHub
                </a>
              </div>

              <div
                v-if="isle.capabilities?.length"
                class="mt-2 flex flex-wrap gap-1"
              >
                <span
                  v-for="cap in isle.capabilities"
                  :key="cap"
                  class="rounded-md bg-gumm-bg px-1.5 py-0.5 text-[10px] text-gumm-muted"
                >
                  {{ cap }}
                </span>
              </div>

              <p
                v-if="isle.runtimeError || isle.error"
                class="mt-2 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400"
              >
                {{ isle.runtimeError || isle.error }}
              </p>

              <div
                class="mt-3 flex items-center gap-1.5 border-t border-gumm-border pt-2.5"
                @click.stop
              >
                <NuxtLink
                  :to="`/isles/${isle.id}`"
                  class="flex items-center gap-1 rounded-lg bg-gumm-accent/10 px-2 py-1 text-xs text-gumm-accent transition-colors hover:bg-gumm-accent/20"
                >
                  <Icon name="lucide:settings" class="h-3 w-3" />
                  Configure
                </NuxtLink>
                <button
                  class="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                  @click="toggleIsle(isle)"
                >
                  <Icon name="lucide:power-off" class="h-3 w-3" />
                  Disable
                </button>
                <button
                  v-if="isle.source === 'github' && isle.updateAvailable"
                  class="flex items-center gap-1 rounded-lg bg-gumm-accent/10 px-2 py-1 text-xs text-gumm-accent transition-colors hover:bg-gumm-accent/20"
                  :disabled="updating.has(isle.id)"
                  @click="updateIsle(isle)"
                >
                  <Icon name="lucide:download" class="h-3 w-3" />
                  {{
                    updating.has(isle.id)
                      ? 'Updating...'
                      : `Update → v${isle.remoteVersion}`
                  }}
                </button>
                <button
                  class="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10"
                  @click="uninstallIsle(isle)"
                >
                  <Icon name="lucide:trash-2" class="h-3 w-3" />
                  Uninstall
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Disabled Isles Section -->
        <div v-if="disabledIsles.length">
          <div class="flex items-center gap-2 mb-3">
            <span class="h-2 w-2 rounded-full bg-amber-500" />
            <h2
              class="text-xs font-medium text-gumm-muted uppercase tracking-wide"
            >
              Disabled
            </h2>
            <span class="text-xs text-gumm-muted"
              >({{ disabledIsles.length }})</span
            >
          </div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div
              v-for="isle in disabledIsles"
              :key="isle.id"
              class="rounded-xl border bg-gumm-surface p-3.5 transition-all duration-200 cursor-pointer opacity-60 hover:opacity-100"
              :class="[
                borderColor(isle),
                flashIds.has(isle.id)
                  ? 'ring-2 ring-gumm-accent/50 animate-flash'
                  : 'hover:border-gumm-border-hover',
              ]"
              @click="navigateTo(`/isles/${isle.id}`)"
            >
              <!-- Header -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="h-2 w-2 rounded-full bg-amber-500" />
                  <h3 class="font-semibold text-sm">{{ isle.name }}</h3>
                </div>
                <div class="flex items-center gap-1.5">
                  <span
                    v-if="isle.source === 'github'"
                    class="flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-gumm-muted"
                    title="GitHub"
                  >
                    <Icon name="lucide:github" class="h-3 w-3" />
                  </span>
                  <span
                    v-else
                    class="flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-gumm-muted"
                    title="Local"
                  >
                    <Icon name="lucide:home" class="h-3 w-3" />
                  </span>
                  <span class="text-xs text-gumm-muted"
                    >v{{ isle.version }}</span
                  >
                </div>
              </div>

              <p class="mt-1.5 text-xs text-gumm-muted line-clamp-2">
                {{ isle.description }}
              </p>

              <div class="mt-2 flex items-center gap-3 text-xs text-gumm-muted">
                <span v-if="isle.installedAt" class="flex items-center gap-1">
                  <Icon name="lucide:calendar" class="h-3 w-3" />
                  {{ formatDate(isle.installedAt) }}
                </span>
                <a
                  v-if="isle.sourceUrl"
                  :href="isle.sourceUrl"
                  target="_blank"
                  class="flex items-center gap-1 hover:text-gumm-accent transition-colors"
                  @click.stop
                >
                  <Icon name="lucide:external-link" class="h-3 w-3" />
                  GitHub
                </a>
              </div>

              <div
                v-if="isle.capabilities?.length"
                class="mt-2 flex flex-wrap gap-1"
              >
                <span
                  v-for="cap in isle.capabilities"
                  :key="cap"
                  class="rounded-md bg-gumm-bg px-1.5 py-0.5 text-[10px] text-gumm-muted"
                >
                  {{ cap }}
                </span>
              </div>

              <div
                class="mt-3 flex items-center gap-1.5 border-t border-gumm-border pt-2.5"
                @click.stop
              >
                <NuxtLink
                  :to="`/isles/${isle.id}`"
                  class="flex items-center gap-1 rounded-lg bg-gumm-accent/10 px-2 py-1 text-xs text-gumm-accent transition-colors hover:bg-gumm-accent/20"
                >
                  <Icon name="lucide:settings" class="h-3 w-3" />
                  Configure
                </NuxtLink>
                <button
                  class="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  @click="toggleIsle(isle)"
                >
                  <Icon name="lucide:power" class="h-3 w-3" />
                  Enable
                </button>
                <button
                  class="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10"
                  @click="uninstallIsle(isle)"
                >
                  <Icon name="lucide:trash-2" class="h-3 w-3" />
                  Uninstall
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab: Available (official catalog) -->
    <div
      v-else-if="activeTab === 'available'"
      class="flex-1 overflow-y-auto p-4"
    >
      <div class="mb-3">
        <p class="text-xs text-gumm-muted">
          Official isles maintained by the Gumm community. One click to install.
        </p>
      </div>
      <!-- No results message -->
      <div
        v-if="!filteredOfficialIsles.length && searchQuery"
        class="text-center py-8"
      >
        <p class="text-sm text-gumm-muted">
          No isles found for "{{ searchQuery }}"
        </p>
      </div>
      <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="official in filteredOfficialIsles"
          :key="official.id"
          class="rounded-xl border bg-gumm-surface p-3.5 transition-all duration-200 cursor-pointer"
          :class="[
            installedIds.has(official.id)
              ? 'border-emerald-500/20'
              : 'border-gumm-border hover:border-gumm-border-hover',
            flashIds.has(official.id)
              ? 'ring-2 ring-gumm-accent/50 animate-flash'
              : '',
          ]"
          @click="
            installedIds.has(official.id)
              ? navigateTo(`/isles/${official.id}`)
              : installOfficial(official)
          "
        >
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-2.5">
              <div
                class="flex h-8 w-8 items-center justify-center rounded-lg border"
                :class="official.color"
              >
                <Icon :name="official.icon" class="h-4 w-4" />
              </div>
              <div>
                <h3 class="font-semibold text-sm">{{ official.name }}</h3>
                <span
                  v-if="official.repo !== 'built-in'"
                  class="text-[10px] text-gumm-muted font-mono"
                  >{{ official.repo }}</span
                >
              </div>
            </div>
            <span
              v-if="official.setup?.type === 'navigate'"
              class="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-gumm-muted"
            >
              Built-in
            </span>
            <span
              v-else-if="installedIds.has(official.id)"
              class="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400"
            >
              <Icon name="lucide:check" class="h-3 w-3" />
              Installed
            </span>
          </div>

          <p class="mt-2.5 text-xs text-gumm-muted line-clamp-2">
            {{ official.description }}
          </p>

          <div class="mt-2 flex flex-wrap gap-1">
            <span
              v-for="cap in official.capabilities"
              :key="cap"
              class="rounded-md bg-gumm-bg px-1.5 py-0.5 text-[10px] text-gumm-muted"
            >
              {{ cap }}
            </span>
          </div>

          <div
            class="mt-3 flex items-center gap-1.5 border-t border-gumm-border pt-2.5"
          >
            <NuxtLink
              v-if="official.setup?.type === 'navigate'"
              :to="official.setup.route"
              class="flex items-center gap-1.5 rounded-lg bg-gumm-accent px-2.5 py-1 text-xs font-medium text-gumm-bg transition-colors hover:bg-gumm-accent-hover"
              @click.stop
            >
              <Icon name="lucide:arrow-right" class="h-3 w-3" />
              Open
            </NuxtLink>
            <button
              v-else-if="!installedIds.has(official.id)"
              class="flex items-center gap-1.5 rounded-lg bg-gumm-accent px-2.5 py-1 text-xs font-medium text-gumm-bg transition-colors hover:bg-gumm-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="installing.has(official.id)"
              @click.stop="installOfficial(official)"
            >
              <Icon
                :name="
                  installing.has(official.id)
                    ? 'lucide:loader'
                    : 'lucide:download'
                "
                class="h-3 w-3"
                :class="installing.has(official.id) ? 'animate-spin' : ''"
              />
              {{ installing.has(official.id) ? 'Installing…' : 'Install' }}
            </button>
            <NuxtLink
              v-else
              :to="`/isles/${official.id}`"
              class="flex items-center gap-1.5 rounded-lg border border-gumm-border px-2.5 py-1 text-xs text-gumm-muted transition-colors hover:bg-white/5 hover:text-gumm-text"
              @click.stop
            >
              <Icon name="lucide:settings" class="h-3 w-3" />
              Manage
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Gmail Setup Wizard Modal -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-all duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="setupModal.isle"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          class="absolute inset-0 bg-black/70 backdrop-blur-sm"
          @click="closeSetupModal"
        />

        <div
          class="relative z-10 w-full max-w-lg rounded-2xl border border-gumm-border bg-gumm-bg p-6 shadow-2xl"
        >
          <!-- Header -->
          <div class="mb-5 flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div
                class="flex h-8 w-8 items-center justify-center rounded-lg border"
                :class="setupModal.isle.color"
              >
                <Icon :name="setupModal.isle.icon" class="h-4 w-4" />
              </div>
              <div>
                <h2 class="text-sm font-semibold">
                  Connect {{ setupModal.isle.name }}
                </h2>
              </div>
            </div>
            <button
              class="text-gumm-muted transition-colors hover:text-gumm-text"
              @click="closeSetupModal"
            >
              <Icon name="lucide:x" class="h-4 w-4" />
            </button>
          </div>

          <!-- Step: Checking for existing API -->
          <div
            v-if="setupModal.step === 'check'"
            class="flex flex-col items-center gap-4 py-6"
          >
            <div class="relative">
              <div
                class="h-12 w-12 rounded-full border-2 border-gumm-accent/30"
              />
              <div
                class="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-gumm-accent"
              />
            </div>
            <p class="text-xs text-gumm-muted">
              Checking for Google API connection…
            </p>
          </div>

          <!-- Step: No Google API found -->
          <div v-else-if="setupModal.step === 'no-api'" class="space-y-4">
            <div
              class="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-2"
            >
              <p
                class="text-xs font-medium text-amber-400 flex items-center gap-1.5"
              >
                <Icon name="lucide:alert-triangle" class="h-3.5 w-3.5" />
                Google API connection required
              </p>
              <p class="text-xs text-gumm-muted">
                Gmail needs a Google API connection to work. You can set one up
                in the
                <b class="text-gumm-text">APIs</b> page first, then come back
                here to install.
              </p>
            </div>

            <div class="flex items-center gap-2 pt-1">
              <NuxtLink
                to="/apis"
                class="flex items-center gap-1.5 rounded-lg bg-gumm-accent px-3 py-1.5 text-xs font-medium text-gumm-bg transition-colors hover:bg-gumm-accent-hover"
                @click="closeSetupModal"
              >
                <Icon name="lucide:plug-2" class="h-3.5 w-3.5" />
                Go to APIs
              </NuxtLink>
              <button
                class="text-xs text-gumm-muted hover:text-gumm-text transition-colors"
                @click="setupModal.step = 'credentials'"
              >
                or enter credentials manually
              </button>
            </div>
          </div>

          <!-- Step: Credentials -->
          <div v-else-if="setupModal.step === 'credentials'" class="space-y-4">
            <!-- Instructions -->
            <div
              class="rounded-lg border border-gumm-border bg-gumm-surface p-3 space-y-2"
            >
              <p class="text-xs font-medium text-gumm-text">
                How to get your Google credentials:
              </p>
              <ol
                class="list-decimal list-inside space-y-1.5 text-xs text-gumm-muted"
              >
                <li>
                  Go to
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    class="text-gumm-accent hover:underline"
                    >Google Cloud Console → Credentials
                    <Icon
                      name="lucide:external-link"
                      class="inline h-2.5 w-2.5"
                    />
                  </a>
                </li>
                <li>Create a project (or select an existing one)</li>
                <li>
                  Click <b class="text-gumm-text">+ Create Credentials</b> →
                  <b class="text-gumm-text">OAuth client ID</b>
                </li>
                <li>
                  Application type:
                  <b class="text-gumm-text">Web application</b>
                </li>
                <li>
                  Add
                  <b class="text-gumm-text"
                    >{{
                      window?.location?.origin || 'http://localhost:3000'
                    }}/api/google/callback</b
                  >
                  as an authorized redirect URI
                </li>
                <li>
                  Enable the
                  <a
                    href="https://console.cloud.google.com/apis/library/gmail.googleapis.com"
                    target="_blank"
                    class="text-gumm-accent hover:underline"
                    >Gmail API
                    <Icon
                      name="lucide:external-link"
                      class="inline h-2.5 w-2.5"
                    />
                  </a>
                  in your project
                </li>
                <li>
                  Copy the <b class="text-gumm-text">Client ID</b> and
                  <b class="text-gumm-text">Client Secret</b> below
                </li>
              </ol>
            </div>

            <!-- Inputs -->
            <div>
              <label class="mb-1 block text-xs text-gumm-muted"
                >Client ID</label
              >
              <input
                v-model="setupClientId"
                type="text"
                placeholder="xxxxxxxx.apps.googleusercontent.com"
                class="w-full rounded-lg border border-gumm-border bg-gumm-surface px-3 py-1.5 text-xs text-gumm-text placeholder:text-gumm-muted/50 outline-none transition-all focus:ring-1 focus:ring-gumm-accent focus:border-gumm-accent"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs text-gumm-muted"
                >Client Secret</label
              >
              <input
                v-model="setupClientSecret"
                type="password"
                placeholder="GOCSPX-…"
                class="w-full rounded-lg border border-gumm-border bg-gumm-surface px-3 py-1.5 text-xs text-gumm-text placeholder:text-gumm-muted/50 outline-none transition-all focus:ring-1 focus:ring-gumm-accent focus:border-gumm-accent"
              />
            </div>

            <p
              v-if="setupModal.error"
              class="rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400"
            >
              {{ setupModal.error }}
            </p>

            <div class="flex items-center justify-between gap-2 pt-1">
              <button
                class="rounded-lg border border-gumm-border px-3 py-1.5 text-xs text-gumm-muted transition-colors hover:bg-white/5"
                @click="closeSetupModal"
              >
                Cancel
              </button>
              <button
                class="flex items-center gap-2 rounded-lg border border-slate-700 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="
                  !setupClientId.trim() ||
                  !setupClientSecret.trim() ||
                  setupModal.loading
                "
                @click="saveCredentialsAndConnect"
              >
                <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {{ setupModal.loading ? 'Saving…' : 'Connect with Google' }}
              </button>
            </div>
          </div>

          <!-- Step: Waiting for authorization -->
          <div
            v-else-if="setupModal.step === 'waiting'"
            class="flex flex-col items-center gap-4 py-6"
          >
            <div class="relative">
              <div
                class="h-12 w-12 rounded-full border-2 border-gumm-accent/30"
              />
              <div
                class="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-gumm-accent"
              />
            </div>
            <div class="text-center">
              <p class="text-sm font-medium">Waiting for authorization…</p>
              <p class="mt-1 text-xs text-gumm-muted">
                Complete the sign-in in the Google popup window.
              </p>
            </div>
            <button
              class="rounded-lg border border-gumm-border px-3 py-1.5 text-xs text-gumm-muted transition-colors hover:bg-white/5"
              @click="closeSetupModal"
            >
              Cancel
            </button>
          </div>

          <!-- Step: Success -->
          <div v-else-if="setupModal.step === 'success'" class="space-y-5">
            <div class="flex flex-col items-center gap-3 py-3">
              <div
                class="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"
              >
                <Icon name="lucide:check-circle-2" class="h-7 w-7" />
              </div>
              <div class="text-center">
                <p class="text-sm font-semibold">Gmail connected!</p>
                <p v-if="setupEmail" class="mt-0.5 text-xs text-gumm-muted">
                  {{ setupEmail }}
                </p>
              </div>
            </div>

            <p
              v-if="setupModal.error"
              class="rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400"
            >
              {{ setupModal.error }}
            </p>

            <button
              class="w-full rounded-lg bg-gumm-accent px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-gumm-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="setupModal.loading"
              @click="finishIsleSetup"
            >
              {{ setupModal.loading ? 'Activating…' : 'Finish & Enable Isle' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
