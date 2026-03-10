<script setup lang="ts">
definePageMeta({ layout: 'default' });

interface Device {
  id: string;
  name: string;
  type: string;
  os: string;
  arch: string;
  version: string;
  status: string;
  ip: string;
  capabilities: string[];
  storageNodeId: string | null;
  lastSeenAt: number | null;
  createdAt: number | null;
}

const { data, refresh } = useFetch<{ devices: Device[] }>('/api/devices', { server: false });
const devices = computed(() => data.value?.devices ?? []);
const onlineCount = computed(() => devices.value.filter((d) => d.status === 'online').length);
const offlineCount = computed(() => devices.value.filter((d) => d.status !== 'online').length);

type Filter = 'all' | 'online' | 'offline';
const activeFilter = ref<Filter>('all');

const filteredDevices = computed(() => {
  if (activeFilter.value === 'online') return devices.value.filter((d) => d.status === 'online');
  if (activeFilter.value === 'offline') return devices.value.filter((d) => d.status !== 'online');
  return devices.value;
});

let interval: ReturnType<typeof setInterval>;
onMounted(() => {
  interval = setInterval(refresh, 30_000);
});
onUnmounted(() => clearInterval(interval));

async function removeDevice(id: string) {
  await $fetch(`/api/devices/${id}`, { method: 'DELETE' });
  await refresh();
}

function formatAgo(ts: number | null) {
  if (!ts) return 'Never';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
</script>

<template>
  <div class="flex h-full flex-col bg-gumm-bg">
    <header class="shrink-0 border-b border-white/[0.06] bg-gumm-bg/80 backdrop-blur-sm sticky top-0 z-10">
      <div class="flex items-center justify-between px-6 h-14">
        <div class="flex items-center gap-3">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03]">
            <Icon name="lucide:monitor-smartphone" class="h-4 w-4 text-white/70" />
          </div>
          <div>
            <h1 class="text-sm font-medium text-white tracking-tight">Devices</h1>
            <p class="text-[11px] text-white/40">Connected agents</p>
          </div>
          <span class="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/50">{{ onlineCount }}/{{ devices.length }} online</span>
        </div>

        <div class="flex items-center gap-1">
          <button
            v-for="tab in [
              { key: 'all' as Filter, label: 'All', count: devices.length },
              { key: 'online' as Filter, label: 'Online', count: onlineCount },
              { key: 'offline' as Filter, label: 'Offline', count: offlineCount },
            ]"
            :key="tab.key"
            class="rounded-lg px-3 py-1.5 text-xs transition-all"
            :class="activeFilter === tab.key ? 'bg-white/[0.08] text-white' : 'text-white/50 hover:text-white/80'"
            @click="activeFilter = tab.key"
          >
            {{ tab.label }}
            <span class="ml-1.5 text-white/40">{{ tab.count }}</span>
          </button>
        </div>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <div v-if="!devices.length" class="flex h-full items-center justify-center">
        <div class="text-center">
          <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4">
            <Icon name="lucide:monitor-smartphone" class="h-6 w-6 text-white/50" />
          </div>
          <p class="text-base font-medium text-white/90 mb-1">No devices connected</p>
          <p class="text-sm text-white/40">Run <code class="bg-white/[0.06] px-1.5 py-0.5 rounded text-white/60">gumm up</code> on any machine to register it</p>
        </div>
      </div>

      <div v-else-if="filteredDevices.length" class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
        <div
          v-for="device in filteredDevices"
          :key="device.id"
          class="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 transition-all hover:bg-white/[0.04]"
          :class="device.status === 'online' ? 'border-emerald-500/10' : ''"
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full" :class="device.status === 'online' ? 'bg-emerald-400' : 'bg-white/30'" />
              <h3 class="text-sm font-medium text-white/90">{{ device.name }}</h3>
            </div>
            <span
              class="rounded px-1.5 py-0.5 text-[10px] font-medium"
              :class="device.type === 'storage' ? 'bg-amber-500/10 text-amber-400' : 'bg-white/[0.06] text-white/50'"
            >
              {{ device.type === 'storage' ? 'Storage' : 'CLI' }}
            </span>
          </div>

          <div class="flex items-center gap-2 text-xs text-white/40 mb-2">
            <span class="font-mono">{{ device.os }}/{{ device.arch }}</span>
            <span v-if="device.version">· v{{ device.version }}</span>
          </div>

          <div v-if="device.ip" class="flex items-center gap-1.5 text-xs text-white/40 mb-2">
            <Icon name="lucide:globe" class="h-3 w-3" />
            <span class="font-mono">{{ device.ip }}</span>
          </div>

          <div v-if="device.capabilities?.length" class="flex flex-wrap gap-1 mb-3">
            <span v-for="cap in device.capabilities" :key="cap" class="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/40 font-mono">
              {{ cap }}
            </span>
          </div>

          <div class="flex items-center justify-between pt-3 border-t border-white/[0.06]">
            <span class="flex items-center gap-1 text-xs text-white/40">
              <Icon name="lucide:activity" class="h-3 w-3" />
              {{ formatAgo(device.lastSeenAt) }}
            </span>
            <button
              class="flex items-center gap-1 rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-400/80 transition-colors hover:bg-red-500/20 hover:text-red-400"
              @click="removeDevice(device.id)"
            >
              <Icon name="lucide:trash-2" class="h-3 w-3" />
              Remove
            </button>
          </div>
        </div>
      </div>

      <div v-else class="flex h-full items-center justify-center">
        <div class="text-center">
          <Icon :name="activeFilter === 'online' ? 'lucide:wifi-off' : 'lucide:wifi'" class="mx-auto h-8 w-8 text-white/30 mb-2" />
          <p class="text-sm text-white/50">No {{ activeFilter }} devices</p>
        </div>
      </div>
    </div>
  </div>
</template>
