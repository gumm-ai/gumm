/**
 * GET /api/network/status
 *
 * Returns current VPN/network configuration and connected peers summary.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { devices } from '../../db/schema';

const execFileAsync = promisify(execFile);
const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000;

/** Check live Tailscale status from the daemon (if available). */
async function getTailscaleLiveStatus(): Promise<{
  running: boolean;
  ip: string;
  hostname: string;
}> {
  try {
    const { stdout } = await execFileAsync('tailscale', ['ip', '-4']);
    const ip = stdout.trim();
    let hostname = '';
    try {
      const res = await execFileAsync('tailscale', ['status', '--json']);
      const status = JSON.parse(res.stdout);
      hostname = status?.Self?.HostName || '';
    } catch {
      // ignore
    }
    return { running: true, ip, hostname };
  } catch {
    return { running: false, ip: '', hostname: '' };
  }
}

/** Check live NetBird status from the daemon (if available). */
async function getNetbirdLiveStatus(): Promise<{
  running: boolean;
  ip: string;
  hostname: string;
}> {
  try {
    const { stdout } = await execFileAsync('netbird', ['status']);
    // Parse status output for connection state and IP
    const isConnected =
      stdout.includes('Connected') || stdout.includes('Status: Connected');
    if (!isConnected) {
      return { running: false, ip: '', hostname: '' };
    }
    // Parse IP (format: "IP: 100.x.y.z/16" or similar)
    const ipMatch = stdout.match(/IP:\s*([\d.]+)/);
    const ip = ipMatch ? ipMatch[1] : '';
    // Parse hostname if available
    const hostnameMatch = stdout.match(/Hostname:\s*(\S+)/i);
    const hostname = hostnameMatch ? hostnameMatch[1] : '';
    return { running: true, ip, hostname };
  } catch {
    return { running: false, ip: '', hostname: '' };
  }
}

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const brain = useBrain();
  await brain.ready();

  // Prefer VPN_PROVIDER from env (set by setup-server.sh)
  const vpnProviderEnv = (process.env.VPN_PROVIDER || '').toLowerCase();
  const configuredViaEnv =
    vpnProviderEnv === 'tailscale' || vpnProviderEnv === 'netbird';

  const networkMode = configuredViaEnv
    ? vpnProviderEnv
    : (await brain.getConfig('network.mode')) || 'none';

  const storedHostname =
    (await brain.getConfig('network.tailscale.hostname')) || '';

  const rows = await useDrizzle().select().from(devices);
  const now = Date.now();

  const peers = rows
    .filter((row) => row.vpnIp)
    .map((row) => {
      const lastSeen = row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : 0;
      const isStale = now - lastSeen > OFFLINE_THRESHOLD_MS;
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        vpnIp: row.vpnIp,
        vpnType: row.vpnType,
        status: isStale ? 'offline' : row.status,
        lastSeenAt: row.lastSeenAt?.getTime?.() ?? row.lastSeenAt,
      };
    });

  // Get live Tailscale info from daemon (Docker only, best-effort)
  const tailscale =
    networkMode === 'tailscale'
      ? await getTailscaleLiveStatus()
      : { running: false, ip: '', hostname: '' };

  // Get live NetBird info from daemon (Docker only, best-effort)
  const netbird =
    networkMode === 'netbird'
      ? await getNetbirdLiveStatus()
      : { running: false, ip: '', hostname: '' };

  const storedNetbirdHostname =
    (await brain.getConfig('network.netbird.hostname')) || '';

  return {
    mode: networkMode,
    configuredViaEnv,
    totalDevices: rows.length,
    vpnPeers: peers.length,
    onlinePeers: peers.filter((p) => p.status === 'online').length,
    peers,
    tailscale: {
      connected: tailscale.running,
      ip: tailscale.ip,
      hostname: tailscale.hostname || storedHostname,
      hasAuthKey: !!(await brain.getConfig('network.tailscale.authKey')),
    },
    netbird: {
      connected: netbird.running,
      ip: netbird.ip,
      hostname: netbird.hostname || storedNetbirdHostname,
      hasSetupKey: !!(await brain.getConfig('network.netbird.setupKey')),
    },
  };
});
