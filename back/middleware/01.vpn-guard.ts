/**
 * VPN Guard Middleware — Blocks non-VPN traffic when Tailscale/NetBird is enabled.
 *
 * When network.mode is "tailscale" or "netbird", only requests from VPN IP ranges
 * are allowed. Public IP connections are blocked with a 403 error.
 *
 * This ensures the Gumm instance is only accessible through the secure VPN tunnel.
 */

// VPN IP ranges (CGNAT range used by Tailscale and NetBird)
// 100.64.0.0/10 = 100.64.0.0 - 100.127.255.255
const VPN_RANGES = [
  { start: ipToLong('100.64.0.0'), end: ipToLong('100.127.255.255') }, // CGNAT (Tailscale/NetBird)
];

// Docker internal network ranges (trusted when VPN runs on host)
// Traffic from VPN on host arrives via Docker gateway
const DOCKER_RANGES = [
  { start: ipToLong('172.16.0.0'), end: ipToLong('172.31.255.255') }, // Docker default bridge
  { start: ipToLong('192.168.0.0'), end: ipToLong('192.168.255.255') }, // Docker custom networks
  { start: ipToLong('10.0.0.0'), end: ipToLong('10.255.255.255') }, // Docker overlay networks
];

// Localhost IPs (always allowed for internal processes)
const LOCALHOST_IPS = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];

// Paths that bypass VPN check (e.g., health checks, external service callbacks)
// Use /api/webhooks/* for external integrations (n8n, custom webhooks, etc.)
const BYPASS_PATHS = [
  '/api/health',
  '/api/ping',
  '/_health',
  '/_ping',
  '/api/setup/', // Setup endpoints must be reachable before VPN is configured
  '/api/telegram/webhook', // Telegram servers need to reach this
  '/api/webhooks/', // External webhooks prefix (n8n, automations, etc.)
];

/** Convert IPv4 string to long for range comparison */
function ipToLong(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return 0;
  return (
    ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0
  );
}

/** Check if an IP is in the VPN ranges */
function isVpnIp(ip: unknown): boolean {
  // Ensure ip is a string
  if (typeof ip !== 'string' || !ip) {
    return false;
  }

  // Handle IPv6-mapped IPv4 (::ffff:x.x.x.x)
  const cleanIp = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

  // Check localhost
  if (LOCALHOST_IPS.includes(ip) || LOCALHOST_IPS.includes(cleanIp)) {
    return true;
  }

  // Only check IPv4 addresses for VPN ranges
  if (!cleanIp.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
    return false;
  }

  const ipLong = ipToLong(cleanIp);
  return VPN_RANGES.some(
    (range) => ipLong >= range.start && ipLong <= range.end,
  );
}

/**
 * Check if an IP is from Docker internal network.
 * When VPN (Tailscale/NetBird) runs on the HOST (not in container),
 * traffic arrives via the Docker gateway with a private IP (172.x.x.x).
 * This is secure because external traffic can't reach these IPs directly.
 */
function isDockerInternalIp(ip: unknown): boolean {
  // Ensure ip is a string
  if (typeof ip !== 'string' || !ip) {
    return false;
  }

  const cleanIp = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

  if (!cleanIp.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
    return false;
  }

  const ipLong = ipToLong(cleanIp);
  return DOCKER_RANGES.some(
    (range) => ipLong >= range.start && ipLong <= range.end,
  );
}

/** Get the real client IP from the request */
function getClientIp(event: any): string {
  // Check X-Forwarded-For header (set by reverse proxies)
  const forwarded = getHeader(event, 'x-forwarded-for');
  if (forwarded) {
    // Take the first IP in the chain (original client)
    const first = forwarded.split(',')[0];
    return first?.trim() || '';
  }

  // Check X-Real-IP header (nginx)
  const realIp = getHeader(event, 'x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Try multiple methods to get the socket IP
  const req = event.node?.req;

  // Bun stores the socket differently - check the raw socket object
  const socket = req?.socket || req?.connection;

  // socket.address() returns an object { address, port, family }, not a string
  let socketAddressIp: string | undefined;
  if (typeof socket?.address === 'function') {
    const addr = socket.address();
    socketAddressIp = typeof addr === 'object' ? addr?.address : addr;
  }

  const socketIp =
    socket?.remoteAddress ||
    socket?._socket?.remoteAddress ||
    socketAddressIp ||
    req?.info?.remoteAddress ||
    req?.ip;

  // Use Nitro's getRequestIP as fallback
  const nitroIp = getRequestIP(event, { xForwardedFor: false });

  // Bun-specific: check event.context or raw request
  const contextIp = event.context?.clientAddress || event.context?.ip;

  // Check if there's a _remoteAddress on the event itself (H3/Nitro)
  const h3Ip = event._remoteAddress || event.remoteAddress;

  // Check event.web which Bun/H3 might use
  const webIp =
    event.web?.request?.headers?.get?.('x-forwarded-for') ||
    event.web?.remoteAddress;

  const finalIp = nitroIp || socketIp || contextIp || h3Ip || webIp || '';

  return finalIp;
}

/**
 * Check if request comes from NetBird reverse proxy with authenticated user.
 * NetBird reverse proxy sets these headers when user is authenticated:
 * - X-Netbird-User-Id: The authenticated user's ID
 * - X-Netbird-User-Name: The authenticated user's name
 * - X-Netbird-User-Email: The authenticated user's email (optional)
 *
 * Enable "Add Identity Headers" in NetBird proxy advanced settings.
 */
function isNetbirdProxyRequest(event: any): boolean {
  const userId = getHeader(event, 'x-netbird-user-id');
  const userName = getHeader(event, 'x-netbird-user-name');

  // Debug: log all netbird headers
  if (userId || userName) {
    console.log(
      `[vpn-guard] NetBird proxy headers detected: userId=${userId}, userName=${userName}`,
    );
  }

  // If we have a NetBird user ID or name header, the request is authenticated via NetBird proxy
  return (!!userId && userId.length > 0) || (!!userName && userName.length > 0);
}

// Cache for VPN mode status (refreshed periodically)
let vpnModeCache: {
  mode: string | null;
  allowedIps: string[];
  bypassPaths: string[];
  lastCheck: number;
} = {
  mode: null,
  allowedIps: [],
  bypassPaths: [],
  lastCheck: 0,
};
const CACHE_TTL_MS = 30_000; // 30 seconds

/** Get VPN mode, allowed IPs, and custom bypass paths from brain config with caching */
async function getVpnConfig(): Promise<{
  mode: string | null;
  allowedIps: string[];
  bypassPaths: string[];
}> {
  const now = Date.now();

  // Return cached value if fresh
  if (
    vpnModeCache.mode !== null &&
    now - vpnModeCache.lastCheck < CACHE_TTL_MS
  ) {
    return {
      mode: vpnModeCache.mode,
      allowedIps: vpnModeCache.allowedIps,
      bypassPaths: vpnModeCache.bypassPaths,
    };
  }

  try {
    const brain = useBrain();
    await brain.ready();
    const mode = await brain.getConfig('network.mode');
    // Get optional whitelist of allowed IPs (comma-separated)
    const allowedIpsStr = await brain.getConfig('network.allowedIps');
    const allowedIps = allowedIpsStr
      ? allowedIpsStr
          .split(',')
          .map((ip: string) => ip.trim())
          .filter(Boolean)
      : [];
    // Get optional custom bypass paths (comma-separated)
    const bypassPathsStr = await brain.getConfig('network.bypassPaths');
    const bypassPaths = bypassPathsStr
      ? bypassPathsStr
          .split(',')
          .map((p: string) => p.trim())
          .filter(Boolean)
      : [];
    vpnModeCache = {
      mode: mode || 'none',
      allowedIps,
      bypassPaths,
      lastCheck: now,
    };
    return { mode: vpnModeCache.mode, allowedIps, bypassPaths };
  } catch {
    // If brain isn't ready yet, allow traffic (startup phase)
    return { mode: null, allowedIps: [], bypassPaths: [] };
  }
}

export default defineEventHandler(async (event) => {
  const path = event.path || getRequestURL(event).pathname;

  // Always allow hardcoded bypass paths (health checks, webhooks prefix, etc.)
  if (BYPASS_PATHS.some((bp) => path.startsWith(bp))) {
    return;
  }

  // Check VPN mode and get config
  const { mode: networkMode, allowedIps, bypassPaths } = await getVpnConfig();

  // If no VPN configured, allow all traffic
  if (!networkMode || networkMode === 'none') {
    return;
  }

  // Check custom bypass paths from config
  if (bypassPaths.some((bp) => path.startsWith(bp))) {
    return;
  }

  // VPN is enabled (tailscale or netbird) - verify client IP
  if (networkMode === 'tailscale' || networkMode === 'netbird') {
    const clientIp = getClientIp(event);

    // For NetBird: also allow authenticated requests via NetBird reverse proxy
    if (networkMode === 'netbird' && isNetbirdProxyRequest(event)) {
      // Request authenticated via NetBird reverse proxy - allow it
      return;
    }

    // Check if IP is allowed:
    // 1. Direct VPN IP (100.x.x.x) - client connected directly via VPN
    // 2. Docker internal IP (172.x.x.x) - VPN runs on host, traffic comes via Docker gateway
    // 3. Explicitly whitelisted IP
    const isAllowed =
      isVpnIp(clientIp) ||
      isDockerInternalIp(clientIp) ||
      allowedIps.includes(clientIp);

    if (!isAllowed) {
      // Debug: log headers when blocking to help diagnose issues
      const netbirdUserId = getHeader(event, 'x-netbird-user-id');
      const netbirdUserName = getHeader(event, 'x-netbird-user-name');
      const xForwardedFor = getHeader(event, 'x-forwarded-for');
      console.warn(
        `[vpn-guard] Blocked non-VPN access from ${clientIp} to ${path} (mode: ${networkMode})` +
          ` | headers: x-netbird-user-id=${netbirdUserId || 'none'}, x-netbird-user-name=${netbirdUserName || 'none'}, x-forwarded-for=${xForwardedFor || 'none'}`,
      );

      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden',
        message: `Access denied. This instance is only accessible via ${networkMode === 'tailscale' ? 'Tailscale' : 'NetBird'}.`,
      });
    }
  }
});
