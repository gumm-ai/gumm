#!/bin/bash
# =============================================================================
# Gumm — Complete VPS Installation Script
# =============================================================================
# Installs and configures Gumm from scratch on a fresh VPS.
# Supports: Ubuntu 20.04+, Debian 11+, CentOS 8+, RHEL 8+, Amazon Linux 2
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/gumm-ai/gumm/main/scripts/setup-server.sh | bash
#   # or locally:
#   sudo bash scripts/setup-server.sh
#
# Options:
#   --uninstall   Remove Gumm and all data
#   --version     Show installer version
#   --help        Show usage
# =============================================================================

# Installer version — increment this when making significant changes
INSTALLER_VERSION="1.0.1"
INSTALLER_DATE="2026-03-07"

# Store current version before potentially sourcing old config
CURRENT_INSTALLER_VERSION="$INSTALLER_VERSION"
CURRENT_INSTALLER_DATE="$INSTALLER_DATE"

# Will be set to "true" if user wants fresh install
FRESH_INSTALL="false"

set -e

# =============================================================================
# CONFIGURATION
# =============================================================================
INSTALL_DIR="${INSTALL_DIR:-/opt/gumm}"
REPO_URL="${REPO_URL:-https://github.com/gumm-ai/gumm.git}"
BRANCH="${BRANCH:-main}"

# Will be prompted if not set
GUMM_ADMIN_PASSWORD="${GUMM_ADMIN_PASSWORD:-}"
GUMM_PORT="${GUMM_PORT:-3000}"
REDIS_PORT="${REDIS_PORT:-6379}"
TAILSCALE_AUTHKEY="${TAILSCALE_AUTHKEY:-}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

# Tailscale Funnel (set during config)
USE_TAILSCALE_FUNNEL="${USE_TAILSCALE_FUNNEL:-false}"
TAILSCALE_FUNNEL_DOMAIN=""

# =============================================================================
# LOAD MODULES
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source all lib scripts
if [[ -d "$SCRIPT_DIR/lib" ]]; then
    source "$SCRIPT_DIR/lib/utils.sh"
    source "$SCRIPT_DIR/lib/system.sh"
    source "$SCRIPT_DIR/lib/setup.sh"
    source "$SCRIPT_DIR/lib/install.sh"
    source "$SCRIPT_DIR/lib/config.sh"
    source "$SCRIPT_DIR/lib/network.sh"
    source "$SCRIPT_DIR/lib/docker.sh"
    source "$SCRIPT_DIR/lib/service.sh"
else
    echo -e "\033[0;31m[ERROR]\033[0m Library directory not found: $SCRIPT_DIR/lib"
    exit 1
fi

# =============================================================================
# UNINSTALL
# =============================================================================
uninstall() {
    # Delegate to the dedicated uninstall script
    if [[ -f "$SCRIPT_DIR/uninstall.sh" ]]; then
        exec bash "$SCRIPT_DIR/uninstall.sh" "$@"
    elif [[ -f "$INSTALL_DIR/scripts/uninstall.sh" ]]; then
        exec bash "$INSTALL_DIR/scripts/uninstall.sh" "$@"
    else
        log_error "Uninstall script not found"
        log_info "Download and run manually:"
        log_info "  curl -fsSL https://raw.githubusercontent.com/gumm-ai/gumm/main/scripts/uninstall.sh | sudo bash"
        exit 1
    fi
}

# =============================================================================
# MAIN INSTALLATION FLOW
# =============================================================================
main() {
    clear
    echo ""
    echo -e "${GREEN}${BOLD}"
    echo "  ┌────────────────────────────────────────────────────────────┐"
    echo "  │                                                            │"
    echo "  │        ██████╗ ██╗   ██╗███╗   ███╗███╗   ███╗             │"
    echo "  │       ██╔════╝ ██║   ██║████╗ ████║████╗ ████║             │"
    echo "  │       ██║  ███╗██║   ██║██╔████╔██║██╔████╔██║             │"
    echo "  │       ██║   ██║██║   ██║██║╚██╔╝██║██║╚██╔╝██║             │"
    echo "  │       ╚██████╔╝╚██████╔╝██║ ╚═╝ ██║██║ ╚═╝ ██║             │"
    echo "  │        ╚═════╝  ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚═╝             │"
    echo "  │                                                            │"
    echo "  │          VPS Installation Script v${INSTALLER_VERSION}                  │"
    echo "  │                                                            │"
    echo "  └────────────────────────────────────────────────────────────┘"
    echo -e "${NC}"
    echo ""

    preflight_checks
    detect_os
    install_dependencies
    install_go
    install_docker
    
    # Ask user for configuration FIRST (including VPN choice)
    # This way we know which VPN to install before installing any
    prompt_configuration
    
    # Install ONLY the chosen VPN (not both!)
    if [[ "$VPN_PROVIDER" == "tailscale" ]]; then
        install_tailscale
    elif [[ "$VPN_PROVIDER" == "netbird" ]]; then
        install_netbird
    fi
    
    ensure_tun_device
    configure_firewall

    # Determine install source
    # SCRIPT_DIR is already set globally for modules support, but we redefine PARENT_DIR from it
    PARENT_DIR="$(dirname "$SCRIPT_DIR")"

    if [[ -f "$PARENT_DIR/docker-compose.yml" ]] && [[ -f "$PARENT_DIR/Dockerfile" ]]; then
        log_info "Running from existing repository"
        INSTALL_DIR="$PARENT_DIR"
    else
        setup_repository
    fi

    cd "$INSTALL_DIR"

    create_env_file
    build_application
    
    # Start services WITHOUT Caddy first (domain not known yet)
    TEMP_CADDY_PROXY="$USE_CADDY_PROXY"
    USE_CADDY_PROXY="false"
    start_services
    USE_CADDY_PROXY="$TEMP_CADDY_PROXY"
    
    # Now connect VPN on host (so we can detect domain)
    configure_vpn_host
    
    # HTTPS setup: Tailscale Funnel (no Caddy needed) or Caddy reverse proxy
    if [[ "$USE_TAILSCALE_FUNNEL" == "true" ]]; then
        # Tailscale Funnel handles HTTPS natively — no Caddy required
        configure_tailscale_funnel
    else
        # Caddy reverse proxy path (NetBird or manual setup)
        configure_caddy_domain
        configure_caddy_ssl
        
        if [[ "$USE_CADDY_PROXY" == "true" ]] && [[ -n "$CADDY_DOMAIN" ]]; then
            log_info "Restarting with Caddy reverse proxy..."
            mkdir -p /var/lib/tailscale/certs
            docker compose --profile proxy up -d
        fi
    fi
    
    configure_vpn_container
    configure_telegram_container
    run_seed
    install_go
    install_cli
    create_systemd_service
    create_global_config
    print_summary
}

# =============================================================================
# ENTRY POINT
# =============================================================================
case "${1:-}" in
    --uninstall|-u)
        uninstall
        ;;
    --version|-v)
        echo "Gumm Installer v${INSTALLER_VERSION} (${INSTALLER_DATE})"
        exit 0
        ;;
    --help|-h)
        echo "Gumm — VPS Installation Script v${INSTALLER_VERSION}"
        echo ""
        echo "Usage: sudo $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h        Show this help"
        echo "  --version, -v     Show installer version"
        echo "  --uninstall, -u   Remove Gumm and all data"
        echo ""
        echo "Environment Variables (override prompts):"
        echo "  INSTALL_DIR           Installation directory (default: /opt/gumm)"
        echo "  GUMM_ADMIN_PASSWORD   Admin password (prompted if not set)"
        echo "  GUMM_PORT             Web UI port (default: 3000)"
        echo "  REDIS_PORT            Redis port (default: 6379)"
        echo "  VPN_PROVIDER          VPN provider: tailscale, netbird, or none"
        echo "  TAILSCALE_AUTHKEY     Tailscale auth key (optional)"
        echo "  NETBIRD_SETUP_KEY     NetBird setup key (optional)"
        echo "  TELEGRAM_BOT_TOKEN    Telegram bot token (optional)"
        echo "  TELEGRAM_CHAT_ID      Allowed Telegram chat ID (optional)"
        echo "  REPO_URL              Git repository URL"
        echo "  BRANCH                Git branch (default: main)"
        echo ""
        ;;
    *)
        main
        ;;
esac
