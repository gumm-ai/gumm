package cmd

import (
	"fmt"
	"os/exec"
	"runtime"
	"strings"

	"github.com/gumm-ai/gumm/cli/internal/client"
	"github.com/gumm-ai/gumm/cli/internal/config"
	"github.com/spf13/cobra"
)

var networkCmd = &cobra.Command{
	Use:   "network",
	Short: "Manage VPN mesh networking (Tailscale / NetBird)",
}

// ── gumm network status ─────────────────────────────────────────────────────

var networkStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show current VPN network status and connected peers",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal("Not connected — run 'gumm connect <url>' first.")
		}
		c := client.New(cfg)

		status, err := c.GetNetworkStatus()
		if err != nil {
			fatal(fmt.Sprintf("Failed to get network status: %v", err))
		}

		fmt.Printf("  Mode:          %s\n", modeLabel(status.Mode))
		fmt.Printf("  Total devices: %d\n", status.TotalDevices)
		fmt.Printf("  VPN peers:     %d\n", status.VpnPeers)
		fmt.Printf("  Online peers:  %d\n", status.OnlinePeers)

		if len(status.Peers) > 0 {
			fmt.Println()
			fmt.Println("  Peers:")
			for _, p := range status.Peers {
				statusIcon := "●"
				if p.Status == "offline" {
					statusIcon = "○"
				}
				fmt.Printf("    %s %-20s %-16s %-10s %s\n",
					statusIcon, p.Name, p.VpnIp, p.Type, p.VpnType)
			}
		}

		// Also show local Tailscale status if available
		if status.Mode == "tailscale" {
			showLocalTailscaleStatus()
		}
		// Also show local NetBird status if available
		if status.Mode == "netbird" {
			showLocalNetbirdStatus()
		}
	},
}

// ── gumm network peers ──────────────────────────────────────────────────────

var networkPeersCmd = &cobra.Command{
	Use:   "peers",
	Short: "List all VPN-connected peers",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal("Not connected — run 'gumm connect <url>' first.")
		}
		c := client.New(cfg)

		peers, err := c.GetNetworkPeers()
		if err != nil {
			fatal(fmt.Sprintf("Failed to get peers: %v", err))
		}

		if len(peers) == 0 {
			info("No VPN peers connected.")
			return
		}

		fmt.Printf("  %-20s %-16s %-10s %-12s %s\n", "NAME", "VPN IP", "TYPE", "VPN", "STATUS")
		fmt.Printf("  %-20s %-16s %-10s %-12s %s\n", "────", "──────", "────", "───", "──────")
		for _, p := range peers {
			statusIcon := "● online"
			if p.Status == "offline" {
				statusIcon = "○ offline"
			}
			fmt.Printf("  %-20s %-16s %-10s %-12s %s\n",
				p.Name, p.VpnIp, p.Type, p.VpnType, statusIcon)
		}
	},
}

// ── gumm network setup ──────────────────────────────────────────────────────

var networkSetupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Setup VPN networking (tailscale or netbird)",
}

var networkSetupTailscaleCmd = &cobra.Command{
	Use:   "tailscale",
	Short: "Setup Tailscale VPN integration",
	Run: func(cmd *cobra.Command, args []string) {
		// Check if tailscale is installed
		tsPath := tailscaleBin()
		if tsPath == "" {
			fmt.Println("  Tailscale is not installed.")
			fmt.Println()
			fmt.Println("  Install it:")
			fmt.Println("    macOS:  brew install tailscale  (or download from https://tailscale.com/download)")
			fmt.Println("    Linux:  curl -fsSL https://tailscale.com/install.sh | sh")
			fmt.Println()
			fatal("Install Tailscale and try again.")
		}
		info(fmt.Sprintf("Tailscale found: %s", tsPath))

		// Get current Tailscale status
		ip := getTailscaleIP()
		if ip == "" {
			fmt.Println()
			fmt.Println("  Tailscale is installed but not connected.")
			if runtime.GOOS == "darwin" {
				fmt.Println("  Open Tailscale from your menu bar, or run: tailscale up")
			} else {
				fmt.Println("  Run: sudo tailscale up")
			}
			fmt.Println()
			fatal("Connect to Tailscale first, then re-run this command.")
		}
		success(fmt.Sprintf("Tailscale IP: %s", ip))

		// Tell the brain to switch to Tailscale mode
		cfg, err := config.Load()
		if err != nil {
			fatal("Not connected — run 'gumm connect <url>' first.")
		}
		c := client.New(cfg)

		if err := c.SetupNetwork("tailscale", nil); err != nil {
			fatal(fmt.Sprintf("Failed to configure brain: %v", err))
		}

		success("Network mode set to Tailscale")
		info(fmt.Sprintf("This device's VPN IP (%s) will be sent in heartbeats.", ip))
		info("Other devices will discover the brain via VPN automatically.")
	},
}

var networkSetupNetbirdCmd = &cobra.Command{
	Use:   "netbird",
	Short: "Setup NetBird VPN integration (EU alternative)",
	Run: func(cmd *cobra.Command, args []string) {
		// Check if netbird is installed
		nbPath := netbirdBin()
		if nbPath == "" {
			fmt.Println("  NetBird is not installed.")
			fmt.Println()
			fmt.Println("  Install it:")
			fmt.Println("    macOS:  brew install netbirdio/tap/netbird")
			fmt.Println("    Linux:  curl -fsSL https://pkgs.netbird.io/install.sh | sh")
			fmt.Println("    Docs:   https://netbird.io/docs/getting-started/installation")
			fmt.Println()
			fatal("Install NetBird and try again.")
		}
		info(fmt.Sprintf("NetBird found: %s", nbPath))

		// Get current NetBird status
		ip := getNetbirdIP()
		if ip == "" {
			fmt.Println()
			fmt.Println("  NetBird is installed but not connected.")
			fmt.Println("  Run: sudo netbird up --setup-key <your-setup-key>")
			fmt.Println()
			fmt.Println("  Get a setup key from: https://app.netbird.io/setup-keys")
			fmt.Println()
			fatal("Connect to NetBird first, then re-run this command.")
		}
		success(fmt.Sprintf("NetBird IP: %s", ip))

		// Tell the brain to switch to NetBird mode
		cfg, err := config.Load()
		if err != nil {
			fatal("Not connected — run 'gumm connect <url>' first.")
		}
		c := client.New(cfg)

		if err := c.SetupNetwork("netbird", nil); err != nil {
			fatal(fmt.Sprintf("Failed to configure brain: %v", err))
		}

		success("Network mode set to NetBird")
		info(fmt.Sprintf("This device's VPN IP (%s) will be sent in heartbeats.", ip))
		info("Other devices will discover the brain via VPN automatically.")
	},
}

var networkSetupWireguardCmd = &cobra.Command{
	Use:   "wireguard",
	Short: "Setup WireGuard VPN (coming soon)",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("  WireGuard support is coming soon.")
		fmt.Println()
		fmt.Println("  For now, please use:")
		fmt.Println("    - Tailscale (Toronto, Canada): gumm network setup tailscale")
		fmt.Println("    - NetBird (Berlin, Germany):   gumm network setup netbird")
		fmt.Println()
	},
}

// ── gumm network join ───────────────────────────────────────────────────────

var networkJoinCmd = &cobra.Command{
	Use:   "join",
	Short: "Join the VPN mesh network",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal("Not connected — run 'gumm connect <url>' first.")
		}
		c := client.New(cfg)

		// Get current network mode from brain
		status, err := c.GetNetworkStatus()
		if err != nil {
			fatal(fmt.Sprintf("Failed to get network status: %v", err))
		}

		switch status.Mode {
		case "tailscale":
			joinTailscale(c)
		case "netbird":
			joinNetbird(c)
		case "wireguard":
			info("WireGuard support is coming soon.")
			info("Use Tailscale or NetBird for now.")
		default:
			fatal("No VPN mode configured. Run 'gumm network setup tailscale' or 'gumm network setup netbird' first.")
		}
	},
}

// ── gumm network leave ──────────────────────────────────────────────────────

var networkLeaveCmd = &cobra.Command{
	Use:   "leave",
	Short: "Disconnect from the VPN mesh network",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal("Not connected — run 'gumm connect <url>' first.")
		}
		c := client.New(cfg)

		if err := c.SetupNetwork("none", nil); err != nil {
			fatal(fmt.Sprintf("Failed to disable networking: %v", err))
		}
		success("VPN networking disabled")
	},
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// tailscaleBin returns the path to the tailscale binary.
// On macOS, Tailscale is often installed as an app bundle and not in PATH.
func tailscaleBin() string {
	// Check PATH first (Linux, Homebrew, manually installed)
	if p, err := exec.LookPath("tailscale"); err == nil {
		return p
	}
	// macOS app bundle
	if runtime.GOOS == "darwin" {
		macPath := "/Applications/Tailscale.app/Contents/MacOS/Tailscale"
		if _, err := exec.Command(macPath, "version").Output(); err == nil {
			return macPath
		}
	}
	return ""
}

func getTailscaleIP() string {
	bin := tailscaleBin()
	if bin == "" {
		return ""
	}
	out, err := exec.Command(bin, "ip", "-4").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func showLocalTailscaleStatus() {
	ip := getTailscaleIP()
	if ip != "" {
		fmt.Printf("\n  Local Tailscale IP: %s\n", ip)
	}
}

func joinTailscale(c *client.Client) {
	tsPath := tailscaleBin()
	if tsPath == "" {
		fmt.Println("  Tailscale is not installed on this device.")
		fmt.Println()
		fmt.Println("  Install it:")
		if runtime.GOOS == "darwin" {
			fmt.Println("    brew install tailscale  (or download from https://tailscale.com/download)")
		} else {
			fmt.Println("    curl -fsSL https://tailscale.com/install.sh | sh")
		}
		fmt.Println()
		fatal("Install Tailscale and try again.")
	}

	ip := getTailscaleIP()
	if ip == "" {
		fmt.Println("  Tailscale is installed but not connected.")
		if runtime.GOOS == "darwin" {
			fmt.Println("  Open Tailscale from your menu bar, or run:")
			fmt.Printf("    %s up\n", tsPath)
		} else {
			fmt.Println("  Run: sudo tailscale up")
		}
		fatal("Connect to Tailscale first.")
	}
	success(fmt.Sprintf("Tailscale connected — VPN IP: %s", ip))
	info("VPN IP will be included in heartbeats automatically.")
}

func modeLabel(mode string) string {
	switch mode {
	case "tailscale":
		return "Tailscale (Toronto, CA)"
	case "netbird":
		return "NetBird (Berlin, DE)"
	case "wireguard":
		return "WireGuard"
	case "none":
		return "None (disabled)"
	default:
		return mode
	}
}

// netbirdBin returns the path to the netbird binary.
func netbirdBin() string {
	// Check PATH first
	if p, err := exec.LookPath("netbird"); err == nil {
		return p
	}
	return ""
}

func getNetbirdIP() string {
	bin := netbirdBin()
	if bin == "" {
		return ""
	}
	out, err := exec.Command(bin, "status").Output()
	if err != nil {
		return ""
	}
	// Parse IP from status output (format varies, look for "IP: x.x.x.x")
	output := string(out)
	if !strings.Contains(output, "Connected") {
		return ""
	}
	// Find IP line
	for _, line := range strings.Split(output, "\n") {
		if strings.Contains(line, "IP:") {
			parts := strings.Fields(line)
			for i, p := range parts {
				if p == "IP:" && i+1 < len(parts) {
					ip := parts[i+1]
					// Remove CIDR suffix if present
					if idx := strings.Index(ip, "/"); idx > 0 {
						ip = ip[:idx]
					}
					return ip
				}
			}
		}
	}
	return ""
}

func showLocalNetbirdStatus() {
	ip := getNetbirdIP()
	if ip != "" {
		fmt.Printf("\n  Local NetBird IP: %s\n", ip)
	}
}

func joinNetbird(c *client.Client) {
	nbPath := netbirdBin()
	if nbPath == "" {
		fmt.Println("  NetBird is not installed on this device.")
		fmt.Println()
		fmt.Println("  Install it:")
		if runtime.GOOS == "darwin" {
			fmt.Println("    brew install netbirdio/tap/netbird")
		} else {
			fmt.Println("    curl -fsSL https://pkgs.netbird.io/install.sh | sh")
		}
		fmt.Println()
		fatal("Install NetBird and try again.")
	}

	ip := getNetbirdIP()
	if ip == "" {
		fmt.Println("  NetBird is installed but not connected.")
		fmt.Println("  Run: sudo netbird up --setup-key <your-setup-key>")
		fmt.Println()
		fmt.Println("  Get a setup key from: https://app.netbird.io/setup-keys")
		fatal("Connect to NetBird first.")
	}
	success(fmt.Sprintf("NetBird connected — VPN IP: %s", ip))
	info("VPN IP will be included in heartbeats automatically.")
}

func init() {
	networkSetupCmd.AddCommand(networkSetupTailscaleCmd)
	networkSetupCmd.AddCommand(networkSetupNetbirdCmd)
	networkSetupCmd.AddCommand(networkSetupWireguardCmd)

	networkCmd.AddCommand(networkStatusCmd)
	networkCmd.AddCommand(networkPeersCmd)
	networkCmd.AddCommand(networkSetupCmd)
	networkCmd.AddCommand(networkJoinCmd)
	networkCmd.AddCommand(networkLeaveCmd)
}
