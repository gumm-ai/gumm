<script setup lang="ts">
// ── Network / VPN ───────────────────────────────────────────────
const networkLoading = ref(false);
const networkError = ref('');
const networkSuccess = ref('');

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
  tailscale: {
    connected: boolean;
    ip: string;
    hostname: string;
    hasAuthKey: boolean;
  };
  netbird: {
    connected: boolean;
    ip: string;
    hostname: string;
    hasSetupKey: boolean;
  };
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
    case 'tailscale':
      return 'Tailscale';
    case 'netbird':
      return 'NetBird';
    case 'wireguard':
      return 'WireGuard';
    default:
      return 'Disabled';
  }
});

const networkModeIcon = computed(() => {
  switch (networkStatus.value?.mode) {
    case 'tailscale':
      return 'lucide:globe';
    case 'netbird':
      return 'lucide:shield-check';
    default:
      return 'lucide:shield-off';
  }
});

const networkModeLocation = computed(() => {
  switch (networkStatus.value?.mode) {
    case 'tailscale':
      return 'Toronto, CA';
    case 'netbird':
      return 'Berlin, DE';
    default:
      return '';
  }
});

// Fetch network status on mount
onMounted(() => {
  fetchNetworkStatus();
});
</script>

<template>
  <section
    class="rounded-xl border border-gumm-border bg-gumm-surface p-4 max-w-lg"
  >
    <div class="flex items-center justify-between mb-1">
      <div class="flex items-center gap-2">
        <Icon name="lucide:network" class="h-4 w-4 text-gumm-accent" />
        <h2 class="text-sm font-semibold">VPN Networking</h2>
      </div>
      <button
        type="button"
        class="text-xs text-gumm-muted hover:text-gumm-text transition-colors"
        @click="fetchNetworkStatus"
      >
        <Icon
          name="lucide:refresh-cw"
          class="h-3.5 w-3.5"
          :class="{ 'animate-spin': networkLoading }"
        />
      </button>
    </div>
    <p class="text-xs text-gumm-muted mb-3">
      Secure mesh networking between Brain, CLI and Storage nodes.
    </p>

    <!-- Error -->
    <div
      v-if="networkError"
      class="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 rounded-md px-3 py-2 mb-3"
    >
      <Icon name="lucide:alert-circle" class="h-3.5 w-3.5 shrink-0" />
      {{ networkError }}
    </div>

    <!-- Success -->
    <div
      v-if="networkSuccess"
      class="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 rounded-md px-3 py-2 mb-3"
    >
      <Icon name="lucide:check-circle" class="h-3.5 w-3.5 shrink-0" />
      {{ networkSuccess }}
    </div>

    <!-- Loading state -->
    <div
      v-if="networkLoading && !networkStatus"
      class="flex items-center gap-2 text-xs text-gumm-muted py-4"
    >
      <Icon name="lucide:loader" class="h-3.5 w-3.5 animate-spin" />
      Loading network status...
    </div>

    <template v-if="networkStatus">
      <!-- Configured via env (read-only) -->
      <div
        v-if="networkStatus.configuredViaEnv"
        class="rounded-md border border-gumm-border bg-gumm-bg p-3 mb-3"
      >
        <div class="flex items-center gap-2 mb-2">
          <Icon :name="networkModeIcon" class="h-4 w-4 text-gumm-accent" />
          <span class="text-sm font-medium text-gumm-text">{{
            networkModeLabel
          }}</span>
          <span v-if="networkModeLocation" class="text-xs text-gumm-muted"
            >({{ networkModeLocation }})</span
          >
          <span class="ml-auto flex items-center gap-1 text-xs text-green-400">
            <span class="h-2 w-2 rounded-full bg-green-400" />
            Configured
          </span>
        </div>
        <p class="text-xs text-gumm-muted">
          VPN provider configured during server installation. To change it,
          update the
          <code class="bg-gumm-surface px-1 py-0.5 rounded text-gumm-text"
            >VPN_PROVIDER</code
          >
          environment variable and restart the container.
        </p>
      </div>

      <!-- Not configured via env — show disabled message -->
      <div
        v-else-if="networkStatus.mode === 'none'"
        class="rounded-md border border-gumm-border bg-gumm-bg p-3 mb-3"
      >
        <div class="flex items-center gap-2 mb-2">
          <Icon name="lucide:shield-off" class="h-4 w-4 text-gumm-muted" />
          <span class="text-sm font-medium text-gumm-text">VPN Disabled</span>
        </div>
        <p class="text-xs text-gumm-muted">
          VPN was not configured during server installation. To enable it,
          re-run the setup script or manually set
          <code class="bg-gumm-surface px-1 py-0.5 rounded text-gumm-text"
            >VPN_PROVIDER</code
          >
          in your .env file.
        </p>
      </div>

      <!-- Current mode summary -->
      <div
        v-if="networkStatus.mode !== 'none'"
        class="flex items-center gap-2 text-xs text-gumm-muted bg-gumm-bg rounded-md px-3 py-2 mb-3"
      >
        <Icon name="lucide:shield" class="h-3 w-3 shrink-0" />
        <span
          >{{ networkStatus.onlinePeers }}/{{ networkStatus.vpnPeers }} peers
          online</span
        >
      </div>

      <!-- Peers list -->
      <div v-if="networkStatus.peers.length > 0">
        <h3 class="text-xs font-semibold text-gumm-muted mb-2">
          Connected Peers
        </h3>
        <div class="space-y-1">
          <div
            v-for="peer in networkStatus.peers"
            :key="peer.id"
            class="flex items-center gap-2 rounded-md bg-gumm-bg px-3 py-1.5 text-xs"
          >
            <span
              class="h-1.5 w-1.5 rounded-full shrink-0"
              :class="
                peer.status === 'online' ? 'bg-green-400' : 'bg-gumm-muted'
              "
            />
            <span class="text-gumm-text font-medium">{{ peer.name }}</span>
            <span class="text-gumm-muted">{{ peer.vpnIp }}</span>
            <span class="ml-auto text-gumm-muted">{{ peer.type }}</span>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-else-if="networkStatus.mode !== 'none'"
        class="text-xs text-gumm-muted text-center py-3"
      >
        No VPN peers yet. Run
        <code class="bg-gumm-bg px-1 py-0.5 rounded">gumm network join</code>
        on your devices.
      </div>
    </template>
  </section>
</template>
