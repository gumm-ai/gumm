package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/gumm-ai/gumm/cli/internal/client"
	"github.com/gumm-ai/gumm/cli/internal/config"
)

var modulesCmd = &cobra.Command{
	Use:   "modules",
	Short: "Manage brain modules",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}
		c := client.New(cfg)

		data, err := c.Get("/api/modules", nil)
		if err != nil {
			fatal(err.Error())
		}

		var items []any
		switch v := data.(type) {
		case []any:
			items = v
		case map[string]any:
			if mods, ok := v["modules"].([]any); ok {
				items = mods
			}
		}

		if len(items) == 0 {
			info("No modules installed.")
			fmt.Println("  Install one with 'gumm modules install owner/repo'")
			return
		}

		fmt.Printf("\n  \033[1;35mModules\033[0m (%d)\n\n", len(items))
		fmt.Printf("  %-20s %-20s %-10s %-10s %s\n", "ID", "Name", "Version", "Status", "Source")
		fmt.Println("  " + repeat("─", 80))

		for _, item := range items {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			id := getStr(m, "id", "—")
			name := getStr(m, "name", "—")
			ver := getStr(m, "version", "—")
			source := getStr(m, "source", "—")
			rs := getStr(m, "runtimeStatus", getStr(m, "status", "unknown"))

			statusLabel := rs
			switch rs {
			case "loaded", "active":
				statusLabel = "\033[32mactive\033[0m"
			case "error":
				statusLabel = "\033[31merror\033[0m"
			default:
				statusLabel = "\033[33m" + rs + "\033[0m"
			}

			fmt.Printf("  %-20s %-20s %-10s %-10s %s\n", id, name, ver, statusLabel, source)
		}
		fmt.Println()
	},
}

var modulesInstallCmd = &cobra.Command{
	Use:   "install <owner/repo>",
	Short: "Install a module from GitHub",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		repo := args[0]
		ref, _ := cmd.Flags().GetString("ref")

		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}
		c := client.New(cfg)

		body := map[string]string{"repo": repo}
		if ref != "" {
			body["ref"] = ref
		}

		refLabel := ""
		if ref != "" {
			refLabel = fmt.Sprintf(" (ref: %s)", ref)
		}
		fmt.Printf("\n  📦 Installing %s%s...\n\n", repo, refLabel)

		result, err := c.Post("/api/modules/install", body)
		if err != nil {
			fatal(err.Error())
		}

		if m, ok := result.(map[string]any); ok {
			id := getStr(m, "id", repo)
			success(fmt.Sprintf("Module %s installed successfully.", id))
			if name := getStr(m, "name", ""); name != "" {
				fmt.Printf("  Name:    %s\n", name)
			}
			if ver := getStr(m, "version", ""); ver != "" {
				fmt.Printf("  Version: %s\n", ver)
			}
		}
		fmt.Println()
	},
}

var modulesReloadCmd = &cobra.Command{
	Use:   "reload",
	Short: "Force-reload all modules on the remote",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}
		c := client.New(cfg)

		info("Reloading all modules...")
		if _, err := c.Post("/api/modules/reload", nil); err != nil {
			fatal(err.Error())
		}
		success("All modules reloaded.")
	},
}

func init() {
	modulesInstallCmd.Flags().String("ref", "", "Branch, tag, or SHA to install")
	modulesCmd.AddCommand(modulesInstallCmd)
	modulesCmd.AddCommand(modulesReloadCmd)
}

func getStr(m map[string]any, key, fallback string) string {
	if v, ok := m[key].(string); ok && v != "" {
		return v
	}
	return fallback
}

func repeat(s string, n int) string {
	result := ""
	for i := 0; i < n; i++ {
		result += s
	}
	return result
}
