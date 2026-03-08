<script setup lang="ts">
definePageMeta({ layout: 'default' });

const route = useRoute();
const moduleId = route.params.id as string;

// ── Module data (from enriched GET /api/modules) ─────────────────
interface ToolInfo {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

interface ModuleInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  source: 'local' | 'github';
  sourceUrl?: string;
  capabilities: string[];
  status: string;
  runtimeStatus: string;
  runtimeError?: string;
  error?: string;
  installedAt?: number;
  updatedAt?: number;
  author?: { name: string; url?: string } | null;
  repository?: string | null;
  examples?: string[];
  tools?: ToolInfo[];
}

const { data: allModules, refresh: refreshModules } =
  useLazyFetch<ModuleInfo[]>('/api/modules');

const mod = computed(
  () => allModules.value?.find((m) => m.id === moduleId) || null,
);

// ── Module memory ─────────────────────────────────────────────
interface MemoryEntry {
  id: string;
  namespace: string;
  key: string;
  value: unknown;
  type: string;
}

const { data: moduleMemory, refresh: refreshMemory } = useLazyFetch<
  MemoryEntry[]
>('/api/brain/memory', {
  query: { namespace: moduleId },
});

// ── Module events ─────────────────────────────────────────────
interface EventEntry {
  id: string;
  source: string;
  type: string;
  payload: string;
  createdAt: number;
}

const { data: moduleEvents } = useLazyFetch<EventEntry[]>('/api/brain/events', {
  query: { source: moduleId, limit: 20 },
});

// ── Actions ───────────────────────────────────────────────────
async function toggleModule() {
  await $fetch(`/api/modules/${moduleId}/toggle`, { method: 'PUT' });
  await refreshModules();
}

async function updateModule() {
  await $fetch(`/api/modules/${moduleId}/update`, { method: 'POST' });
  await refreshModules();
}

async function uninstallModule() {
  if (!confirm(`Uninstall "${mod.value?.name}"?`)) return;
  await $fetch(`/api/modules/${moduleId}`, { method: 'DELETE' });
  await navigateTo('/isles');
}

async function forceReload() {
  await $fetch('/api/modules/reload', { method: 'POST' });
  await refreshModules();
}

async function deleteMemory(id: string) {
  await $fetch(`/api/brain/memory/${id}`, { method: 'DELETE' });
  await refreshMemory();
}

function formatDate(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

// ── Gmail-specific OAuth panel ─────────────────────────────────
const isGmail = moduleId === 'gmail';

interface GmailStatus {
  configured: boolean;
  oauthComplete: boolean;
  enabled: boolean;
  email?: string;
  hasCredentials?: boolean;
}

const { data: gmailStatus, refresh: refreshGmailStatus } =
  useLazyFetch<GmailStatus | null>('/api/google/status', {
    immediate: isGmail,
    default: () => null,
  });

const gmailOauthLoading = ref(false);
const gmailConnectError = ref('');
const gmailClientId = ref('');
const gmailClientSecret = ref('');
let gmailPollInterval: ReturnType<typeof setInterval> | null = null;

async function saveAndConnect() {
  gmailConnectError.value = '';
  gmailOauthLoading.value = true;

  try {
    await $fetch('/api/connections', {
      method: 'POST',
      body: {
        id: 'google',
        name: 'Google',
        provider: 'google',
        authType: 'oauth2',
        config: {
          clientId: gmailClientId.value.trim(),
          clientSecret: gmailClientSecret.value.trim(),
        },
      },
    }).catch(async () => {
      await $fetch('/api/connections/google', {
        method: 'PUT',
        body: {
          config: {
            clientId: gmailClientId.value.trim(),
            clientSecret: gmailClientSecret.value.trim(),
          },
        },
      });
    });
  } catch (err: any) {
    gmailConnectError.value =
      err?.data?.message || 'Failed to save credentials';
    gmailOauthLoading.value = false;
    return;
  }

  openGmailPopup();
}

function openGmailPopup() {
  const popup = window.open(
    '/api/google/auth',
    'google-oauth',
    'width=600,height=700,scrollbars=yes',
  );
  if (gmailPollInterval) clearInterval(gmailPollInterval);
  gmailPollInterval = setInterval(async () => {
    try {
      const status = await $fetch<GmailStatus>('/api/google/status');
      if (status.configured) {
        clearInterval(gmailPollInterval!);
        gmailPollInterval = null;
        popup?.close();
        gmailOauthLoading.value = false;
        await refreshGmailStatus();
        await refreshModules();
      }
    } catch {}
  }, 2000);
}

async function reconnectGmail() {
  gmailConnectError.value = '';
  gmailOauthLoading.value = true;
  openGmailPopup();
}

async function disconnectGmail() {
  if (!confirm('Disconnect Gmail? This will remove all stored credentials.'))
    return;
  await $fetch('/api/google/disconnect', { method: 'POST' });
  gmailClientId.value = '';
  gmailClientSecret.value = '';
  await refreshGmailStatus();
}

onUnmounted(() => {
  if (gmailPollInterval) clearInterval(gmailPollInterval);
});
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <header
      class="flex items-center justify-between border-b border-gumm-border px-4 py-2.5"
    >
      <div class="flex items-center gap-2.5">
        <NuxtLink
          to="/isles"
          class="text-gumm-muted hover:text-gumm-text transition-colors"
        >
          <Icon name="lucide:arrow-left" class="h-4 w-4" />
        </NuxtLink>
        <h1 class="text-base font-semibold">
          {{ mod?.name || moduleId }}
        </h1>
        <span
          v-if="mod"
          class="h-2 w-2 rounded-full"
          :class="{
            'bg-emerald-500 animate-pulse-dot':
              mod.runtimeStatus === 'loaded' && mod.status !== 'disabled',
            'bg-amber-500': mod.status === 'disabled',
            'bg-red-500': mod.runtimeStatus === 'error',
          }"
        />
      </div>
      <div class="flex items-center gap-1.5">
        <button
          v-if="mod"
          class="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors"
          :class="
            mod.status === 'disabled'
              ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
              : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
          "
          @click="toggleModule"
        >
          <Icon
            :name="
              mod.status === 'disabled' ? 'lucide:power' : 'lucide:power-off'
            "
            class="h-3 w-3"
          />
          {{ mod.status === 'disabled' ? 'Enable' : 'Disable' }}
        </button>
        <button
          v-if="mod?.source === 'github'"
          class="flex items-center gap-1 rounded-lg bg-gumm-accent/10 px-2 py-1 text-xs text-gumm-accent hover:bg-gumm-accent/20 transition-colors"
          @click="updateModule"
        >
          <Icon name="lucide:download" class="h-3 w-3" />
          Update
        </button>
        <button
          class="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gumm-muted hover:bg-white/5 transition-colors"
          @click="forceReload"
        >
          <Icon name="lucide:refresh-cw" class="h-3 w-3" />
          Reload
        </button>
        <button
          class="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
          @click="uninstallModule"
        >
          <Icon name="lucide:trash-2" class="h-3 w-3" />
          Uninstall
        </button>
      </div>
    </header>

    <div v-if="!mod" class="flex flex-1 items-center justify-center">
      <p class="text-gumm-muted">Isle not found</p>
    </div>

    <div v-else class="flex-1 overflow-y-auto p-4 space-y-4">
      <!-- Info -->
      <section class="rounded-xl border border-gumm-border bg-gumm-surface p-4">
        <div class="flex items-center gap-2 mb-3">
          <Icon name="lucide:info" class="h-4 w-4 text-gumm-accent" />
          <h2 class="text-sm font-semibold">Info</h2>
        </div>

        <!-- Description -->
        <p v-if="mod.description" class="text-xs text-gumm-muted mb-3">
          {{ mod.description }}
        </p>

        <div class="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span class="text-gumm-muted">ID</span>
            <p class="font-mono">{{ mod.id }}</p>
          </div>
          <div>
            <span class="text-gumm-muted">Version</span>
            <p>{{ mod.version }}</p>
          </div>
          <div>
            <span class="text-gumm-muted">Source</span>
            <p class="flex items-center gap-1">
              <Icon
                :name="
                  mod.source === 'github' ? 'lucide:github' : 'lucide:home'
                "
                class="h-3 w-3"
              />
              {{ mod.source === 'github' ? 'GitHub' : 'Local' }}
              <a
                v-if="mod.sourceUrl"
                :href="mod.sourceUrl"
                target="_blank"
                class="ml-1 text-gumm-accent hover:underline"
              >
                <Icon name="lucide:external-link" class="h-3 w-3" />
              </a>
            </p>
          </div>
          <div>
            <span class="text-gumm-muted">Status</span>
            <p class="flex items-center gap-1.5">
              <span
                class="inline-block h-1.5 w-1.5 rounded-full"
                :class="{
                  'bg-emerald-500':
                    mod.runtimeStatus === 'loaded' && mod.status !== 'disabled',
                  'bg-amber-500': mod.status === 'disabled',
                  'bg-red-500': mod.runtimeStatus === 'error',
                  'bg-slate-500':
                    mod.runtimeStatus === 'not-loaded' &&
                    mod.status !== 'disabled',
                }"
              />
              {{ mod.status }} / {{ mod.runtimeStatus }}
            </p>
          </div>
          <div v-if="mod.author">
            <span class="text-gumm-muted">Author</span>
            <p class="flex items-center gap-1">
              <Icon name="lucide:user" class="h-3 w-3 text-gumm-muted" />
              <a
                v-if="mod.author.url"
                :href="mod.author.url"
                target="_blank"
                class="text-gumm-accent hover:underline"
              >
                {{ mod.author.name }}
              </a>
              <span v-else>{{ mod.author.name }}</span>
            </p>
          </div>
          <div v-if="mod.repository">
            <span class="text-gumm-muted">Repository</span>
            <p>
              <a
                :href="`https://github.com/${mod.repository}`"
                target="_blank"
                class="flex items-center gap-1 text-gumm-accent hover:underline"
              >
                <Icon name="lucide:github" class="h-3 w-3" />
                {{ mod.repository }}
              </a>
            </p>
          </div>
          <div>
            <span class="text-gumm-muted">Installed</span>
            <p>{{ formatDate(mod.installedAt) }}</p>
          </div>
          <div>
            <span class="text-gumm-muted">Updated</span>
            <p>{{ formatDate(mod.updatedAt) }}</p>
          </div>
        </div>

        <!-- Capabilities -->
        <div v-if="mod.capabilities?.length" class="mt-3">
          <span class="text-xs text-gumm-muted">Capabilities</span>
          <div class="mt-1 flex flex-wrap gap-1">
            <span
              v-for="cap in mod.capabilities"
              :key="cap"
              class="rounded-md bg-gumm-bg px-1.5 py-0.5 text-[10px] text-gumm-muted"
            >
              {{ cap }}
            </span>
          </div>
        </div>

        <!-- Error -->
        <p
          v-if="mod.runtimeError || mod.error"
          class="mt-3 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400"
        >
          {{ mod.runtimeError || mod.error }}
        </p>
      </section>

      <!-- Usage Examples -->
      <section
        v-if="mod.examples?.length"
        class="rounded-xl border border-gumm-border bg-gumm-surface p-4"
      >
        <div class="flex items-center gap-2 mb-3">
          <Icon name="lucide:message-square" class="h-4 w-4 text-emerald-400" />
          <h2 class="text-sm font-semibold">Usage Examples</h2>
        </div>
        <p class="text-xs text-gumm-muted mb-2">Try saying these in chat:</p>
        <div class="space-y-1.5">
          <div
            v-for="(example, i) in mod.examples"
            :key="i"
            class="flex items-center gap-2 rounded-lg bg-gumm-bg px-3 py-2 text-xs"
          >
            <span class="text-gumm-accent">&rsaquo;</span>
            <span class="italic text-gumm-muted">{{ example }}</span>
          </div>
        </div>
      </section>

      <!-- Tools -->
      <section
        v-if="mod.tools?.length"
        class="rounded-xl border border-gumm-border bg-gumm-surface p-4"
      >
        <div class="flex items-center gap-2 mb-3">
          <Icon name="lucide:wrench" class="h-4 w-4 text-amber-400" />
          <h2 class="text-sm font-semibold">
            Tools
            <span class="ml-1 text-xs text-gumm-muted"
              >({{ mod.tools.length }})</span
            >
          </h2>
        </div>
        <div class="space-y-2">
          <div
            v-for="tool in mod.tools"
            :key="tool.name"
            class="rounded-lg border border-gumm-border bg-gumm-bg p-3"
          >
            <div class="flex items-center gap-2 mb-1">
              <code
                class="rounded-md bg-gumm-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-gumm-accent"
                >{{ tool.name }}</code
              >
            </div>
            <p class="text-xs text-gumm-muted">{{ tool.description }}</p>
            <div
              v-if="
                tool.parameters?.properties &&
                Object.keys(tool.parameters.properties).length
              "
              class="mt-2 flex flex-wrap gap-1"
            >
              <span
                v-for="(param, paramName) in tool.parameters.properties"
                :key="String(paramName)"
                class="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-gumm-muted"
                :title="param.description || ''"
              >
                {{ paramName }}
                <span
                  v-if="tool.parameters.required?.includes(String(paramName))"
                  class="text-red-400"
                  >*</span
                >
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Gmail Configuration Panel -->
      <section
        v-if="isGmail"
        class="rounded-xl border bg-gumm-surface p-4"
        :class="
          gmailStatus?.configured
            ? 'border-emerald-500/20'
            : 'border-amber-500/20'
        "
      >
        <div class="mb-3 flex items-center gap-2">
          <span class="text-base">✉️</span>
          <h2 class="text-sm font-semibold">Gmail Connection</h2>
          <span
            class="ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium"
            :class="
              gmailStatus?.configured
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-amber-500/10 text-amber-400'
            "
          >
            {{ gmailStatus?.configured ? 'Connected' : 'Not connected' }}
          </span>
        </div>

        <!-- Connected state -->
        <div v-if="gmailStatus?.configured" class="space-y-3">
          <div class="flex items-center gap-2 text-xs">
            <Icon name="lucide:mail" class="h-3.5 w-3.5 text-gumm-muted" />
            <span class="text-gumm-muted">Account:</span>
            <span class="font-medium">{{ gmailStatus.email }}</span>
          </div>
          <div class="flex gap-2">
            <button
              class="flex items-center gap-1.5 rounded-lg bg-gumm-accent/10 px-2.5 py-1 text-xs text-gumm-accent transition-colors hover:bg-gumm-accent/20"
              :disabled="gmailOauthLoading"
              @click="reconnectGmail"
            >
              <Icon name="lucide:refresh-cw" class="h-3 w-3" />
              Reconnect
            </button>
            <button
              class="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10"
              @click="disconnectGmail"
            >
              <Icon name="lucide:unlink" class="h-3 w-3" />
              Disconnect
            </button>
          </div>
        </div>

        <!-- Not connected — show credential form with instructions -->
        <div v-else class="space-y-4">
          <!-- Instructions -->
          <div
            class="rounded-lg border border-gumm-border bg-gumm-bg p-3 space-y-2"
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
                    typeof window !== 'undefined'
                      ? window.location.origin
                      : 'http://localhost:3000'
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
            <label class="mb-1 block text-xs text-gumm-muted">Client ID</label>
            <input
              v-model="gmailClientId"
              type="text"
              placeholder="xxxxxxxx.apps.googleusercontent.com"
              class="w-full rounded-lg border border-gumm-border bg-gumm-bg px-3 py-1.5 text-xs outline-none transition-colors focus:border-gumm-accent"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs text-gumm-muted"
              >Client Secret</label
            >
            <input
              v-model="gmailClientSecret"
              type="password"
              placeholder="GOCSPX-…"
              class="w-full rounded-lg border border-gumm-border bg-gumm-bg px-3 py-1.5 text-xs outline-none transition-colors focus:border-gumm-accent"
            />
          </div>

          <div
            v-if="gmailOauthLoading"
            class="flex items-center gap-2 text-xs text-gumm-muted"
          >
            <span
              class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-gumm-accent"
            />
            Waiting for authorization…
          </div>

          <p
            v-if="gmailConnectError"
            class="rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400"
          >
            {{ gmailConnectError }}
          </p>

          <button
            class="flex items-center gap-2 rounded-lg border border-slate-700 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="
              gmailOauthLoading ||
              !gmailClientId.trim() ||
              !gmailClientSecret.trim()
            "
            @click="saveAndConnect"
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
            Connect with Google
          </button>
        </div>
      </section>

      <!-- Memory -->
      <section class="rounded-xl border border-gumm-border bg-gumm-surface p-4">
        <div class="flex items-center gap-2 mb-3">
          <Icon name="lucide:database" class="h-4 w-4 text-violet-400" />
          <h2 class="text-sm font-semibold">
            Memory
            <span class="ml-1 text-xs text-gumm-muted"
              >({{ moduleMemory?.length || 0 }})</span
            >
          </h2>
        </div>
        <div v-if="moduleMemory?.length" class="space-y-1.5">
          <div
            v-for="mem in moduleMemory"
            :key="mem.id"
            class="flex items-center gap-2 rounded-lg bg-gumm-bg px-2.5 py-1.5 text-xs transition-colors hover:bg-gumm-surface-2"
          >
            <span class="font-medium">{{ mem.key }}</span>
            <span class="flex-1 truncate text-gumm-muted">{{
              typeof mem.value === 'object'
                ? JSON.stringify(mem.value)
                : mem.value
            }}</span>
            <span
              class="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-gumm-muted"
              >{{ mem.type }}</span
            >
            <button
              class="shrink-0 text-gumm-muted transition-colors hover:text-red-400"
              @click="deleteMemory(mem.id)"
            >
              <Icon name="lucide:x" class="h-3 w-3" />
            </button>
          </div>
        </div>
        <p v-else class="text-xs text-gumm-muted">
          No memory entries for this isle
        </p>
      </section>

      <!-- Events -->
      <section class="rounded-xl border border-gumm-border bg-gumm-surface p-4">
        <div class="flex items-center gap-2 mb-3">
          <Icon name="lucide:activity" class="h-4 w-4 text-cyan-400" />
          <h2 class="text-sm font-semibold">
            Recent Events
            <span class="ml-1 text-xs text-gumm-muted"
              >({{ moduleEvents?.length || 0 }})</span
            >
          </h2>
        </div>
        <div v-if="moduleEvents?.length" class="space-y-1">
          <div
            v-for="ev in moduleEvents"
            :key="ev.id"
            class="flex items-center gap-2 rounded-lg bg-gumm-bg px-2.5 py-1.5 text-xs transition-colors hover:bg-gumm-surface-2"
          >
            <span class="shrink-0 text-gumm-muted font-mono text-[10px]">{{
              new Date(ev.createdAt).toLocaleTimeString()
            }}</span>
            <span class="font-medium">{{ ev.type }}</span>
            <span class="flex-1 truncate text-gumm-muted">{{
              ev.payload
            }}</span>
          </div>
        </div>
        <p v-else class="text-xs text-gumm-muted">No events from this module</p>
      </section>
    </div>
  </div>
</template>
