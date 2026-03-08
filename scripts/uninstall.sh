#!/bin/bash
# =============================================================================
# Gumm — Uninstall Script
# =============================================================================
# Completely removes Gumm and all associated data.
#
# Usage:
#   sudo bash scripts/uninstall.sh
# =============================================================================

set -e

# =============================================================================
# COLORS AND HELPERS
# =============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()    { echo -e "\n${CYAN}${BOLD}==> $1${NC}"; }

# =============================================================================
# CHECK PERMISSIONS
# =============================================================================
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root (sudo)"
    exit 1
fi

# =============================================================================
# LOAD CONFIGURATION
# =============================================================================
CONFIG_FILE="/etc/gumm/config"

if [[ -f "$CONFIG_FILE" ]]; then
    source "$CONFIG_FILE"
fi

# Fallback to default if not found
INSTALL_DIR="${INSTALL_DIR:-/opt/gumm}"

# =============================================================================
# MAIN UNINSTALL
# =============================================================================
main() {
    echo ""
    echo -e "${RED}${BOLD}"
    echo "  ╔════════════════════════════════════════════════════════════════╗"
    echo "  ║                                                                ║"
    echo "  ║                    ⚠️  GUMM UNINSTALLER  ⚠️                     ║"
    echo "  ║                                                                ║"
    echo "  ╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo -e "${RED}${BOLD}WARNING: This will permanently delete:${NC}"
    echo ""
    echo -e "  ${RED}•${NC} All conversations and chat history"
    echo -e "  ${RED}•${NC} All memories and personal facts"
    echo -e "  ${RED}•${NC} All installed modules"
    echo -e "  ${RED}•${NC} All configuration and secrets"
    echo -e "  ${RED}•${NC} The SQLite database"
    echo -e "  ${RED}•${NC} Docker containers and images"
    echo -e "  ${RED}•${NC} Systemd service"
    echo -e "  ${RED}•${NC} CLI binary"
    echo ""
    echo -e "${YELLOW}Installation directory: ${BOLD}${INSTALL_DIR}${NC}"
    echo ""
    echo -e "${RED}${BOLD}THIS ACTION CANNOT BE UNDONE!${NC}"
    echo ""

    # First confirmation
    read -p "Are you sure you want to uninstall Gumm? (yes/no): " CONFIRM1 </dev/tty
    if [[ "$CONFIRM1" != "yes" ]]; then
        log_info "Uninstall cancelled"
        exit 0
    fi

    echo ""
    echo -e "${YELLOW}To confirm, please type: ${BOLD}DELETE EVERYTHING${NC}"
    read -p "> " CONFIRM2 </dev/tty

    if [[ "$CONFIRM2" != "DELETE EVERYTHING" ]]; then
        log_info "Uninstall cancelled (confirmation text did not match)"
        exit 0
    fi

    echo ""
    log_step "Starting uninstallation..."

    # ── Stop and remove Docker containers ────────────────────────────
    log_step "Stopping Docker containers..."
    if [[ -d "$INSTALL_DIR" ]]; then
        cd "$INSTALL_DIR"
        docker compose down -v 2>/dev/null || true
        log_success "Containers stopped and volumes removed"
    fi

    # ── Remove Docker images ─────────────────────────────────────────
    log_step "Removing Docker images..."
    docker rmi gumm:latest 2>/dev/null || true
    docker rmi $(docker images -q --filter "reference=gumm*") 2>/dev/null || true
    log_success "Docker images removed"

    # ── Remove systemd service ───────────────────────────────────────
    log_step "Removing systemd service..."
    systemctl stop gumm 2>/dev/null || true
    systemctl disable gumm 2>/dev/null || true
    rm -f /etc/systemd/system/gumm.service
    systemctl daemon-reload
    log_success "Systemd service removed"

    # ── Remove CLI binary ────────────────────────────────────────────
    log_step "Removing CLI..."
    rm -f /usr/local/bin/gumm
    log_success "CLI removed"

    # ── Remove global config ─────────────────────────────────────────
    log_step "Removing global configuration..."
    rm -rf /etc/gumm
    log_success "Global config removed"

    # ── Remove installation directory ────────────────────────────────
    log_step "Removing installation directory..."
    if [[ -d "$INSTALL_DIR" ]]; then
        rm -rf "$INSTALL_DIR"
        log_success "Installation directory removed: $INSTALL_DIR"
    else
        log_info "Installation directory not found (already removed?)"
    fi

    # ── Disconnect Tailscale (if configured on host) ─────────────────
    if command -v tailscale &>/dev/null; then
        log_step "Checking Tailscale..."
        if tailscale status &>/dev/null; then
            read -p "Disconnect Tailscale on this host? (y/N): " DISCONNECT_TS </dev/tty
            if [[ "$DISCONNECT_TS" =~ ^[Yy]$ ]]; then
                tailscale logout 2>/dev/null || true
                log_success "Tailscale disconnected"
            else
                log_info "Tailscale left connected"
            fi
        fi
    fi

    # ── Done ─────────────────────────────────────────────────────────
    echo ""
    echo -e "${GREEN}${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║              Gumm has been completely uninstalled              ║${NC}"
    echo -e "${GREEN}${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "All data has been permanently deleted."
    echo ""
    echo -e "To reinstall Gumm in the future, run:"
    echo -e "  ${CYAN}curl -fsSL https://raw.githubusercontent.com/gumm-ai/gumm/main/scripts/setup-server.sh | sudo bash${NC}"
    echo ""
}

# =============================================================================
# ENTRY POINT
# =============================================================================
case "${1:-}" in
    --help|-h)
        echo "Gumm — Uninstall Script"
        echo ""
        echo "Usage: sudo $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h    Show this help"
        echo "  --force, -f   Skip confirmation prompts (DANGEROUS)"
        echo ""
        ;;
    --force|-f)
        log_warn "Force mode enabled — skipping confirmations"
        CONFIRM1="yes"
        CONFIRM2="DELETE EVERYTHING"
        main
        ;;
    *)
        main
        ;;
esac
