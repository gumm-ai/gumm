#!/bin/bash

# =============================================================================
# PREFLIGHT CHECKS
# =============================================================================
preflight_checks() {
    log_step "Running preflight checks..."

    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (sudo)"
        exit 1
    fi

    # Check for existing installation and compare versions
    if [[ -f /etc/gumm/config ]]; then
        # Source config to get existing version (will overwrite INSTALLER_VERSION)
        source /etc/gumm/config
        EXISTING_VERSION="${INSTALLER_VERSION:-unknown}"
        # Restore current script version after sourcing
        INSTALLER_VERSION="$CURRENT_INSTALLER_VERSION"
        INSTALLER_DATE="$CURRENT_INSTALLER_DATE"
        
        if [[ "$EXISTING_VERSION" != "unknown" ]]; then
            log_info "Existing installation detected: v${EXISTING_VERSION}"
            if [[ "$EXISTING_VERSION" == "$CURRENT_INSTALLER_VERSION" ]]; then
                log_info "Already at latest installer version (v${CURRENT_INSTALLER_VERSION})"
            else
                log_warn "Installer version changed: v${EXISTING_VERSION} → v${CURRENT_INSTALLER_VERSION}"
            fi
            echo ""
            echo -e "  ${BOLD}1)${NC} Upgrade/reinstall (keeps data)"
            echo -e "  ${BOLD}2)${NC} Fresh install (deletes all data)"
            echo -e "  ${BOLD}3)${NC} Cancel"
            echo ""
            read -p "Choose option [1]: " INSTALL_CHOICE </dev/tty
            INSTALL_CHOICE="${INSTALL_CHOICE:-1}"
            
            case "$INSTALL_CHOICE" in
                1) log_info "Proceeding with upgrade..." ;;
                2) 
                    log_warn "This will delete ALL existing Gumm data!"
                    read -p "Are you sure? (yes/N): " CONFIRM </dev/tty
                    if [[ "$CONFIRM" != "yes" ]]; then
                        log_info "Cancelled"
                        exit 0
                    fi
                    FRESH_INSTALL="true"
                    ;;
                *) log_info "Cancelled"; exit 0 ;;
            esac
        fi
    fi

    # Check minimum RAM (1GB recommended)
    TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
    if [[ $TOTAL_RAM -lt 900 ]]; then
        log_warn "System has less than 1GB RAM. Gumm may run slowly."
        read -p "Continue anyway? (y/N): " CONTINUE </dev/tty
        if [[ ! $CONTINUE =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    # Check available disk space (5GB minimum)
    AVAILABLE_DISK=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')
    if [[ $AVAILABLE_DISK -lt 5 ]]; then
        log_warn "Less than 5GB disk space available."
        read -p "Continue anyway? (y/N): " CONTINUE </dev/tty
        if [[ ! $CONTINUE =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    log_success "Preflight checks passed (RAM: ${TOTAL_RAM}MB, Disk: ${AVAILABLE_DISK}GB free)"
}

# =============================================================================
# DETECT OS
# =============================================================================
detect_os() {
    log_step "Detecting operating system..."

    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    elif [[ -f /etc/redhat-release ]]; then
        OS="centos"
        VERSION=$(grep -oE '[0-9]+' /etc/redhat-release | head -1)
    else
        log_error "Unable to detect operating system"
        exit 1
    fi

    log_info "Detected: $OS $VERSION"

    case $OS in
        ubuntu|debian)
            PKG_MANAGER="apt-get"
            PKG_UPDATE="apt-get update -qq"
            PKG_INSTALL="apt-get install -y -qq"
            ;;
        centos|rhel|fedora|rocky|almalinux)
            PKG_MANAGER="dnf"
            PKG_UPDATE="dnf check-update || true"
            PKG_INSTALL="dnf install -y -q"
            ;;
        amzn)
            PKG_MANAGER="yum"
            PKG_UPDATE="yum check-update || true"
            PKG_INSTALL="yum install -y -q"
            ;;
        *)
            log_error "Unsupported operating system: $OS"
            exit 1
            ;;
    esac

    log_success "Package manager: $PKG_MANAGER"
}

# =============================================================================
# ENABLE TUN DEVICE (Required for Tailscale in Docker)
# =============================================================================
ensure_tun_device() {
    log_step "Ensuring TUN device is available..."

    if [[ ! -c /dev/net/tun ]]; then
        log_info "Creating /dev/net/tun..."
        mkdir -p /dev/net
        mknod /dev/net/tun c 10 200
        chmod 666 /dev/net/tun
        log_success "TUN device created"
    else
        log_success "TUN device already exists"
    fi

    # Persist across reboots
    if ! grep -q '/dev/net/tun' /etc/modules-load.d/tun.conf 2>/dev/null; then
        echo "tun" > /etc/modules-load.d/tun.conf
        log_info "TUN module will load on boot"
    fi
}
