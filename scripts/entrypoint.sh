#!/bin/sh
set -e

# Resolve Docker service hostnames BEFORE VPN daemons modify DNS
# This ensures internal services (redis, etc.) remain reachable via /etc/hosts
echo "[gumm] Resolving Docker service hostnames..."
REDIS_IP=$(host redis 2>/dev/null | grep 'has address' | awk '{print $4}' | head -1)
if [ -z "$REDIS_IP" ]; then
    # Fallback: try ping method
    REDIS_IP=$(ping -c1 -W1 redis 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)
fi
if [ -n "$REDIS_IP" ]; then
    echo "$REDIS_IP redis" >> /etc/hosts
    echo "[gumm] Added redis ($REDIS_IP) to /etc/hosts"
else
    echo "[gumm] Warning: Could not resolve redis hostname"
fi

# VPN NOTE: Tailscale/NetBird should run on the HOST, not in this container.
# When VPN mode is enabled, the container accepts traffic from Docker internal
# network (172.x.x.x), which is how traffic arrives when VPN runs on the host.
# This architecture avoids conflicts and simplifies networking.
echo "[gumm] VPN should run on HOST - container accepts Docker network traffic"

# Start the application
exec bun .output/server/index.mjs
