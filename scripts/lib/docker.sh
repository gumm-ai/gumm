#!/bin/bash

# =============================================================================
# BUILD DOCKER IMAGE
# =============================================================================
build_application() {
    log_step "Building Gumm Docker image..."

    cd "$INSTALL_DIR"

    docker compose build --no-cache

    log_success "Docker image built"
}

# =============================================================================
# START SERVICES
# =============================================================================
start_services() {
    log_step "Starting Gumm services..."

    cd "$INSTALL_DIR"

    # Check for existing volumes
    if docker volume ls -q | grep -q "gumm_gumm-data"; then
        echo ""
        log_warn "Existing Gumm data volume detected."
        echo -e "  ${BOLD}1)${NC} Keep existing data (upgrade / redeploy)"
        echo -e "  ${BOLD}2)${NC} Delete volumes and start fresh"
        echo ""
        read -p "Choose option [1]: " VOLUME_CHOICE </dev/tty
        VOLUME_CHOICE="${VOLUME_CHOICE:-1}"

        if [[ "$VOLUME_CHOICE" == "2" ]]; then
            log_info "Removing existing volumes..."
            docker compose down -v 2>/dev/null || true
            log_success "Volumes removed"
        fi
    fi

    log_info "Starting containers..."
    if [[ "$USE_CADDY_PROXY" == "true" ]]; then
        log_info "Starting with Caddy reverse proxy..."
        # Ensure certs directory exists (required for volume mount)
        mkdir -p /var/lib/tailscale/certs
        docker compose --profile proxy up -d
    else
        docker compose up -d
    fi

    # Wait for services
    log_info "Waiting for services to become healthy..."
    for i in $(seq 1 30); do
        if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
            break
        fi
        sleep 2
    done

    # Wait for Gumm to respond
    for i in $(seq 1 30); do
        if curl -sf "http://localhost:${GUMM_PORT}/api/setup/status" &>/dev/null; then
            log_success "Gumm is responding"
            break
        fi
        sleep 2
    done

    docker compose ps

    log_success "Services started"
}

# =============================================================================
# RUN DATABASE SEED
# =============================================================================
run_seed() {
    log_step "Seeding database..."

    cd "$INSTALL_DIR"

    # The database is SQLite and gets created automatically on first run.
    # Migrations are applied by Drizzle at build time.
    # The seed script registers the hello-world module.
    if [[ -f "$INSTALL_DIR/modules/user/hello-world/manifest.json" ]]; then
        log_info "Running database seed..."
        docker compose exec -T gumm sh -c "cd /app && bun run scripts/seed.ts" 2>/dev/null && \
            log_success "Seed completed" || \
            log_warn "Seed skipped (will be handled on first launch)"
    else
        log_info "No hello-world module found, skipping seed"
    fi
}
