#!/bin/bash

# =============================================================================
# PROMPT FOR CONFIGURATION
# =============================================================================
prompt_configuration() {
    log_step "Configuration"

    echo ""
    echo -e "${BOLD}Please provide the following information:${NC}"
    echo ""

    # Admin password
    if [[ -z "$GUMM_ADMIN_PASSWORD" ]]; then
        while true; do
            read -sp "Admin password for Gumm dashboard: " GUMM_ADMIN_PASSWORD </dev/tty
            echo ""
            if [[ ${#GUMM_ADMIN_PASSWORD} -lt 8 ]]; then
                log_error "Password must be at least 8 characters"
                continue
            fi
            read -sp "Confirm password: " CONFIRM_PASSWORD </dev/tty
            echo ""
            if [[ "$GUMM_ADMIN_PASSWORD" != "$CONFIRM_PASSWORD" ]]; then
                log_error "Passwords do not match"
                continue
            fi
            break
        done
    fi

    # Port
    read -p "Gumm port [${GUMM_PORT}]: " INPUT_PORT </dev/tty
    GUMM_PORT="${INPUT_PORT:-$GUMM_PORT}"

    # Check if port is available, auto-find next free one if not
    while port_in_use "$GUMM_PORT"; do
        log_warn "Port ${GUMM_PORT} is already in use."
        NEXT_PORT=$((GUMM_PORT + 1))
        # Find the next free port
        while port_in_use "$NEXT_PORT"; do
            NEXT_PORT=$((NEXT_PORT + 1))
        done
        read -p "Use port ${NEXT_PORT} instead? (Y/n): " USE_NEXT </dev/tty
        if [[ "$USE_NEXT" =~ ^[Nn]$ ]]; then
            read -p "Enter a different port: " GUMM_PORT </dev/tty
        else
            GUMM_PORT="$NEXT_PORT"
        fi
    done
    log_success "Port ${GUMM_PORT} is available"

    # Also check Redis port
    while port_in_use "$REDIS_PORT"; do
        log_warn "Redis port ${REDIS_PORT} is already in use."
        NEXT_REDIS=$((REDIS_PORT + 1))
        while port_in_use "$NEXT_REDIS"; do
            NEXT_REDIS=$((NEXT_REDIS + 1))
        done
        read -p "Use Redis port ${NEXT_REDIS} instead? (Y/n): " USE_NEXT_REDIS </dev/tty
        if [[ "$USE_NEXT_REDIS" =~ ^[Nn]$ ]]; then
            read -p "Enter a different Redis port: " REDIS_PORT </dev/tty
        else
            REDIS_PORT="$NEXT_REDIS"
        fi
    done

    # Timezone
    CURRENT_TZ=$(timedatectl show --property=Timezone --value 2>/dev/null || echo "Europe/Paris")
    read -p "Timezone [${CURRENT_TZ}]: " INPUT_TZ </dev/tty
    TZ="${INPUT_TZ:-$CURRENT_TZ}"

    # VPN Selection (optional — can also be configured later from the dashboard)
    echo ""
    echo -e "${BOLD}VPN Mesh Networking Setup${NC}"
    echo -e "${DIM}VPN enables secure mesh networking between your Gumm instance"
    echo -e "and remote CLI agents. You can also configure this later from the dashboard.${NC}"
    echo ""
    echo -e "Choose your VPN provider:"
    echo -e "  ${BOLD}1)${NC} Tailscale   ${DIM}(Toronto, Canada)${NC}"
    echo -e "  ${BOLD}2)${NC} NetBird     ${DIM}(Berlin, Germany — EU alternative)${NC}"
    echo -e "  ${BOLD}3)${NC} Skip for now"
    echo ""
    read -p "Select VPN provider [3]: " VPN_CHOICE </dev/tty
    VPN_CHOICE="${VPN_CHOICE:-3}"

    VPN_PROVIDER="none"
    VPN_AUTHKEY=""

    case "$VPN_CHOICE" in
        1)
            VPN_PROVIDER="tailscale"
            echo ""
            echo -e "${CYAN}To get your Tailscale auth key:${NC}"
            echo -e "  1. Create an account at: ${BOLD}https://login.tailscale.com/start${NC}"
            echo -e "  2. Go to: ${BOLD}https://login.tailscale.com/admin/settings/keys${NC}"
            echo -e "  3. Click 'Generate auth key' and copy the key"
            echo ""
            read -p "Tailscale auth key (leave empty to skip): " VPN_AUTHKEY </dev/tty
            TAILSCALE_AUTHKEY="$VPN_AUTHKEY"
            ;;
        2)
            VPN_PROVIDER="netbird"
            echo ""
            echo -e "${CYAN}To get your NetBird setup key:${NC}"
            echo -e "  1. Create an account at: ${BOLD}https://app.netbird.io${NC}"
            echo -e "  2. Go to: ${BOLD}https://app.netbird.io/setup-keys${NC}"
            echo -e "  3. Click 'Create Setup Key' and copy the key"
            echo ""
            read -p "NetBird setup key (leave empty to skip): " VPN_AUTHKEY </dev/tty
            NETBIRD_SETUP_KEY="$VPN_AUTHKEY"
            ;;
        *)
            log_info "VPN setup skipped — you can configure it later from the dashboard"
            ;;
    esac

    # Telegram Bot (optional)
    echo ""
    echo -e "${BOLD}Telegram Bot Setup${NC}"
    echo -e "${DIM}Connect a Telegram bot to chat with Gumm from anywhere."
    echo -e "You can also configure this later from the dashboard.${NC}"
    echo ""
    echo -e "${CYAN}To create a Telegram bot:${NC}"
    echo -e "  1. Open Telegram and search for ${BOLD}@BotFather${NC}"
    echo -e "  2. Send ${BOLD}/newbot${NC} and follow the instructions"
    echo -e "  3. Copy the bot token (looks like: 123456789:ABCdefGHI...)"
    echo ""
    read -p "Telegram bot token (leave empty to skip): " TELEGRAM_BOT_TOKEN </dev/tty

    if [[ -n "$TELEGRAM_BOT_TOKEN" ]]; then
        echo ""
        echo -e "${GREEN}Bot token saved!${NC}"
        echo ""
        echo -e "${CYAN}To get your Chat ID:${NC}"
        echo -e "  1. Open Telegram and find your new bot (search for its username)"
        echo -e "  2. Send ${BOLD}/start${NC} to your bot"
        echo -e "  3. The bot will reply with your Chat ID"
        echo ""
        echo -e "${DIM}Restricting access to your Chat ID is recommended for security.${NC}"
        read -p "Your Chat ID (leave empty to allow all): " TELEGRAM_CHAT_ID </dev/tty
    fi

    # GitHub token (optional)
    echo ""
    echo -e "${DIM}A GitHub token is only needed to install modules from private repos"
    echo -e "or to avoid API rate limits.${NC}"
    read -p "GitHub personal access token (leave empty to skip): " GITHUB_TOKEN </dev/tty

    # =============================================================================
    # HTTPS SETUP (Tailscale Funnel or Caddy reverse proxy)
    # =============================================================================
    USE_CADDY_PROXY="false"
    USE_TAILSCALE_FUNNEL="false"
    CADDY_DOMAIN=""

    if [[ "$VPN_PROVIDER" == "tailscale" ]]; then
        echo ""
        echo -e "${BOLD}HTTPS Setup — Tailscale Funnel${NC}"
        echo -e "${DIM}Tailscale Funnel exposes your Gumm instance over HTTPS directly"
        echo -e "through Tailscale's edge network — no reverse proxy needed."
        echo -e "Your instance will be accessible at https://<your-machine>.ts.net${NC}"
        echo ""
        read -p "Enable Tailscale Funnel? (Y/n): " ENABLE_FUNNEL </dev/tty
        ENABLE_FUNNEL="${ENABLE_FUNNEL:-Y}"

        if [[ "$ENABLE_FUNNEL" =~ ^[Yy]$ ]]; then
            USE_TAILSCALE_FUNNEL="true"
            log_info "Tailscale Funnel will be configured after VPN connection"
        fi
    elif [[ "$VPN_PROVIDER" == "netbird" ]]; then
        echo ""
        echo -e "${BOLD}Reverse Proxy Setup (Caddy)${NC}"
        echo -e "${DIM}A reverse proxy adds HTTPS and proper IP forwarding for VPN Guard."
        echo -e "Recommended if you're using NetBird.${NC}"
        echo ""
        read -p "Enable Caddy reverse proxy? (Y/n): " ENABLE_CADDY </dev/tty
        ENABLE_CADDY="${ENABLE_CADDY:-Y}"

        if [[ "$ENABLE_CADDY" =~ ^[Yy]$ ]]; then
            USE_CADDY_PROXY="true"
            log_info "Caddy will be configured after VPN connection (domain auto-detected)"
        fi
    fi

    echo ""
    log_success "Configuration collected"
}

# =============================================================================
# CONFIGURE CADDY DOMAIN (after VPN is connected)
# =============================================================================
configure_caddy_domain() {
    if [[ "$USE_CADDY_PROXY" != "true" ]]; then
        return 0
    fi

    log_step "Configuring Caddy domain..."

    # Try to auto-detect VPN domain now that VPN is connected
    DETECTED_DOMAIN=""
    
    if [[ "$VPN_PROVIDER" == "tailscale" ]]; then
        if command -v tailscale &>/dev/null && tailscale status &>/dev/null; then
            DETECTED_DOMAIN=$(tailscale status --json 2>/dev/null | grep -o '"DNSName":"[^"]*"' | head -1 | sed 's/"DNSName":"//;s/"$//' | sed 's/\.$//')
        fi
        if [[ -z "$DETECTED_DOMAIN" ]]; then
            echo -e "${CYAN}Enter your Tailscale MagicDNS hostname:${NC}"
            echo -e "  ${DIM}(Example: gumm-server.tail12345.ts.net)${NC}"
            echo -e "  ${DIM}Find it with: tailscale status${NC}"
        fi
    elif [[ "$VPN_PROVIDER" == "netbird" ]]; then
        if command -v netbird &>/dev/null && netbird status 2>/dev/null | grep -q "Connected"; then
            DETECTED_DOMAIN=$(netbird status 2>/dev/null | grep -oP 'FQDN:\s*\K[^\s]+' | head -1)
        fi
        if [[ -z "$DETECTED_DOMAIN" ]]; then
            echo -e "${CYAN}Enter your NetBird FQDN:${NC}"
            echo -e "  ${DIM}(Example: my-server.netbird.cloud)${NC}"
            echo -e "  ${DIM}Find it with: netbird status${NC}"
        fi
    fi

    if [[ -n "$DETECTED_DOMAIN" ]]; then
        echo -e "${GREEN}Detected VPN domain: ${BOLD}${DETECTED_DOMAIN}${NC}"
        read -p "Use this domain? (Y/n): " USE_DETECTED </dev/tty
        USE_DETECTED="${USE_DETECTED:-Y}"
        if [[ "$USE_DETECTED" =~ ^[Yy]$ ]]; then
            CADDY_DOMAIN="$DETECTED_DOMAIN"
        fi
    fi

    if [[ -z "$CADDY_DOMAIN" ]]; then
        read -p "VPN domain for Caddy: " CADDY_DOMAIN </dev/tty
    fi

    if [[ -z "$CADDY_DOMAIN" ]]; then
        log_warn "No domain provided, Caddy proxy will not be enabled"
        USE_CADDY_PROXY="false"
    else
        log_success "Caddy will proxy: https://${CADDY_DOMAIN}"
        
        # Update .env file with the domain
        if [[ -f "$INSTALL_DIR/.env" ]]; then
            sed -i "s|^CADDY_DOMAIN=.*|CADDY_DOMAIN=${CADDY_DOMAIN}|" "$INSTALL_DIR/.env"
        fi
    fi
}

# =============================================================================
# GENERATE SECRETS & CREATE .env
# =============================================================================
create_env_file() {
    log_step "Generating secrets and environment file..."

    ENV_FILE="$INSTALL_DIR/.env"

    # Generate session secret (64 hex chars)
    NUXT_SESSION_PASSWORD=$(openssl rand -hex 32)
    log_info "Generated session secret"

    cat > "$ENV_FILE" << EOF
# =============================================================================
# Gumm — Environment Configuration
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# Installer: v${INSTALLER_VERSION} (${INSTALLER_DATE})
# =============================================================================

# ─── Authentication ──────────────────────────────────────────────────────────
# Admin password for the web dashboard
GUMM_ADMIN_PASSWORD=${GUMM_ADMIN_PASSWORD}

# Session encryption secret (auto-generated, do not change)
NUXT_SESSION_PASSWORD=${NUXT_SESSION_PASSWORD}

# ─── Ports ───────────────────────────────────────────────────────────────────
GUMM_PORT=${GUMM_PORT}
REDIS_PORT=${REDIS_PORT}

# ─── Redis ───────────────────────────────────────────────────────────────────
# Internal Docker network URL (do not change unless you know what you're doing)
REDIS_URL=redis://redis:6379

# ─── Timezone ────────────────────────────────────────────────────────────────
TZ=${TZ}

# ─── Optional: GitHub Token ──────────────────────────────────────────────────
# Needed for installing modules from private repos
GITHUB_TOKEN=${GITHUB_TOKEN:-}

# ─── VPN Configuration ───────────────────────────────────────────────────────
# VPN provider: tailscale, netbird, or none
VPN_PROVIDER=${VPN_PROVIDER:-none}

# NetBird setup key (if using NetBird)
NB_SETUP_KEY=${NETBIRD_SETUP_KEY:-}
NB_HOSTNAME=${NB_HOSTNAME:-gumm}

# Tailscale auth key (if using Tailscale)
TS_AUTHKEY=${TAILSCALE_AUTHKEY:-}

# ─── Telegram Configuration ──────────────────────────────────────────────────
# Telegram bot token (from @BotFather)
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-}

# Allowed Telegram chat ID (leave empty to allow all)
TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID:-}

# ─── Caddy Reverse Proxy ─────────────────────────────────────────────────────
# Enable Caddy proxy with: docker compose --profile proxy up -d
# Domain for Caddy (Tailscale MagicDNS or NetBird FQDN)
CADDY_DOMAIN=${CADDY_DOMAIN:-}

# Set to restrict Caddy/Gumm to VPN IP only (e.g., 100.87.158.182)
# Leave empty to bind to all interfaces (0.0.0.0)
VPN_BIND_IP=${VPN_BIND_IP:-}

# Path to Tailscale SSL certificates (for .ts.net domains)
TAILSCALE_CERTS_PATH=/var/lib/tailscale/certs

# ─── Note ────────────────────────────────────────────────────────────────────
# OpenRouter API key is configured via the web Setup Wizard (/setup).
# Google OAuth and other integrations are also configured from the dashboard.
EOF

    chmod 600 "$ENV_FILE"

    log_success "Environment file created: $ENV_FILE"
}

# =============================================================================
# CREATE GLOBAL CONFIG FILE
# =============================================================================
create_global_config() {
    log_step "Creating global configuration..."

    mkdir -p /etc/gumm

    cat > /etc/gumm/config << EOF
# Gumm Installation Configuration
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

# Installer version used for this installation
INSTALLER_VERSION="${INSTALLER_VERSION}"
INSTALLER_DATE="${INSTALLER_DATE}"

INSTALL_DIR="${INSTALL_DIR}"
GUMM_PORT="${GUMM_PORT}"
REDIS_PORT="${REDIS_PORT}"
REPO_URL="${REPO_URL}"
BRANCH="${BRANCH}"
VPN_PROVIDER="${VPN_PROVIDER}"
USE_CADDY_PROXY="${USE_CADDY_PROXY}"
CADDY_DOMAIN="${CADDY_DOMAIN:-}"
EOF

    chmod 644 /etc/gumm/config

    log_success "Global config saved to /etc/gumm/config"
}
