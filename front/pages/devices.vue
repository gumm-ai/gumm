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

const { data, refresh } = useFetch<{ devices: Device[] }>('/api/devices', {
  server: false,
});

const devices = computed(() => data.value?.devices ?? []);
const onlineCount = computed(
  () => devices.value.filter((d) => d.status === 'online').length,
);
const offlineCount = computed(
  () => devices.value.filter((d) => d.status !== 'online').length,
);

type Filter = 'all' | 'online' | 'offline';
const activeFilter = ref<Filter>('all');

const filteredDevices = computed(() => {
  if (activeFilter.value === 'online')
    return devices.value.filter((d) => d.status === 'online');
  if (activeFilter.value === 'offline')
    return devices.value.filter((d) => d.status !== 'online');
  return devices.value;
});

// Auto-refresh every 30s
let interval: ReturnType<typeof setInterval>;
onMounted(() => {
  interval = setInterval(refresh, 30_000);
});
onUnmounted(() => clearInterval(interval));

async function removeDevice(id: string) {
  await $fetch(`/api/devices/${id}`, { method: 'DELETE' });
  await refresh();
}

function statusColor(status: string) {
  return status === 'online' ? 'bg-emerald-400' : 'bg-neutral-500';
}

function statusBorder(status: string) {
  return status === 'online' ? 'border-emerald-500/20' : 'border-gumm-border';
}

function typeBadge(type: string) {
  if (type === 'storage')
    return { label: 'Storage', color: 'bg-amber-500/10 text-amber-400' };
  return { label: 'CLI', color: 'bg-indigo-500/10 text-indigo-400' };
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
  <div class="flex h-full flex-col">
    <!-- Header -->
    <header
      class="flex items-center justify-between border-b border-gumm-border px-4 py-2.5"
    >
      <div class="flex items-center gap-2.5">
        <Icon
          name="lucide:monitor-smartphone"
          class="h-5 w-5 text-indigo-400"
        />
        <h1 class="text-base font-semibold">Devices</h1>
        <span
          class="rounded-md bg-gumm-surface px-1.5 py-0.5 text-xs text-gumm-muted"
        >
          {{ onlineCount }}/{{ devices.length }} online
        </span>
      </div>

      <!-- Filter tabs -->
      <div class="flex items-center gap-1">
        <button
          v-for="tab in [
            { key: 'all' as Filter, label: 'All', count: devices.length },
            { key: 'online' as Filter, label: 'Online', count: onlineCount },
            { key: 'offline' as Filter, label: 'Offline', count: offlineCount },
          ]"
          :key="tab.key"
          class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors duration-150"
          :class="
            activeFilter === tab.key
              ? 'bg-gumm-surface text-white font-medium'
              : 'text-gumm-muted hover:bg-gumm-border/30 hover:text-white'
          "
          @click="activeFilter = tab.key"
        >
          <span
            v-if="tab.key !== 'all'"
            class="h-1.5 w-1.5 rounded-full"
            :class="tab.key === 'online' ? 'bg-emerald-400' : 'bg-neutral-500'"
          />
          {{ tab.label }}
          <span
            class="rounded px-1 py-px text-[10px]"
            :class="
              activeFilter === tab.key
                ? 'bg-gumm-border/50 text-gumm-text'
                : 'bg-gumm-border/30 text-gumm-muted'
            "
          >
            {{ tab.count }}
          </span>
        </button>
      </div>
    </header>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4">
      <!-- Empty state -->
      <div
        v-if="!devices.length"
        class="flex h-full items-center justify-center animate-fade-in"
      >
        <div class="text-center space-y-3">
          <div
            class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
          >
            <Icon name="lucide:monitor-smartphone" class="h-6 w-6" />
          </div>
          <p class="text-sm font-medium text-gumm-text">No devices connected</p>
          <p class="text-xs text-gumm-muted">
            Run
            <span class="font-mono bg-gumm-surface rounded px-1 py-0.5"
              >gumm up</span
            >
            on any machine to register it here.
          </p>
        </div>
      </div>

      <!-- Devices grid -->
      <div
        v-else-if="filteredDevices.length"
        class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
      >
        <div
          v-for="device in filteredDevices"
          :key="device.id"
          class="rounded-xl border bg-gumm-surface p-3.5 transition-all duration-200 hover:border-gumm-border-hover"
          :class="statusBorder(device.status)"
        >
          <!-- Card header -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span
                class="h-2 w-2 rounded-full"
                :class="[
                  statusColor(device.status),
                  device.status === 'online' ? 'animate-pulse-dot' : '',
                ]"
              />
              <h3 class="font-semibold text-sm">{{ device.name }}</h3>
            </div>
            <span
              class="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
              :class="typeBadge(device.type).color"
            >
              {{ typeBadge(device.type).label }}
            </span>
          </div>

          <!-- System info -->
          <div class="mt-1.5 flex items-center gap-2 text-xs text-gumm-muted">
            <span class="font-mono">{{ device.os }}/{{ device.arch }}</span>
            <span v-if="device.version" class="text-gumm-border">·</span>
            <span v-if="device.version">v{{ device.version }}</span>
          </div>

          <!-- IP -->
          <div
            v-if="device.ip"
            class="mt-1.5 flex items-center gap-1 text-xs text-gumm-muted"
          >
            <Icon name="lucide:globe" class="h-3 w-3" />
            <span class="font-mono">{{ device.ip }}</span>
          </div>

          <!-- Capabilities -->
          <div
            v-if="device.capabilities?.length"
            class="mt-2 flex flex-wrap gap-1"
          >
            <span
              v-for="cap in device.capabilities"
              :key="cap"
              class="rounded-md bg-gumm-bg px-1.5 py-0.5 text-[10px] text-gumm-muted font-mono"
            >
              {{ cap }}
            </span>
          </div>

          <!-- Meta -->
          <div class="mt-2 flex items-center gap-3 text-xs text-gumm-muted">
            <span class="flex items-center gap-1">
              <Icon name="lucide:activity" class="h-3 w-3" />
              {{ formatAgo(device.lastSeenAt) }}
            </span>
          </div>

          <!-- Actions -->
          <div
            class="mt-3 flex items-center gap-1.5 border-t border-gumm-border pt-2.5"
          >
            <button
              class="flex items-center gap-1 rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/20"
              @click="removeDevice(device.id)"
            >
              <Icon name="lucide:trash-2" class="h-3 w-3" />
              Remove
            </button>
          </div>
        </div>
      </div>

      <!-- Empty filtered state -->
      <div
        v-else
        class="flex h-full items-center justify-center animate-fade-in"
      >
        <div class="text-center space-y-2">
          <Icon
            :name="
              activeFilter === 'online' ? 'lucide:wifi-off' : 'lucide:wifi'
            "
            class="mx-auto h-6 w-6 text-gumm-muted"
          />
          <p class="text-sm text-gumm-muted">No {{ activeFilter }} devices</p>
        </div>
      </div>
    </div>
  </div>
</template>
