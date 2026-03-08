#!/bin/bash

# =============================================================================
# CREATE SYSTEMD SERVICE
# =============================================================================
create_systemd_service() {
    log_step "Creating systemd service..."

    # Build docker compose args based on whether Caddy proxy is enabled
    COMPOSE_PROFILE=""
    if [[ "$USE_CADDY_PROXY" == "true" ]]; then
        COMPOSE_PROFILE="--profile proxy"
    fi

    cat > /etc/systemd/system/gumm.service << EOF
[Unit]
Description=Gumm — Personal AI Assistant
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$INSTALL_DIR
ExecStart=/bin/bash -c 'docker compose ${COMPOSE_PROFILE} up -d'
ExecStop=/bin/bash -c 'docker compose ${COMPOSE_PROFILE} down'
ExecReload=/bin/bash -c 'docker compose ${COMPOSE_PROFILE} restart'
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable gumm.service

    log_success "Systemd service created and enabled (auto-starts on boot)"
}

# =============================================================================
# PRINT SUMMARY
# =============================================================================
print_summary() {
    # Detect server IP
    SERVER_IP=$(curl -sf https://ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "<your-server-ip>")

    TAILSCALE_DNS=""
    NETBIRD_IP=""
    if command -v tailscale &> /dev/null && tailscale status &>/dev/null; then
        TAILSCALE_DNS=$(tailscale status --json 2>/dev/null | grep -o '"DNSName":"[^"]*"' | head -1 | sed 's/"DNSName":"//;s/"$//' | sed 's/\.$//')
    fi
    # If Tailscale Funnel was enabled but domain detection failed, use TAILSCALE_DNS
    if [[ "$USE_TAILSCALE_FUNNEL" == "true" ]] && [[ -z "$TAILSCALE_FUNNEL_DOMAIN" ]] && [[ -n "$TAILSCALE_DNS" ]]; then
        TAILSCALE_FUNNEL_DOMAIN="$TAILSCALE_DNS"
    fi
    if command -v netbird &> /dev/null && netbird status 2>/dev/null | grep -q "Connected"; then
        NETBIRD_IP=$(netbird status 2>/dev/null | grep -oP 'IP:\s*\K[0-9.]+' | head -1)
    fi

    echo ""
    echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║               Gumm Installation Complete!                      ║${NC}"
    echo -e "${GREEN}${BOLD}║               Installer v${INSTALLER_VERSION}                                    ║${NC}"
    echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BOLD}Access:${NC}"
    if [[ "$USE_TAILSCALE_FUNNEL" == "true" ]] && [[ -n "$TAILSCALE_FUNNEL_DOMAIN" ]]; then
        echo -e "  Dashboard:    ${GREEN}${BOLD}https://${TAILSCALE_FUNNEL_DOMAIN}${NC}  ${DIM}(via Tailscale Funnel)${NC}"
        echo -e "  ${DIM}Direct:       http://${SERVER_IP}:${GUMM_PORT}${NC}"
    elif [[ "$USE_CADDY_PROXY" == "true" ]] && [[ -n "$CADDY_DOMAIN" ]]; then
        echo -e "  Dashboard:    ${GREEN}${BOLD}https://${CADDY_DOMAIN}${NC}  ${DIM}(via Caddy)${NC}"
        echo -e "  ${DIM}Direct:       http://${SERVER_IP}:${GUMM_PORT}${NC}"
    else
        if [[ -n "$TAILSCALE_DNS" ]]; then
            echo -e "  Dashboard:    ${GREEN}${BOLD}https://${TAILSCALE_DNS}${NC}  ${DIM}(via Tailscale)${NC}"
            echo -e "  ${DIM}Direct:       http://${SERVER_IP}:${GUMM_PORT}${NC}"
        elif [[ -n "$NETBIRD_IP" ]]; then
            echo -e "  Dashboard:    ${CYAN}http://${NETBIRD_IP}:${GUMM_PORT}${NC}  ${DIM}(via NetBird)${NC}"
            echo -e "  ${DIM}Direct:       http://${SERVER_IP}:${GUMM_PORT}${NC}"
        else
            echo -e "  Dashboard:    ${CYAN}http://${SERVER_IP}:${GUMM_PORT}${NC}"
        fi
    fi
    echo ""
    echo -e "${BOLD}First Steps:${NC}"
    echo -e "  1. Open the dashboard URL above"
    echo -e "  2. Complete the ${CYAN}Setup Wizard${NC} at ${CYAN}/setup${NC}"
    echo -e "     → Set your assistant name & personality"
    echo -e "     → Paste your OpenRouter API key"
    echo -e "     → Configure Telegram (optional)"
    echo -e "  3. Start chatting!"
    echo ""
    echo -e "${BOLD}Connect the CLI:${NC}"
    if command -v gumm &>/dev/null; then
        echo -e "  ${GREEN}✓ CLI is installed${NC}"
    else
        echo -e "  ${YELLOW}Install CLI first:${NC}"
        echo -e "  ${CYAN}curl -fsSL https://raw.githubusercontent.com/gumm-ai/gumm/main/scripts/install.sh | bash${NC}"
    fi
    if [[ "$USE_TAILSCALE_FUNNEL" == "true" ]] && [[ -n "$TAILSCALE_FUNNEL_DOMAIN" ]]; then
        echo -e "  ${CYAN}gumm connect https://${TAILSCALE_FUNNEL_DOMAIN}${NC}"
    elif [[ "$USE_CADDY_PROXY" == "true" ]] && [[ -n "$CADDY_DOMAIN" ]]; then
        echo -e "  ${CYAN}gumm connect https://${CADDY_DOMAIN}${NC}"
    elif [[ -n "$TAILSCALE_DNS" ]]; then
        echo -e "  ${CYAN}gumm connect https://${TAILSCALE_DNS}${NC}"
    else
        echo -e "  ${CYAN}gumm connect http://${SERVER_IP}:${GUMM_PORT}${NC}"
    fi
    echo -e "  ${CYAN}gumm login${NC}"
    echo -e "  ${CYAN}gumm chat \"Hello!\"${NC}"
    echo ""
    echo -e "${BOLD}Important Files:${NC}"
    echo -e "  Installation:  ${CYAN}${INSTALL_DIR}${NC}"
    echo -e "  Environment:   ${CYAN}${INSTALL_DIR}/.env${NC}"
    echo -e "  Global config: ${CYAN}/etc/gumm/config${NC}"
    echo -e "  Brain config:  ${CYAN}${INSTALL_DIR}/brain/${NC}"
    echo -e "  User modules:  ${CYAN}${INSTALL_DIR}/modules/user/${NC}"
    echo ""
    echo -e "${BOLD}Useful Commands:${NC}"
    echo -e "  View logs:       ${CYAN}cd ${INSTALL_DIR} && docker compose logs -f${NC}"
    echo -e "  Restart:         ${CYAN}systemctl restart gumm${NC}"
    echo -e "  Stop:            ${CYAN}systemctl stop gumm${NC}"
    echo -e "  Update:          ${CYAN}sudo bash ${INSTALL_DIR}/scripts/update.sh${NC}"
    echo -e "  Uninstall:       ${CYAN}sudo bash ${INSTALL_DIR}/scripts/uninstall.sh${NC}"
    echo -e "  Service status:  ${CYAN}docker compose -f ${INSTALL_DIR}/docker-compose.yml ps${NC}"
    echo ""
    echo -e "${YELLOW}${BOLD}Security Notes:${NC}"
    echo -e "  - The .env file contains your admin password and session secret"
    if [[ "$USE_TAILSCALE_FUNNEL" == "true" ]] && [[ -n "$TAILSCALE_FUNNEL_DOMAIN" ]]; then
        echo -e "  - ${GREEN}✓ Tailscale Funnel is active with HTTPS${NC}"
        echo -e "  - Traffic is routed through Tailscale's edge network"
    elif [[ "$USE_CADDY_PROXY" == "true" ]] && [[ -n "$CADDY_DOMAIN" ]]; then
        echo -e "  - ${GREEN}✓ Caddy reverse proxy is enabled with HTTPS${NC}"
        echo -e "  - VPN Guard will verify your VPN IP for secure access"
    else
        echo -e "  - Consider placing Gumm behind a reverse proxy (Caddy/Nginx) with HTTPS"
        echo -e "  - Or use Tailscale/NetBird for secure private access without exposing ports"
    fi
    echo ""
}
