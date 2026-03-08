package cmd

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/gumm-ai/gumm/cli/internal/auth"
	"github.com/gumm-ai/gumm/cli/internal/config"
)

var (
	ssoFlag      bool
	passwordFlag bool
)

var connectCmd = &cobra.Command{
	Use:   "connect <url>",
	Short: "Connect to a remote Gumm instance",
	Long: `Connect to a remote Gumm instance.

Use --password flag when connecting through a reverse proxy with password authentication
(e.g., Netbird with password auth enabled).

Use --sso flag when connecting through a reverse proxy that requires SSO authentication
(e.g., Netbird with SSO, Cloudflare Access, etc.).`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		rawURL := args[0]
		if !strings.HasPrefix(rawURL, "http") {
			rawURL = "https://" + rawURL
		}

		u, err := url.Parse(rawURL)
		if err != nil {
			fatal(fmt.Sprintf("Invalid URL: %s", rawURL))
		}
		normalized := fmt.Sprintf("%s://%s", u.Scheme, u.Host)

		cfg := &config.Config{URL: normalized}

		// Handle password authentication if requested (simpler than SSO)
		if passwordFlag {
			result, err := auth.PasswordAuth(normalized)
			if err != nil {
				fatal(fmt.Sprintf("Password authentication failed: %v", err))
			}
			cfg.ProxyToken = result.Token
			// Store password (base64 encoded) for auto-refresh
			cfg.ProxyPassword = base64.StdEncoding.EncodeToString([]byte(result.Password))
			success("Password authentication successful")
		} else if ssoFlag {
			// Handle SSO authentication if requested
			info("Starting SSO authentication...")

			token, err := auth.BrowserSSO(normalized)
			if err != nil {
				fatal(fmt.Sprintf("SSO authentication failed: %v", err))
			}
			cfg.ProxyToken = token
			success("SSO authentication successful")
		}

		// Health check with proxy auth if available
		client := &http.Client{Timeout: 10 * time.Second}
		req, err := http.NewRequest("GET", normalized+"/api/setup/status", nil)
		if err != nil {
			fatal(fmt.Sprintf("Failed to create request: %v", err))
		}

		if cfg.ProxyToken != "" {
			// Try as both Bearer token and Cookie
			if strings.Contains(cfg.ProxyToken, "=") {
				req.Header.Set("Cookie", cfg.ProxyToken)
			} else {
				req.Header.Set("Authorization", "Bearer "+cfg.ProxyToken)
			}
		}

		resp, err := client.Do(req)
		if err != nil {
			fatal(fmt.Sprintf("Cannot reach Gumm at %s: %v", normalized, err))
		}
		resp.Body.Close()

		if resp.StatusCode == 401 && !ssoFlag && !passwordFlag {
			warn(fmt.Sprintf("Got HTTP 401 - the server may require authentication"))
			info("Try: gumm connect --password " + rawURL)
			info("Or if using SSO: gumm connect --sso " + rawURL)
			fatal(fmt.Sprintf("Cannot reach Gumm at %s (HTTP %d)", normalized, resp.StatusCode))
		}

		if resp.StatusCode != 200 {
			fatal(fmt.Sprintf("Cannot reach Gumm at %s (HTTP %d)", normalized, resp.StatusCode))
		}

		if err := config.Save(cfg); err != nil {
			fatal(fmt.Sprintf("Failed to save config: %v", err))
		}
		success(fmt.Sprintf("Connected to %s", normalized))
		info("Run 'gumm login' to authenticate.")
	},
}

func init() {
	connectCmd.Flags().BoolVar(&passwordFlag, "password", false, "Use password authentication (for NetBird reverse proxy)")
	connectCmd.Flags().BoolVar(&ssoFlag, "sso", false, "Use browser-based SSO authentication (for reverse proxy SSO)")
}

var disconnectCmd = &cobra.Command{
	Use:   "disconnect",
	Short: "Remove saved connection",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			info("No connection configured.")
			return
		}
		_ = config.Delete()
		success(fmt.Sprintf("Disconnected from %s", cfg.URL))
	},
}
