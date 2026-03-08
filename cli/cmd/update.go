package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"

	"github.com/spf13/cobra"

	"github.com/gumm-ai/gumm/cli/internal/client"
	"github.com/gumm-ai/gumm/cli/internal/config"
)

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update Gumm to the latest version",
	Long: `Update Gumm to the latest version.

If running on the server (where Gumm is installed), this will execute the
system update script directly.

If running from a remote CLI agent, this will trigger the update via the API.`,
	Run: func(cmd *cobra.Command, args []string) {
		checkOnly, _ := cmd.Flags().GetBool("check")
		
		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}

		// If --check flag, just show available updates
		if checkOnly {
			showAvailableUpdates(cfg)
			return
		}

		// Check if we're on the server (update.sh exists)
		if isServer() {
			runServerUpdate()
			return
		}

		// Otherwise, trigger update via API
		triggerRemoteUpdate(cfg)
	},
}

var updateModulesCmd = &cobra.Command{
	Use:   "modules",
	Short: "Update all installed modules to their latest versions",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}
		c := client.New(cfg)

		fmt.Println()
		fmt.Printf("  \033[1;35mUpdating modules...\033[0m\n\n")

		result, err := c.Post("/api/modules/update-all", nil)
		if err != nil {
			fatal(fmt.Sprintf("Failed to update modules: %v", err))
		}

		if resultMap, ok := result.(map[string]any); ok {
			updated := int(getFloat(resultMap, "updated", 0))
			failed := int(getFloat(resultMap, "failed", 0))
			
			if updated > 0 {
				fmt.Printf("  \033[32m✓ Updated %d module(s)\033[0m\n", updated)
			}
			if failed > 0 {
				fmt.Printf("  \033[31m✗ Failed to update %d module(s)\033[0m\n", failed)
			}
			if updated == 0 && failed == 0 {
				fmt.Println("  All modules are up to date.")
			}
		}
		fmt.Println()
	},
}

func init() {
	updateCmd.Flags().BoolP("check", "c", false, "Check for updates without installing")
	updateCmd.AddCommand(updateModulesCmd)
	rootCmd.AddCommand(updateCmd)
}

// isServer checks if we're running on the Gumm server
func isServer() bool {
	// Check if /etc/gumm/config exists (server installation marker)
	if _, err := os.Stat("/etc/gumm/config"); err == nil {
		return true
	}
	// Also check if update.sh exists in typical locations
	paths := []string{
		"/opt/gumm/scripts/update.sh",
		"./scripts/update.sh",
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return true
		}
	}
	return false
}

// runServerUpdate executes update.sh directly on the server
func runServerUpdate() {
	fmt.Println()
	fmt.Printf("  \033[1;35mGumm Update\033[0m — running on server\n\n")

	// Find update.sh
	var scriptPath string
	paths := []string{
		"/opt/gumm/scripts/update.sh",
		"./scripts/update.sh",
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			scriptPath = p
			break
		}
	}

	if scriptPath == "" {
		fatal("update.sh not found. Are you on the Gumm server?")
	}

	// Check if running as root (required for update)
	if os.Geteuid() != 0 {
		fmt.Println("  \033[33m⚠ Update requires root privileges.\033[0m")
		fmt.Println("  Please run: sudo gumm update")
		fmt.Println()
		os.Exit(1)
	}

	// Execute update.sh
	cmd := exec.Command("bash", scriptPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	if err := cmd.Run(); err != nil {
		fatal(fmt.Sprintf("Update failed: %v", err))
	}
}

// triggerRemoteUpdate calls the server API to trigger an update
func triggerRemoteUpdate(cfg *config.Config) {
	c := client.New(cfg)

	fmt.Println()
	fmt.Printf("  \033[1;35mGumm Update\033[0m — triggering remote update\n\n")

	// First check if updates are available
	updates, err := c.Get("/api/system/updates", nil)
	if err != nil {
		fatal(fmt.Sprintf("Failed to check for updates: %v", err))
	}

	updatesMap, ok := updates.(map[string]any)
	if !ok {
		fatal("Invalid response from server")
	}

	hasGummUpdate := getBool(updatesMap, "hasGummUpdate", false)
	moduleUpdates := int(getFloat(updatesMap, "moduleUpdatesCount", 0))

	if !hasGummUpdate && moduleUpdates == 0 {
		fmt.Println("  \033[32m✓ Gumm is up to date!\033[0m")
		fmt.Println()
		return
	}

	if hasGummUpdate {
		currentVersion := getStr(updatesMap, "currentVersion", "unknown")
		latestVersion := getStr(updatesMap, "latestVersion", "unknown")
		fmt.Printf("  Gumm update available: %s → %s\n", currentVersion, latestVersion)
	}

	if moduleUpdates > 0 {
		fmt.Printf("  %d module update(s) available\n", moduleUpdates)
	}

	fmt.Println()
	fmt.Println("  \033[33m⚠ Remote update must be performed on the server.\033[0m")
	fmt.Println("  SSH into your server and run: sudo gumm update")
	fmt.Println()
}

// showAvailableUpdates displays what updates are available
func showAvailableUpdates(cfg *config.Config) {
	c := client.New(cfg)

	fmt.Println()
	fmt.Printf("  \033[1;35mChecking for updates...\033[0m\n\n")

	updates, err := c.Get("/api/system/updates", nil)
	if err != nil {
		fatal(fmt.Sprintf("Failed to check for updates: %v", err))
	}

	updatesMap, ok := updates.(map[string]any)
	if !ok {
		fatal("Invalid response from server")
	}

	currentVersion := getStr(updatesMap, "currentVersion", "unknown")
	latestVersion := getStr(updatesMap, "latestVersion", "unknown")
	hasGummUpdate := getBool(updatesMap, "hasGummUpdate", false)
	moduleUpdates := int(getFloat(updatesMap, "moduleUpdatesCount", 0))

	fmt.Printf("  Current version: \033[1m%s\033[0m\n", currentVersion)
	fmt.Printf("  Latest version:  \033[1m%s\033[0m\n", latestVersion)
	fmt.Println()

	if hasGummUpdate {
		fmt.Printf("  \033[33m↑ Gumm update available!\033[0m\n")
	} else {
		fmt.Printf("  \033[32m✓ Gumm is up to date\033[0m\n")
	}

	if moduleUpdates > 0 {
		fmt.Printf("  \033[33m↑ %d module update(s) available\033[0m\n", moduleUpdates)
		
		// Show individual module updates
		if modules, ok := updatesMap["moduleUpdates"].([]any); ok {
			fmt.Println()
			for _, m := range modules {
				if mod, ok := m.(map[string]any); ok {
					name := getStr(mod, "name", "unknown")
					current := getStr(mod, "currentVersion", "?")
					latest := getStr(mod, "latestVersion", "?")
					fmt.Printf("    • %s: %s → %s\n", name, current, latest)
				}
			}
		}
	} else {
		fmt.Printf("  \033[32m✓ All modules up to date\033[0m\n")
	}

	fmt.Println()

	// Platform-specific update instructions
	if hasGummUpdate || moduleUpdates > 0 {
		fmt.Println("  To update, run:")
		if runtime.GOOS == "linux" {
			fmt.Println("    sudo gumm update")
		} else {
			fmt.Println("    gumm update")
		}
		fmt.Println()
	}
}

func getBool(m map[string]any, key string, def bool) bool {
	if v, ok := m[key].(bool); ok {
		return v
	}
	return def
}

func getFloat(m map[string]any, key string, def float64) float64 {
	if v, ok := m[key].(float64); ok {
		return v
	}
	return def
}
