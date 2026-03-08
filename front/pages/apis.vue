<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ApiConnection } from '~/types/api';
import { providerTemplate, isModuleConnection } from '~/utils/apiProviders';

definePageMeta({ layout: 'default' });

const { data: connections, refresh } =
  await useFetch<ApiConnection[]>('/api/connections');
const testing = ref<Set<string>>(new Set());
const deleting = ref<Set<string>>(new Set());
const oauthConnecting = ref<Set<string>>(new Set());
let oauthPollInterval: ReturnType<typeof setInterval> | null = null;

const showCreate = ref(false);
const editConn = ref<ApiConnection | null>(null);

// Separate module configs from regular connections
const regularConnections = computed(() =>
  (connections.value || []).filter((c) => !isModuleConnection(c)),
);
const moduleConnections = computed(() =>
  (connections.value || []).filter((c) => isModuleConnection(c)),
);

function openCreate() {
  showCreate.value = true;
}

function openEdit(conn: ApiConnection) {
  editConn.value = conn;
}

async function handleCreated(providerId: string, connId: string) {
  showCreate.value = false;
  await refresh();

  // Auto-start OAuth flow for OAuth providers
  const provider = providerTemplate(providerId);
  if (provider?.defaultAuthType === 'oauth2') {
    const conn = connections.value?.find((c) => c.id === connId);
    if (conn) startOAuthFlow(conn);
  }
}

function startOAuthFlow(conn: ApiConnection) {
  oauthConnecting.value.add(conn.id);

  const popup = window.open(
    `/api/${conn.provider}/auth`,
    `${conn.provider}-oauth`,
    'width=600,height=700,scrollbars=yes',
  );

  if (oauthPollInterval) clearInterval(oauthPollInterval);
  oauthPollInterval = setInterval(async () => {
    try {
      const status = await $fetch<{ configured: boolean }>(
        `/api/${conn.provider}/status`,
      );
      if (status.configured) {
        clearInterval(oauthPollInterval!);
        oauthPollInterval = null;
        popup?.close();
        oauthConnecting.value.delete(conn.id);
        await refresh();
      }
    } catch {}
  }, 2000);
}

async function disconnectOAuth(conn: ApiConnection) {
  if (!confirm(`Disconnect ${conn.name}? This will remove stored tokens.`))
    return;
  try {
    await $fetch(`/api/${conn.provider}/disconnect`, { method: 'POST' });
    await refresh();
  } catch {
    await refresh();
  }
}

async function testConnection(conn: ApiConnection) {
  testing.value.add(conn.id);
  try {
    await $fetch(`/api/connections/${conn.id}/test`, { method: 'POST' });
    await refresh();
  } catch {
    await refresh();
  } finally {
    testing.value.delete(conn.id);
  }
}

async function deleteConnection(conn: ApiConnection) {
  if (!confirm(`Delete "${conn.name}" connection?`)) return;
  deleting.value.add(conn.id);
  try {
    await $fetch(`/api/connections/${conn.id}`, { method: 'DELETE' });
    await refresh();
  } finally {
    deleting.value.delete(conn.id);
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <header
      class="flex items-center justify-between border-b border-gumm-border px-4 py-2.5"
    >
      <div class="flex items-center gap-2.5">
        <Icon name="lucide:plug-2" class="h-5 w-5 text-indigo-400" />
        <h1 class="text-base font-semibold">APIs</h1>
        <span
          class="rounded-md bg-gumm-surface px-1.5 py-0.5 text-xs text-gumm-muted"
        >
          {{ connections?.length || 0 }} connections
        </span>
      </div>
      <button
        class="flex items-center gap-1.5 rounded-lg bg-gumm-accent px-3 py-1.5 text-xs font-medium text-gumm-bg transition-colors hover:bg-gumm-accent-hover"
        @click="openCreate"
      >
        <Icon name="lucide:plus" class="h-3.5 w-3.5" />
        New Connection
      </button>
    </header>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4">
      <!-- Empty state -->
      <div
        v-if="!connections?.length"
        class="flex h-full items-center justify-center animate-fade-in"
      >
        <div class="text-center space-y-3">
          <div
            class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
          >
            <Icon name="lucide:plug-2" class="h-6 w-6" />
          </div>
          <p class="text-sm font-medium text-gumm-text">
            No API connections yet
          </p>
          <p class="text-xs text-gumm-muted">
            Define your APIs here once, then use them across all your modules.
          </p>
          <button
            class="mx-auto flex items-center gap-1.5 rounded-lg bg-gumm-accent px-3 py-1.5 text-xs font-medium text-gumm-bg transition-colors hover:bg-gumm-accent-hover"
            @click="openCreate"
          >
            <Icon name="lucide:plus" class="h-3.5 w-3.5" />
            Add your first API
          </button>
        </div>
      </div>

      <!-- Connections grid -->
      <div v-else class="space-y-6">
        <!-- Regular API Connections -->
        <div v-if="regularConnections.length">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <ApiConnectionCard
              v-for="conn in regularConnections"
              :key="conn.id"
              :conn="conn"
              :isOAuthConnecting="oauthConnecting.has(conn.id)"
              :isTesting="testing.has(conn.id)"
              @test="testConnection"
              @edit="openEdit"
              @delete="deleteConnection"
              @connect="startOAuthFlow"
              @disconnect="disconnectOAuth"
            />
          </div>
        </div>

        <!-- Module Config Requirements -->
        <div v-if="moduleConnections.length">
          <div class="flex items-center gap-2 mb-3">
            <Icon name="lucide:puzzle" class="h-4 w-4 text-purple-400" />
            <h2 class="text-sm font-semibold text-gumm-text">
              Module Configurations
            </h2>
            <span
              class="rounded-md bg-purple-500/10 px-1.5 py-0.5 text-xs text-purple-400 border border-purple-500/20"
            >
              {{ moduleConnections.length }} required
            </span>
          </div>
          <p class="text-xs text-gumm-muted mb-3">
            These configurations are required by installed modules. Fill in the
            credentials to enable module functionality.
          </p>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <ApiConnectionCard
              v-for="conn in moduleConnections"
              :key="conn.id"
              :conn="conn"
              :isOAuthConnecting="oauthConnecting.has(conn.id)"
              :isTesting="testing.has(conn.id)"
              @test="testConnection"
              @edit="openEdit"
              @delete="deleteConnection"
              @connect="startOAuthFlow"
              @disconnect="disconnectOAuth"
            />
          </div>
        </div>
      </div>

      <!-- How it works hint -->
      <div
        v-if="connections?.length"
        class="mt-6 rounded-xl border border-gumm-border bg-gumm-surface p-4"
      >
        <div class="flex items-start gap-3">
          <Icon
            name="lucide:info"
            class="mt-0.5 h-4 w-4 shrink-0 text-gumm-accent"
          />
          <div class="space-y-1">
            <p class="text-xs font-medium text-gumm-text">
              How modules use APIs
            </p>
            <p class="text-xs text-gumm-muted">
              Modules can access any connection defined here via
              <code class="rounded bg-gumm-bg px-1 py-0.5 text-[10px]"
                >ctx.brain.getConfig('api.{id}.apiKey')</code
              >. Define your APIs once, reuse them everywhere — no need to
              configure credentials per module.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <ApiCreateModal
    :show="showCreate"
    @close="showCreate = false"
    @created="handleCreated"
  />

  <ApiEditModal :conn="editConn" @close="editConn = null" @updated="refresh" />
</template>
