#!/bin/bash

# =============================================================================
# INSTALL SYSTEM DEPENDENCIES
# =============================================================================
install_dependencies() {
    log_step "Installing system dependencies..."

    $PKG_UPDATE

    case $OS in
        ubuntu|debian)
            $PKG_INSTALL curl wget git openssl ca-certificates gnupg lsb-release make
            ;;
        centos|rhel|fedora|rocky|almalinux)
            $PKG_INSTALL curl wget git openssl ca-certificates make
            ;;
        amzn)
            $PKG_INSTALL curl wget git openssl make
            ;;
    esac

    log_success "System dependencies installed"
}

# =============================================================================
# INSTALL DOCKER
# =============================================================================
install_docker() {
    log_step "Checking Docker installation..."

    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version | awk '{print $3}' | tr -d ',')
        log_info "Docker already installed: $DOCKER_VERSION"

        if docker compose version &> /dev/null; then
            log_info "Docker Compose (plugin) available"
            return 0
        elif command -v docker-compose &> /dev/null; then
            log_info "Docker Compose (standalone) available"
            return 0
        fi
    fi

    log_info "Installing Docker..."

    case $OS in
        ubuntu|debian)
            apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

            install -m 0755 -d /etc/apt/keyrings
            curl -fsSL "https://download.docker.com/linux/$OS/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            chmod a+r /etc/apt/keyrings/docker.gpg

            echo \
              "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS \
              $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
              tee /etc/apt/sources.list.d/docker.list > /dev/null

            apt-get update -qq
            apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;

        centos|rhel|rocky|almalinux)
            dnf remove -y docker docker-client docker-client-latest docker-common docker-latest \
                docker-latest-logrotate docker-logrotate docker-engine 2>/dev/null || true

            dnf install -y dnf-plugins-core
            dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
            dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;

        fedora)
            dnf remove -y docker docker-client docker-client-latest docker-common docker-latest \
                docker-latest-logrotate docker-logrotate docker-selinux docker-engine-selinux docker-engine 2>/dev/null || true

            dnf install -y dnf-plugins-core
            dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
            dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;

        amzn)
            yum remove -y docker docker-client docker-client-latest docker-common docker-latest \
                docker-latest-logrotate docker-logrotate docker-engine 2>/dev/null || true

            amazon-linux-extras install docker -y 2>/dev/null || yum install -y docker
            ;;
    esac

    systemctl start docker
    systemctl enable docker

    docker --version
    docker compose version 2>/dev/null || docker-compose --version

    log_success "Docker installed successfully"
}

# =============================================================================
# INSTALL TAILSCALE
# =============================================================================
install_tailscale() {
    log_step "Checking Tailscale installation..."

    if command -v tailscale &> /dev/null; then
        TS_VERSION=$(tailscale version 2>/dev/null | head -1)
        log_info "Tailscale already installed: $TS_VERSION"
        return 0
    fi

    log_info "Installing Tailscale..."

    # Tailscale is optional — don't abort the whole install if it fails
    if curl -fsSL https://tailscale.com/install.sh | sh; then
        systemctl enable tailscaled
        systemctl start tailscaled
        log_success "Tailscale installed"
    else
        log_warn "Tailscale installation failed (this is optional, continuing...)"
        log_info "You can install Tailscale manually later: https://tailscale.com/download"
        return 0
    fi
}

# =============================================================================
# INSTALL NETBIRD
# =============================================================================
install_netbird() {
    log_step "Installing NetBird..."

    # Check if NetBird is ACTUALLY installed and working
    # command -v can pass even if binary is broken/missing
    if command -v netbird &> /dev/null; then
        NB_VERSION=$(netbird version 2>/dev/null | head -1)
        # Verify the binary actually works (non-empty version output)
        if [[ -n "$NB_VERSION" ]] && [[ -x "$(command -v netbird)" ]]; then
            log_info "NetBird already installed: $NB_VERSION"
            return 0
        else
            log_warn "NetBird binary found but not working, reinstalling..."
            # Clean up broken installation
            apt-get remove -y netbird 2>/dev/null || true
            rm -f /usr/bin/netbird /usr/local/bin/netbird 2>/dev/null || true
            hash -r  # Clear shell command cache
        fi
    fi

    log_info "Downloading NetBird..."

    # Use the official install script
    if curl -fsSL https://pkgs.netbird.io/install.sh | sh; then
        hash -r  # Clear shell command cache
        # Verify installation actually works (not just in PATH)
        if netbird version &>/dev/null; then
            # DON'T start the service here - it needs config first
            # The service will be started after 'netbird up' in configure_vpn_host()
            systemctl stop netbird 2>/dev/null || true
            NB_VERSION=$(netbird version 2>/dev/null | head -1)
            log_success "NetBird installed: $NB_VERSION"
            return 0
        fi
    fi

    # Fallback: manual binary installation if official script failed
    log_warn "Official install script failed, trying manual installation..."
    
    ARCH=$(uname -m)
    case $ARCH in
        x86_64)  NB_ARCH="linux_amd64" ;;
        aarch64) NB_ARCH="linux_arm64" ;;
        armv7l)  NB_ARCH="linux_armv6" ;;
        *)       NB_ARCH="linux_amd64" ;;
    esac

    # Get latest release version
    NB_LATEST=$(curl -fsSL https://api.github.com/repos/netbirdio/netbird/releases/latest | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/')
    if [[ -z "$NB_LATEST" ]]; then
        NB_LATEST="0.66.2"  # Fallback version
    fi

    log_info "Downloading NetBird v$NB_LATEST for $NB_ARCH..."
    
    cd /tmp
    if curl -fsSL "https://github.com/netbirdio/netbird/releases/download/v${NB_LATEST}/netbird_${NB_LATEST}_${NB_ARCH}.tar.gz" -o netbird.tar.gz; then
        tar -xzf netbird.tar.gz
        mv netbird /usr/local/bin/netbird
        chmod +x /usr/local/bin/netbird
        # Also create symlink in /usr/bin for compatibility (some systems expect it there)
        ln -sf /usr/local/bin/netbird /usr/bin/netbird
        rm -f netbird.tar.gz
        hash -r  # Clear shell command cache
        
        # Create systemd service (but don't start it yet)
        cat > /etc/systemd/system/netbird.service << 'EOF'
[Unit]
Description=NetBird Service
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/netbird service run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

        systemctl daemon-reload
        # DON'T enable/start here - wait for configure_vpn_host()
        
        # Verify installation actually works
        if /usr/local/bin/netbird version &>/dev/null; then
            NB_VERSION=$(/usr/local/bin/netbird version 2>/dev/null | head -1)
            log_success "NetBird installed manually: $NB_VERSION"
            return 0
        fi
    fi

    log_warn "NetBird installation failed. You can install it manually later:"
    log_info "  curl -fsSL https://pkgs.netbird.io/install.sh | sh"
    return 0
}

# =============================================================================
# INSTALL GO
# =============================================================================
install_go() {
    log_step "Checking Go installation..."

    if command -v go &> /dev/null; then
        GO_VERSION=$(go version | awk '{print $3}')
        log_info "Go already installed: $GO_VERSION"
        return 0
    fi

    log_info "Installing Go..."

    # Prefer the official tarball for a recent version (package managers often ship old Go)
    local go_version="1.23.6"
    local arch
    case "$(uname -m)" in
        x86_64|amd64)  arch="amd64" ;;
        aarch64|arm64) arch="arm64" ;;
        *)             arch="amd64" ;;
    esac

    local tarball="go${go_version}.linux-${arch}.tar.gz"
    local url="https://go.dev/dl/${tarball}"

    log_info "Downloading Go ${go_version} (${arch})..."
    curl -fsSL -o "/tmp/${tarball}" "$url"
    rm -rf /usr/local/go
    tar -C /usr/local -xzf "/tmp/${tarball}"
    rm -f "/tmp/${tarball}"

    # Make Go available system-wide
    if ! grep -q '/usr/local/go/bin' /etc/profile.d/go.sh 2>/dev/null; then
        echo 'export PATH=$PATH:/usr/local/go/bin' > /etc/profile.d/go.sh
        chmod +x /etc/profile.d/go.sh
    fi
    export PATH=$PATH:/usr/local/go/bin

    if command -v go &> /dev/null; then
        log_success "Go installed: $(go version | awk '{print $3}')"
    else
        log_warn "Go installation failed. CLI will not be built."
    fi
}

# =============================================================================
# INSTALL GUMM CLI
# =============================================================================
install_cli() {
    log_step "Installing Gumm CLI..."

    # Detect platform
    local os arch
    case "$(uname -s)" in
        Linux*)  os="linux" ;;
        Darwin*) os="darwin" ;;
        *)       log_warn "Unsupported OS for CLI: $(uname -s)"; return 0 ;;
    esac
    case "$(uname -m)" in
        x86_64|amd64)  arch="amd64" ;;
        aarch64|arm64) arch="arm64" ;;
        *)             log_warn "Unsupported arch for CLI: $(uname -m)"; return 0 ;;
    esac

    local platform="${os}-${arch}"
    local repo_path
    repo_path=$(echo "$REPO_URL" | sed 's|https://github.com/||;s|\.git$||')

    # Strategy 1: Download pre-built binary from GitHub releases
    local version
    version=$(curl -fsSL "https://api.github.com/repos/${repo_path}/releases/latest" 2>/dev/null \
        | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//' || echo "")

    if [[ -n "$version" ]]; then
        local asset="gumm-${platform}"
        local url="https://github.com/${repo_path}/releases/download/${version}/${asset}"
        log_info "Downloading CLI ${version} (${platform})..."

        local tmp
        tmp=$(mktemp)
        if curl -fsSL -o "$tmp" "$url" 2>/dev/null; then
            chmod +x "$tmp"
            mv "$tmp" "/usr/local/bin/gumm"
            log_success "CLI ${version} installed to /usr/local/bin/gumm"

            if command -v gumm &>/dev/null; then
                log_success "CLI ready: $(gumm --version 2>/dev/null || echo 'installed')"
            fi
            return 0
        fi
        rm -f "$tmp"
        log_info "No pre-built binary for ${platform}, falling back to source build..."
    fi

    # Strategy 2: Build from source using Make
    if [[ ! -d "$INSTALL_DIR/cli" ]]; then
        log_warn "CLI source not found. Install later with:"
        log_warn "  curl -fsSL https://raw.githubusercontent.com/${repo_path}/main/scripts/install.sh | bash"
        return 0
    fi

    if ! command -v go &>/dev/null; then
        log_warn "Go is not available. CLI not built."
        log_warn "  Install Go and run: cd ${INSTALL_DIR} && make build && make install"
        return 0
    fi

    log_info "Building CLI from source (make build)..."
    cd "$INSTALL_DIR"

    if command -v make &>/dev/null; then
        make build
        # Install to /usr/local/bin (more reliable on servers than GOPATH)
        cp bin/gumm /usr/local/bin/gumm
        chmod +x /usr/local/bin/gumm
        log_success "CLI built and installed to /usr/local/bin/gumm"
    else
        # Fallback without make
        cd "$INSTALL_DIR/cli"
        go build -ldflags "-s -w" -o /usr/local/bin/gumm .
        cd "$INSTALL_DIR"
        log_success "CLI built and installed to /usr/local/bin/gumm"
    fi

    if command -v gumm &>/dev/null; then
        log_success "CLI ready: $(gumm --version 2>/dev/null || echo 'installed')"
    fi
}
