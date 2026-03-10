<script setup lang="ts">
const networkLoading = ref(false);
const networkError = ref('');

interface NetworkPeer {
  id: string;
  name: string;
  type: string;
  vpnIp: string;
  vpnType: string;
  status: string;
}

interface NetworkStatus {
  mode: string;
  configuredViaEnv: boolean;
  totalDevices: number;
  vpnPeers: number;
  onlinePeers: number;
  peers: NetworkPeer[];
  tailscale: { connected: boolean; ip: string; hostname: string; hasAuthKey: boolean };
  netbird: { connected: boolean; ip: string; hostname: string; hasSetupKey: boolean };
}

const networkStatus = ref<NetworkStatus | null>(null);

async function fetchNetworkStatus() {
  networkLoading.value = true;
  networkError.value = '';
  try {
    const data = await $fetch<NetworkStatus>('/api/network/status');
    networkStatus.value = data;
  } catch (err: any) {
    networkError.value = err.data?.message || 'Failed to fetch network status';
  } finally {
    networkLoading.value = false;
  }
}

const networkModeLabel = computed(() => {
  switch (networkStatus.value?.mode) {
    case 'tailscale': return 'Tailscale';
    case 'netbird': return 'NetBird';
    case 'wireguard': return 'WireGuard';
    default: return 'Disabled';
  }
});

const networkModeIcon = computed(() => {
  switch (networkStatus.value?.mode) {
    case 'tailscale': return 'lucide:globe';
    case 'netbird': return 'lucide:shield-check';
    default: return 'lucide:shield-off';
  }
});

onMounted(() => {
  fetchNetworkStatus();
});
</script>

<template>
  <section class="rounded-xl bg-white/[0.02] border border-white/[0.04] overflow-hidden">
    <div class="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
      <div class="flex items-center gap-3">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
          <Icon name="lucide:network" class="h-4 w-4 text-white/50" />
        </div>
        <div>
          <h2 class="text-sm font-medium text-white">VPN Networking</h2>
          <p class="text-[11px] text-white/40">Secure mesh network</p>
        </div>
      </div>
      <button type="button" class="text-white/40 hover:text-white/70 transition-colors" @click="fetchNetworkStatus">
        <Icon name="lucide:refresh-cw" class="h-3.5 w-3.5" :class="{ 'animate-spin': networkLoading }" />
      </button>
    </div>

    <div class="p-4">
      <div v-if="networkError" class="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 mb-3">
        <Icon name="lucide:alert-circle" class="h-3.5 w-3.5 shrink-0" />
        {{ networkError }}
      </div>

      <div v-if="networkLoading && !networkStatus" class="flex items-center gap-2 text-xs text-white/40 py-4">
        <Icon name="lucide:loader-2" class="h-3.5 w-3.5 animate-spin" />
        Loading...
      </div>

      <template v-if="networkStatus">
        <div v-if="networkStatus.configuredViaEnv" class="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 mb-3">
          <div class="flex items-center gap-2 mb-2">
            <Icon :name="networkModeIcon" class="h-4 w-4 text-white/60" />
            <span class="text-sm font-medium text-white/90">{{ networkModeLabel }}</span>
            <span class="ml-auto flex items-center gap-1.5 text-xs text-emerald-400">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Configured
            </span>
          </div>
          <p class="text-[10px] text-white/40">
            Configured via env. Update <code class="bg-white/[0.06] px-1 py-0.5 rounded">VPN_PROVIDER</code> to change.
          </p>
        </div>

        <div v-else-if="networkStatus.mode === 'none'" class="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <div class="flex items-center gap-2 mb-2">
            <Icon name="lucide:shield-off" class="h-4 w-4 text-white/30" />
            <span class="text-sm font-medium text-white/60">VPN Disabled</span>
          </div>
          <p class="text-xs text-white/40">
            Set <code class="bg-white/[0.06] px-1 py-0.5 rounded">VPN_PROVIDER</code> in your .env to enable.
          </p>
        </div>

        <div v-if="networkStatus.mode !== 'none'" class="flex items-center gap-2 text-xs text-white/40 bg-white/[0.02] rounded-lg px-3 py-2 mb-3">
          <Icon name="lucide:shield" class="h-3 w-3 shrink-0" />
          <span>{{ networkStatus.onlinePeers }}/{{ networkStatus.vpnPeers }} peers online</span>
        </div>

        <div v-if="networkStatus.peers.length > 0">
          <div class="space-y-1">
            <div
              v-for="peer in networkStatus.peers"
              :key="peer.id"
              class="flex items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-2 text-xs"
            >
              <span class="h-1.5 w-1.5 rounded-full shrink-0" :class="peer.status === 'online' ? 'bg-emerald-400' : 'bg-white/30'" />
              <span class="text-white/80 font-medium">{{ peer.name }}</span>
              <span class="text-white/40 font-mono text-[10px]">{{ peer.vpnIp }}</span>
              <span class="ml-auto text-white/40">{{ peer.type }}</span>
            </div>
          </div>
        </div>

        <div v-else-if="networkStatus.mode !== 'none'" class="text-xs text-white/40 text-center py-3">
          No peers. Run <code class="bg-white/[0.04] px-1 py-0.5 rounded">gumm network join</code> on your devices.
        </div>
      </template>
    </div>
  </section>
</template>
