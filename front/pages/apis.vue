<script setup lang="ts">
definePageMeta({ layout: 'default' });

import type { ApiConnection } from '~/types/api';
import { providerTemplate, isModuleConnection } from '~/utils/apiProviders';

const { data: connections, refresh } = await useFetch<ApiConnection[]>('/api/connections');
const testing = ref<Set<string>>(new Set());
const deleting = ref<Set<string>>(new Set());
const oauthConnecting = ref<Set<string>>(new Set());
let oauthPollInterval: ReturnType<typeof setInterval> | null = null;

const showCreate = ref(false);
const editConn = ref<ApiConnection | null>(null);

const regularConnections = computed(() => (connections.value || []).filter((c) => !isModuleConnection(c)));
const moduleConnections = computed(() => (connections.value || []).filter((c) => isModuleConnection(c)));

function openCreate() {
  showCreate.value = true;
}

function openEdit(conn: ApiConnection) {
  editConn.value = conn;
}

async function handleCreated(providerId: string, connId: string) {
  showCreate.value = false;
  await refresh();
  const provider = providerTemplate(providerId);
  if (provider?.defaultAuthType === 'oauth2') {
    const conn = connections.value?.find((c) => c.id === connId);
    if (conn) startOAuthFlow(conn);
  }
}

function startOAuthFlow(conn: ApiConnection) {
  oauthConnecting.value.add(conn.id);
  const popup = window.open(`/api/${conn.provider}/auth`, `${conn.provider}-oauth`, 'width=600,height=700,scrollbars=yes');
  if (oauthPollInterval) clearInterval(oauthPollInterval);
  oauthPollInterval = setInterval(async () => {
    try {
      const status = await $fetch<{ configured: boolean }>(`/api/${conn.provider}/status`);
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
  if (!confirm(`Disconnect ${conn.name}? This will remove stored tokens.`)) return;
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
  <div class="flex h-full flex-col bg-gumm-bg">
    <header class="shrink-0 border-b border-white/[0.06] bg-gumm-bg/80 backdrop-blur-sm sticky top-0 z-10">
      <div class="flex items-center justify-between px-6 h-14">
        <div class="flex items-center gap-3">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03]">
            <Icon name="lucide:plug" class="h-4 w-4 text-white/70" />
          </div>
          <div>
            <h1 class="text-sm font-medium text-white tracking-tight">APIs</h1>
            <p class="text-[11px] text-white/40">External service connections</p>
          </div>
          <span class="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/50">{{ connections?.length || 0 }}</span>
        </div>
        <button
          class="flex items-center gap-1.5 rounded-lg bg-white text-black px-3 py-1.5 text-xs font-medium transition-all hover:bg-white/90"
          @click="openCreate"
        >
          <Icon name="lucide:plus" class="h-3.5 w-3.5" />
          New Connection
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <div v-if="!connections?.length" class="flex h-full items-center justify-center">
        <div class="text-center">
          <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4">
            <Icon name="lucide:plug" class="h-6 w-6 text-white/50" />
          </div>
          <p class="text-base font-medium text-white/90 mb-1">No API connections yet</p>
          <p class="text-sm text-white/40 mb-4">Define your APIs here once, then use them across all your modules</p>
          <button
            class="inline-flex items-center gap-1.5 rounded-lg bg-white text-black px-3 py-1.5 text-xs font-medium transition-all hover:bg-white/90"
            @click="openCreate"
          >
            <Icon name="lucide:plus" class="h-3.5 w-3.5" />
            Add your first API
          </button>
        </div>
      </div>

      <div v-else class="max-w-4xl mx-auto space-y-8">
        <section v-if="regularConnections.length">
          <h2 class="text-[10px] text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Icon name="lucide:database" class="h-3 w-3" />
            Connections ({{ regularConnections.length }})
          </h2>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
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
        </section>

        <section v-if="moduleConnections.length">
          <h2 class="text-[10px] text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Icon name="lucide:blocks" class="h-3 w-3" />
            Module Configurations ({{ moduleConnections.length }})
          </h2>
          <p class="text-xs text-white/30 mb-3">These are required by installed modules. Fill in the credentials to enable module functionality.</p>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
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
        </section>

        <div class="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
          <div class="flex items-start gap-3">
            <Icon name="lucide:info" class="h-4 w-4 shrink-0 text-white/30 mt-0.5" />
            <div>
              <p class="text-xs font-medium text-white/60 mb-1">How modules use APIs</p>
              <p class="text-xs text-white/30">
                Modules can access any connection via
                <code class="bg-white/[0.06] px-1 py-0.5 rounded text-[10px] text-white/50">ctx.brain.getConfig('api.{id}.apiKey')</code>
                — define once, reuse everywhere.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ApiCreateModal :show="showCreate" @close="showCreate = false" @created="handleCreated" />
    <ApiEditModal :conn="editConn" @close="editConn = null" @updated="refresh" />
  </div>
</template>
