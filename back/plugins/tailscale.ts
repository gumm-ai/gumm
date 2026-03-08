/**
 * Nitro Plugin — Tailscale VPN status check.
 *
 * NOTE: VPN daemons (Tailscale/NetBird) should run on the HOST, not inside Docker.
 * This avoids conflicts and simplifies networking. The container accepts traffic
 * from Docker internal network (172.x.x.x) when VPN mode is enabled.
 *
 * This plugin only logs the current VPN mode for debugging purposes.
 */

export default defineNitroPlugin(async () => {
  // Small delay to let the DB and brain singleton initialize
  setTimeout(async () => {
    try {
      const brain = useBrain();
      await brain.ready();

      const mode = await brain.getConfig('network.mode');

      if (mode === 'tailscale') {
        console.log(
          '[tailscale] VPN mode enabled — expecting Tailscale on HOST (not in container)',
        );
        console.log(
          '[tailscale] Traffic from Docker network (172.x.x.x) will be allowed',
        );

        // Log stored config for debugging
        const hostname = await brain.getConfig('network.tailscale.hostname');
        const ip = await brain.getConfig('network.tailscale.ip');
        if (hostname || ip) {
          console.log(
            `[tailscale] Stored config: hostname=${hostname || 'none'}, ip=${ip || 'none'}`,
          );
        }
      }
    } catch (err: any) {
      console.error('[tailscale] Plugin error:', err.message);
    }
  }, 3000);
});
