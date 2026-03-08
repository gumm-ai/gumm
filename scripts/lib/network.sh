#!/bin/bash

# =============================================================================
# CONFIGURE FIREWALL
# =============================================================================
configure_firewall() {
    log_step "Configuring firewall..."

    # UFW (Ubuntu/Debian)
    if command -v ufw &> /dev/null; then
        log_info "Configuring UFW..."
        ufw --force enable
        ufw allow ssh
        ufw allow "${GUMM_PORT}/tcp"
        # Allow Tailscale UDP
        ufw allow 41641/udp
        # Allow NetBird UDP
        ufw allow 51820/udp
        ufw reload
        log_success "UFW configured (ports: SSH, ${GUMM_PORT}/tcp, 41641/udp, 51820/udp)"
        return 0
    fi

    # firewalld (CentOS/RHEL)
    if command -v firewall-cmd &> /dev/null && systemctl is-active firewalld &> /dev/null; then
        log_info "Configuring firewalld..."
        firewall-cmd --permanent --add-service=ssh
        firewall-cmd --permanent --add-port="${GUMM_PORT}/tcp"
        firewall-cmd --permanent --add-port=41641/udp
        firewall-cmd --permanent --add-port=51820/udp
        firewall-cmd --reload
        log_success "firewalld configured"
        return 0
    fi

    log_warn "No active firewall detected. Consider configuring one manually."
}

# =============================================================================
# CONFIGURE VPN ON HOST (optional — Tailscale or NetBird)
# =============================================================================
# VPN (Tailscale/NetBird) MUST run on the host, not in Docker.
# This avoids conflicts and simplifies networking.
# When VPN is on the host:
#   - Traffic arrives via VPN IP on the host
#   - Host forwards to Docker container via Docker network
#   - Container sees traffic from Docker gateway (172.x.x.x)
#   - vpn-guard middleware allows Docker internal IPs when VPN mode is set
configure_vpn_host() {
    if [[ "$VPN_PROVIDER" == "tailscale" ]] && [[ -n "$TAILSCALE_AUTHKEY" ]]; then
        log_step "Configuring Tailscale on host..."

        if ! command -v tailscale &> /dev/null; then
            log_warn "Tailscale binary not found on host."
            log_info "Install it manually: curl -fsSL https://tailscale.com/install.sh | sh"
            return 0
        fi

        # Check if already connected
        if tailscale status &>/dev/null; then
            log_info "Tailscale is already connected on host"
            return 0
        fi

        tailscale up --authkey="$TAILSCALE_AUTHKEY" --hostname="gumm-server"
        log_success "Tailscale connected on host"

    elif [[ "$VPN_PROVIDER" == "netbird" ]] && [[ -n "$NETBIRD_SETUP_KEY" ]]; then
        log_step "Configuring NetBird on host..."

        # Verify NetBird binary actually exists and works
        if ! command -v netbird &> /dev/null || ! netbird version &>/dev/null; then
            log_warn "NetBird binary not found or not working."
            log_info "Attempting to install NetBird..."
            if ! install_netbird; then
                log_warn "NetBird installation failed."
                log_info "Install it manually: curl -fsSL https://pkgs.netbird.io/install.sh | sh"
                return 0
            fi
        fi

        # Check if already connected
        if netbird status 2>/dev/null | grep -q "Connected"; then
            log_info "NetBird is already connected on host"
            return 0
        fi

        # Stop any existing service first
        systemctl stop netbird 2>/dev/null || true

        # Install the service (creates config dir structure)
        netbird service install 2>/dev/null || true

        # Start the service - this creates the socket that netbird up needs
        netbird service start 2>/dev/null || systemctl start netbird 2>/dev/null || true
        
        # Wait a moment for the socket to be created
        sleep 2

        # Connect with setup key (this creates the config)
        if netbird up --setup-key "$NETBIRD_SETUP_KEY"; then
            log_success "NetBird connected on host"
            # Now enable the service for persistence
            systemctl enable netbird 2>/dev/null || true
        else
            log_warn "NetBird connection failed. You can try manually: netbird up --setup-key YOUR_KEY"
        fi
    fi
}

# =============================================================================
# CONFIGURE CADDY SSL CERTIFICATES
# =============================================================================
configure_caddy_ssl() {
    if [[ "$USE_CADDY_PROXY" != "true" ]] || [[ -z "$CADDY_DOMAIN" ]]; then
        return 0
    fi

    log_step "Configuring Caddy SSL certificates..."

    # Create certs directory
    mkdir -p /var/lib/tailscale/certs

    if [[ "$VPN_PROVIDER" == "tailscale" ]]; then
        # For Tailscale: generate certs with `tailscale cert`
        log_info "Generating Tailscale SSL certificate for ${CADDY_DOMAIN}..."
        
        if tailscale cert --cert-file="/var/lib/tailscale/certs/${CADDY_DOMAIN}.crt" \
                         --key-file="/var/lib/tailscale/certs/${CADDY_DOMAIN}.key" \
                         "$CADDY_DOMAIN" 2>/dev/null; then
            log_success "Tailscale certificate generated"
            
            # Generate Caddyfile with explicit TLS
            cat > "$INSTALL_DIR/scripts/Caddyfile" << EOF
# Gumm Reverse Proxy - Tailscale SSL
# Auto-generated by setup-server.sh

${CADDY_DOMAIN} {
    tls /etc/caddy/tailscale-certs/${CADDY_DOMAIN}.crt /etc/caddy/tailscale-certs/${CADDY_DOMAIN}.key
    
    reverse_proxy gumm:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up Host {host}
    }
}

:8080 {
    respond /health "OK" 200
}
EOF
        else
            log_warn "Could not generate Tailscale certificate. Using internal TLS."
            # Fallback to internal CA
            cat > "$INSTALL_DIR/scripts/Caddyfile" << EOF
# Gumm Reverse Proxy - Internal TLS (self-signed)
# Auto-generated by setup-server.sh

${CADDY_DOMAIN} {
    tls internal
    
    reverse_proxy gumm:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up Host {host}
    }
}

:8080 {
    respond /health "OK" 200
}
EOF
        fi

    elif [[ "$VPN_PROVIDER" == "netbird" ]]; then
        # Check if domain is VPN-only (*.netbird.cloud) - can't use Let's Encrypt
        if [[ "$CADDY_DOMAIN" == *.netbird.cloud ]]; then
            log_info "Configuring internal TLS for ${CADDY_DOMAIN} (VPN-only domain)..."
            
            cat > "$INSTALL_DIR/scripts/Caddyfile" << EOF
# Gumm Reverse Proxy - Internal TLS (VPN-only domain)
# Auto-generated by setup-server.sh
# Note: *.netbird.cloud domains are VPN-only, so Let's Encrypt cannot validate them.
# Using Caddy's internal CA instead (you'll see a browser warning on first visit).

${CADDY_DOMAIN} {
    tls internal
    
    reverse_proxy gumm:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up Host {host}
    }
}

:8080 {
    respond /health "OK" 200
}
EOF
            log_success "Caddy configured with internal TLS (self-signed)"
        else
            # Public domain - use Let's Encrypt
            log_info "Configuring Let's Encrypt for ${CADDY_DOMAIN}..."
            
            cat > "$INSTALL_DIR/scripts/Caddyfile" << EOF
# Gumm Reverse Proxy - Let's Encrypt SSL
# Auto-generated by setup-server.sh

${CADDY_DOMAIN} {
    # Let's Encrypt will auto-generate certificate
    
    reverse_proxy gumm:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up Host {host}
    }
}

:8080 {
    respond /health "OK" 200
}
EOF
            log_success "Caddy configured for Let's Encrypt"
        fi
    fi
}

# =============================================================================
# CONFIGURE TAILSCALE FUNNEL
# =============================================================================
# Tailscale Funnel exposes a local port over HTTPS via Tailscale's edge network.
# No reverse proxy (Caddy) is needed when Funnel is enabled.
# Docs: https://tailscale.com/docs/features/tailscale-funnel
configure_tailscale_funnel() {
    if [[ "$USE_TAILSCALE_FUNNEL" != "true" ]]; then
        return 0
    fi

    log_step "Configuring Tailscale Funnel..."

    if ! command -v tailscale &> /dev/null; then
        log_warn "Tailscale binary not found, cannot enable Funnel"
        return 1
    fi

    # Ensure Tailscale is connected
    if ! tailscale status &>/dev/null; then
        log_warn "Tailscale is not connected, cannot enable Funnel"
        return 1
    fi

    # Enable HTTPS on the Tailscale node (required for Funnel)
    tailscale set --webclient=false 2>/dev/null || true

    # Start Funnel in background mode, forwarding to the Gumm port
    FUNNEL_OUTPUT=$(tailscale funnel --bg "${GUMM_PORT}" 2>&1)
    if [[ $? -eq 0 ]]; then
        # Detect the Funnel URL — first try parsing the funnel command output
        FUNNEL_DOMAIN=$(echo "$FUNNEL_OUTPUT" | grep -oP 'https://\K[^/]+\.ts\.net' | head -1)
        # Fallback: detect from tailscale status --json
        if [[ -z "$FUNNEL_DOMAIN" ]]; then
            FUNNEL_DOMAIN=$(tailscale status --json 2>/dev/null | grep -o '"DNSName":"[^"]*"' | head -1 | sed 's/"DNSName":"//;s/"$//' | sed 's/\.$//')
        fi
        if [[ -n "$FUNNEL_DOMAIN" ]]; then
            log_success "Tailscale Funnel active: https://${FUNNEL_DOMAIN}"
            TAILSCALE_FUNNEL_DOMAIN="$FUNNEL_DOMAIN"
        else
            log_success "Tailscale Funnel started on port ${GUMM_PORT}"
        fi
    else
        log_warn "Failed to start Tailscale Funnel. You can enable it manually:"
        log_info "  tailscale funnel --bg ${GUMM_PORT}"
    fi
}

# =============================================================================
# CONFIGURE VPN MODE IN CONTAINER (via API)
# =============================================================================
# NOTE: VPN daemons run on the HOST, not in the container.
# This function just tells the container which VPN mode is active,
# so the vpn-guard middleware knows to expect traffic via Docker network.
configure_vpn_container() {
    if [[ "$VPN_PROVIDER" == "none" ]]; then
        return 0
    fi

    log_step "Configuring VPN mode ($VPN_PROVIDER) in container..."

    # Wait for Gumm to be ready (up to 60 seconds)
    for i in $(seq 1 30); do
        if curl -sf "http://localhost:${GUMM_PORT}/api/setup/status" &>/dev/null; then
            break
        fi
        sleep 2
    done

    # Login to get a session (use the admin password from config)
    LOGIN_RESPONSE=$(curl -sf -c /tmp/gumm-cookies.txt -X POST \
        "http://localhost:${GUMM_PORT}/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"password\":\"${GUMM_ADMIN_PASSWORD}\"}" 2>/dev/null) || true

    if echo "$LOGIN_RESPONSE" | grep -q '"ok":true'; then
        # Set network mode (just the mode, no auth keys - VPN runs on host)
        if [[ "$VPN_PROVIDER" == "tailscale" ]]; then
            CONNECT_RESPONSE=$(curl -sf -b /tmp/gumm-cookies.txt -X POST \
                "http://localhost:${GUMM_PORT}/api/network/tailscale/connect" \
                -H "Content-Type: application/json" \
                -d "{\"hostname\":\"gumm\"}" 2>/dev/null) || true
        elif [[ "$VPN_PROVIDER" == "netbird" ]]; then
            CONNECT_RESPONSE=$(curl -sf -b /tmp/gumm-cookies.txt -X POST \
                "http://localhost:${GUMM_PORT}/api/network/netbird/connect" \
                -H "Content-Type: application/json" \
                -d "{\"hostname\":\"gumm\"}" 2>/dev/null) || true
        fi

        if echo "$CONNECT_RESPONSE" | grep -q '"ok":true'; then
            log_success "$VPN_PROVIDER mode enabled in container"
        else
            log_warn "Could not set $VPN_PROVIDER mode (configure manually from dashboard)"
        fi

        rm -f /tmp/gumm-cookies.txt
    else
        log_warn "Could not authenticate to API (configure $VPN_PROVIDER from dashboard)"
    fi
}

# =============================================================================
# CONFIGURE TELEGRAM IN CONTAINER (via API)
# =============================================================================
configure_telegram_container() {
    if [[ -z "$TELEGRAM_BOT_TOKEN" ]]; then
        return 0
    fi

    log_step "Configuring Telegram bot in container..."

    # Wait for Gumm to be ready (up to 60 seconds)
    for i in $(seq 1 30); do
        if curl -sf "http://localhost:${GUMM_PORT}/api/setup/status" &>/dev/null; then
            break
        fi
        sleep 2
    done

    # Login to get a session (use the admin password from config)
    LOGIN_RESPONSE=$(curl -sf -c /tmp/gumm-cookies.txt -X POST \
        "http://localhost:${GUMM_PORT}/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"password\":\"${GUMM_ADMIN_PASSWORD}\"}" 2>/dev/null) || true

    if echo "$LOGIN_RESPONSE" | grep -q '"ok":true'; then
        # Setup Telegram bot
        TELEGRAM_RESPONSE=$(curl -sf -b /tmp/gumm-cookies.txt -X POST \
            "http://localhost:${GUMM_PORT}/api/telegram/setup" \
            -H "Content-Type: application/json" \
            -d "{\"botToken\":\"${TELEGRAM_BOT_TOKEN}\",\"allowedChatIds\":\"${TELEGRAM_CHAT_ID:-}\"}" 2>/dev/null) || true

        if echo "$TELEGRAM_RESPONSE" | grep -q '"ok":true\|"configured":true'; then
            log_success "Telegram bot configured"
        else
            log_warn "Could not configure Telegram bot (configure manually from dashboard)"
        fi

        rm -f /tmp/gumm-cookies.txt
    else
        log_warn "Could not authenticate to API (configure Telegram from dashboard)"
    fi
}
