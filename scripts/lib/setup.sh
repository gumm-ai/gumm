#!/bin/bash

# =============================================================================
# CLONE OR UPDATE REPOSITORY
# =============================================================================
setup_repository() {
    log_step "Setting up Gumm repository..."

    # Configure git to use gh CLI for authentication if available
    if command -v gh &>/dev/null && gh auth status &>/dev/null; then
        log_info "Configuring Git to use GitHub CLI for authentication..."
        gh auth setup-git
    fi

    if [[ -d "$INSTALL_DIR/.git" ]]; then
        log_info "Repository exists. Pulling latest..."
        cd "$INSTALL_DIR"
        git fetch origin
        git checkout "$BRANCH"
        git pull origin "$BRANCH"
    elif [[ -d "$INSTALL_DIR" ]] && [[ -f "$INSTALL_DIR/docker-compose.yml" ]]; then
        log_info "Installation directory already contains Gumm"
        cd "$INSTALL_DIR"
    else
        log_info "Cloning repository..."
        mkdir -p "$(dirname "$INSTALL_DIR")"
        # For private repos, use gh CLI if available for auth
        if command -v gh &>/dev/null && gh auth status &>/dev/null; then
            gh repo clone "$REPO_URL" "$INSTALL_DIR" -- --branch "$BRANCH"
        else
            git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
        fi
        cd "$INSTALL_DIR"
    fi

    # Ensure module directories exist
    mkdir -p "$INSTALL_DIR/modules/user"
    mkdir -p "$INSTALL_DIR/brain"

    log_success "Repository ready at $INSTALL_DIR"
}
