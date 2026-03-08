#!/bin/bash
# =============================================================================
# Gumm — Update Script
# =============================================================================
# Updates Gumm to the latest version using the saved configuration.
#
# Usage:
#   sudo bash scripts/update.sh
#   # or if installed globally:
#   sudo gumm-update
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
# LOAD CONFIGURATION
# =============================================================================
CONFIG_FILE="/etc/gumm/config"

if [[ ! -f "$CONFIG_FILE" ]]; then
    log_error "Configuration file not found: $CONFIG_FILE"
    log_error "Gumm doesn't appear to be installed via setup-server.sh"
    log_info "If you installed manually, set INSTALL_DIR and run:"
    log_info "  cd \$INSTALL_DIR && git pull && docker compose build && docker compose up -d"
    exit 1
fi

# Source the config file
source "$CONFIG_FILE"

if [[ -z "$INSTALL_DIR" ]]; then
    log_error "INSTALL_DIR not set in config file"
    exit 1
fi

if [[ ! -d "$INSTALL_DIR" ]]; then
    log_error "Installation directory not found: $INSTALL_DIR"
    exit 1
fi

# =============================================================================
# CHECK PERMISSIONS
# =============================================================================
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root (sudo)"
    exit 1
fi

# =============================================================================
# ENSURE GO IS INSTALLED (for CLI builds)
# =============================================================================
ensure_go() {
    # Check if Go is in PATH
    if command -v go &>/dev/null; then
        return 0
    fi

    # Check if installed but not in PATH
    if [[ -x /usr/local/go/bin/go ]]; then
        export PATH=$PATH:/usr/local/go/bin
        return 0
    fi

    # Only install on Linux
    if [[ "$(uname -s)" != "Linux" ]]; then
        return 1
    fi

    log_step "Installing Go (required for CLI)..."

    GO_VERSION="1.23.6"
    ARCH=$(uname -m)
    case $ARCH in
        x86_64)  GO_ARCH="amd64" ;;
        aarch64) GO_ARCH="arm64" ;;
        armv7l)  GO_ARCH="armv6l" ;;
        *)       GO_ARCH="amd64" ;;
    esac

    cd /tmp
    if ! curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz" -o go.tar.gz; then
        log_warn "Failed to download Go"
        return 1
    fi

    rm -rf /usr/local/go
    tar -C /usr/local -xzf go.tar.gz
    rm go.tar.gz

    export PATH=$PATH:/usr/local/go/bin
    if ! grep -q '/usr/local/go/bin' /etc/profile; then
        echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile
    fi

    if command -v go &>/dev/null; then
        log_success "Go installed: $(go version | awk '{print $3}')"
        return 0
    fi

    return 1
}

# =============================================================================
# MAIN UPDATE PROCESS
# =============================================================================
main() {
    echo ""
    echo -e "${CYAN}${BOLD}"
    echo "  ┌────────────────────────────────────────────────────────────┐"
    echo "  │                  Gumm Update Script                        │"
    echo "  └────────────────────────────────────────────────────────────┘"
    echo -e "${NC}"
    echo ""

    log_info "Installation directory: $INSTALL_DIR"
    log_info "Repository: ${REPO_URL:-unknown}"
    log_info "Branch: ${BRANCH:-main}"
    echo ""

    cd "$INSTALL_DIR"

    # Get current version (if available)
    CURRENT_VERSION=""
    if [[ -f "package.json" ]]; then
        CURRENT_VERSION=$(grep -o '"version": *"[^"]*"' package.json | head -1 | sed 's/"version": *"//;s/"//')
    fi

    log_step "Pulling latest changes..."

    # Stash any local changes
    if ! git diff --quiet 2>/dev/null; then
        log_warn "Local changes detected, stashing them..."
        git stash
    fi

    # Pull latest
    BRANCH="${BRANCH:-main}"
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"

    # Get new version
    NEW_VERSION=""
    if [[ -f "package.json" ]]; then
        NEW_VERSION=$(grep -o '"version": *"[^"]*"' package.json | head -1 | sed 's/"version": *"//;s/"//')
    fi

    if [[ -n "$CURRENT_VERSION" ]] && [[ -n "$NEW_VERSION" ]]; then
        if [[ "$CURRENT_VERSION" == "$NEW_VERSION" ]]; then
            log_info "Already on latest version: $NEW_VERSION"
        else
            log_success "Updated from $CURRENT_VERSION to $NEW_VERSION"
        fi
    fi

    log_step "Rebuilding Docker image..."
    docker compose build

    log_step "Restarting services..."
    docker compose down
    docker compose up -d

    # Wait for services to be healthy
    log_info "Waiting for services to become healthy..."
    for i in $(seq 1 30); do
        if curl -sf "http://localhost:${GUMM_PORT:-3000}/api/setup/status" &>/dev/null; then
            break
        fi
        sleep 2
    done

    # Update CLI - ensure Go is installed, then build
    if [[ -d "$INSTALL_DIR/cli" ]]; then
        log_step "Updating CLI..."
        cd "$INSTALL_DIR"

        # Ensure Go is available (install if needed)
        if ensure_go; then
            # Build with Go
            cd "$INSTALL_DIR/cli"
            if go build -ldflags "-s -w" -o /usr/local/bin/gumm . 2>/dev/null; then
                log_success "CLI updated (Go)"
            else
                log_warn "CLI build failed"
            fi
            cd "$INSTALL_DIR"
        elif command -v docker &>/dev/null; then
            # Fallback: Build with Docker
            docker run --rm -v "$INSTALL_DIR":/app -w /app/cli golang:1.23-alpine \
                go build -ldflags "-s -w" -o ../bin/gumm . 2>/dev/null
            if [[ -f "$INSTALL_DIR/bin/gumm" ]]; then
                cp "$INSTALL_DIR/bin/gumm" /usr/local/bin/gumm
                log_success "CLI updated (Docker)"
            fi
        else
            log_warn "Neither Go nor Docker available - CLI not updated"
        fi
    fi

    echo ""
    echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║                    Update Complete!                              ║${NC}"
    echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Show service status
    docker compose ps

    echo ""
    log_success "Gumm is now up to date!"
}

# =============================================================================
# ENTRY POINT
# =============================================================================
case "${1:-}" in
    --help|-h)
        echo "Gumm — Update Script"
        echo ""
        echo "Usage: sudo $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h    Show this help"
        echo "  --status      Show current installation status"
        echo ""
        echo "Configuration is loaded from: $CONFIG_FILE"
        echo ""
        ;;
    --status)
        echo "Gumm Installation Status"
        echo "========================"
        echo ""
        echo "Config file: $CONFIG_FILE"
        echo ""
        if [[ -f "$CONFIG_FILE" ]]; then
            cat "$CONFIG_FILE"
        fi
        echo ""
        if [[ -n "$INSTALL_DIR" ]] && [[ -d "$INSTALL_DIR" ]]; then
            echo "Docker status:"
            cd "$INSTALL_DIR"
            docker compose ps 2>/dev/null || echo "  (not running)"
        fi
        ;;
    *)
        main
        ;;
esac
