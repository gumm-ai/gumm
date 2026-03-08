#!/bin/bash
# Detect VPN configuration (Tailscale or NetBird)
# Usage: ./detect-vpn.sh [tailscale|netbird]
# Outputs JSON with IP and domain info

set -e

detect_tailscale() {
    if ! command -v tailscale &> /dev/null; then
        echo '{"installed": false}'
        return
    fi
    
    # Get Tailscale status
    STATUS=$(tailscale status --json 2>/dev/null || echo '{}')
    
    if [ "$STATUS" = "{}" ]; then
        echo '{"installed": true, "connected": false}'
        return
    fi
    
    # Extract IP and DNS name
    SELF=$(echo "$STATUS" | jq -r '.Self // empty')
    
    if [ -z "$SELF" ]; then
        echo '{"installed": true, "connected": false}'
        return
    fi
    
    IP=$(echo "$SELF" | jq -r '.TailscaleIPs[0] // empty')
    DNS_NAME=$(echo "$SELF" | jq -r '.DNSName // empty' | sed 's/\.$//')  # Remove trailing dot
    HOSTNAME=$(echo "$SELF" | jq -r '.HostName // empty')
    ONLINE=$(echo "$SELF" | jq -r '.Online // false')
    
    # Get MagicDNS domain suffix
    MAGIC_DNS=$(echo "$STATUS" | jq -r '.MagicDNSSuffix // empty')
    
    jq -n \
        --arg installed "true" \
        --arg connected "$ONLINE" \
        --arg ip "$IP" \
        --arg dns_name "$DNS_NAME" \
        --arg hostname "$HOSTNAME" \
        --arg magic_dns "$MAGIC_DNS" \
        '{
            installed: true,
            connected: ($connected == "true"),
            ip: $ip,
            dns_name: $dns_name,
            hostname: $hostname,
            magic_dns_suffix: $magic_dns
        }'
}

detect_netbird() {
    if ! command -v netbird &> /dev/null; then
        echo '{"installed": false}'
        return
    fi
    
    # Get NetBird status
    STATUS=$(netbird status 2>/dev/null || echo '')
    
    if [ -z "$STATUS" ]; then
        echo '{"installed": true, "connected": false}'
        return
    fi
    
    # Parse netbird status output
    IP=$(echo "$STATUS" | grep -oP 'NetBird IP: \K[0-9.]+' || echo '')
    FQDN=$(echo "$STATUS" | grep -oP 'FQDN: \K[^\s]+' || echo '')
    MGMT=$(echo "$STATUS" | grep -oP 'Management: \K\w+' || echo '')
    
    CONNECTED="false"
    if [ "$MGMT" = "Connected" ]; then
        CONNECTED="true"
    fi
    
    jq -n \
        --arg connected "$CONNECTED" \
        --arg ip "$IP" \
        --arg fqdn "$FQDN" \
        '{
            installed: true,
            connected: ($connected == "true"),
            ip: $ip,
            fqdn: $fqdn
        }'
}

# Main
case "${1:-auto}" in
    tailscale)
        detect_tailscale
        ;;
    netbird)
        detect_netbird
        ;;
    auto)
        # Try both, prefer connected one
        TS=$(detect_tailscale)
        NB=$(detect_netbird)
        
        TS_CONNECTED=$(echo "$TS" | jq -r '.connected // false')
        NB_CONNECTED=$(echo "$NB" | jq -r '.connected // false')
        
        if [ "$TS_CONNECTED" = "true" ]; then
            echo "$TS" | jq '. + {vpn: "tailscale"}'
        elif [ "$NB_CONNECTED" = "true" ]; then
            echo "$NB" | jq '. + {vpn: "netbird"}'
        elif [ "$(echo "$TS" | jq -r '.installed')" = "true" ]; then
            echo "$TS" | jq '. + {vpn: "tailscale"}'
        elif [ "$(echo "$NB" | jq -r '.installed')" = "true" ]; then
            echo "$NB" | jq '. + {vpn: "netbird"}'
        else
            echo '{"installed": false, "vpn": "none"}'
        fi
        ;;
    *)
        echo "Usage: $0 [tailscale|netbird|auto]"
        exit 1
        ;;
esac
