package cmd

import (
	"fmt"
	"sort"

	"github.com/spf13/cobra"

	"github.com/gumm-ai/gumm/cli/internal/client"
	"github.com/gumm-ai/gumm/cli/internal/config"
)

var brainCmd = &cobra.Command{
	Use:   "brain",
	Short: "Brain configuration, stats, and memory",
}

var brainConfigCmd = &cobra.Command{
	Use:   "config",
	Short: "Show brain configuration",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}
		c := client.New(cfg)

		entries, err := c.GetBrainConfig()
		if err != nil {
			fatal(err.Error())
		}

		fmt.Println()
		fmt.Println("  \033[1;35mBrain Configuration\033[0m")
		fmt.Println()

		keys := make([]string, 0, len(entries))
		for k := range entries {
			keys = append(keys, k)
		}
		sort.Strings(keys)

		for _, k := range keys {
			v := entries[k]
			if len(v) > 60 {
				v = v[:57] + "..."
			}
			fmt.Printf("  %-30s %s\n", k, v)
		}
		fmt.Println()
	},
}

var brainConfigSetCmd = &cobra.Command{
	Use:   "config-set <key> <value>",
	Short: "Update a brain config entry",
	Args:  cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		key, value := args[0], args[1]

		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}
		c := client.New(cfg)

		if _, err := c.Put("/api/brain/config", map[string]string{"key": key, "value": value}); err != nil {
			fatal(err.Error())
		}
		success(fmt.Sprintf("%s = %s", key, value))
	},
}

var brainStatsCmd = &cobra.Command{
	Use:   "stats",
	Short: "Show brain statistics",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}
		c := client.New(cfg)

		data, err := c.Get("/api/brain/stats", nil)
		if err != nil {
			fatal(err.Error())
		}

		fmt.Println()
		fmt.Println("  \033[1;35mBrain Statistics\033[0m")
		fmt.Println()

		if m, ok := data.(map[string]any); ok {
			for k, v := range m {
				fmt.Printf("  %-20s %v\n", k, v)
			}
		}
		fmt.Println()
	},
}

var brainMemoryCmd = &cobra.Command{
	Use:   "memory",
	Short: "List brain memories",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}
		c := client.New(cfg)

		params := map[string]string{}
		if t, _ := cmd.Flags().GetString("type"); t != "" {
			params["type"] = t
		}
		if ns, _ := cmd.Flags().GetString("namespace"); ns != "" {
			params["namespace"] = ns
		}
		if limit, _ := cmd.Flags().GetInt("limit"); limit > 0 {
			params["limit"] = fmt.Sprintf("%d", limit)
		}

		var p map[string]string
		if len(params) > 0 {
			p = params
		}

		data, err := c.Get("/api/brain/memory", p)
		if err != nil {
			fatal(err.Error())
		}

		var entries []any
		switch v := data.(type) {
		case []any:
			entries = v
		case map[string]any:
			if mems, ok := v["memories"].([]any); ok {
				entries = mems
			} else if ents, ok := v["entries"].([]any); ok {
				entries = ents
			}
		}

		fmt.Printf("\n  \033[1;35mBrain Memory\033[0m (%d entries)\n\n", len(entries))

		if len(entries) == 0 {
			info("No memory entries found.")
			return
		}

		max := 50
		if len(entries) > max {
			entries = entries[:max]
		}

		fmt.Printf("  %-30s %-50s %s\n", "Key", "Value", "Type")
		fmt.Println("  " + repeat("─", 90))

		for _, item := range entries {
			e, ok := item.(map[string]any)
			if !ok {
				continue
			}
			key := getStr(e, "key", "—")
			val := getStr(e, "value", "—")
			if len(val) > 47 {
				val = val[:47] + "..."
			}
			mtype := getStr(e, "type", "—")
			fmt.Printf("  %-30s %-50s %s\n", key, val, mtype)
		}
		fmt.Println()
	},
}

func init() {
	brainMemoryCmd.Flags().String("type", "", "Filter by memory type")
	brainMemoryCmd.Flags().String("namespace", "", "Filter by namespace")
	brainMemoryCmd.Flags().Int("limit", 0, "Max entries to show")

	brainCmd.AddCommand(brainConfigCmd)
	brainCmd.AddCommand(brainConfigSetCmd)
	brainCmd.AddCommand(brainStatsCmd)
	brainCmd.AddCommand(brainMemoryCmd)
	brainCmd.AddCommand(brainFreshStartCmd)
}

var brainFreshStartCmd = &cobra.Command{
	Use:   "fresh-start",
	Short: "Wipe memory, conversations, and facts — keep configs and APIs",
	Long: `Reset the brain as if meeting the user for the first time.

Deletes: conversations, messages, memory, personal facts, events,
reminders, recurring tasks, agent tasks, vector memory, semantic cache.

Keeps: brain config, API connections, modules, module data, secrets,
schedules, devices, storage nodes.

If Telegram is configured, sends a fresh introduction message.`,
	Run: func(cmd *cobra.Command, args []string) {
		force, _ := cmd.Flags().GetBool("force")
		if !force {
			fmt.Print("⚠️  This will erase all memory, conversations, and personal facts. Continue? [y/N] ")
			var answer string
			fmt.Scanln(&answer)
			if answer != "y" && answer != "Y" {
				fmt.Println("Cancelled.")
				return
			}
		}

		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}
		c := client.New(cfg)

		data, err := c.Post("/api/brain/fresh-start", nil)
		if err != nil {
			fatal(err.Error())
		}

		fmt.Println()
		fmt.Println("  \033[1;35m🔄 Fresh Start Complete\033[0m")
		fmt.Println()

		if m, ok := data.(map[string]any); ok {
			if wiped, ok := m["wiped"].([]any); ok {
				fmt.Printf("  Wiped:    %d categories\n", len(wiped))
			}
			if kept, ok := m["kept"].([]any); ok {
				fmt.Printf("  Kept:     %d categories\n", len(kept))
			}
			if tg, ok := m["telegramIntroSent"].(bool); ok && tg {
				fmt.Println("  Telegram: ✓ Introduction sent")
			}
		}
		fmt.Println()
		success("Brain reset — fresh start ready!")
	},
}

func init() {
	brainFreshStartCmd.Flags().Bool("force", false, "Skip confirmation prompt")
}
