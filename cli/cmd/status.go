package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/gumm-ai/gumm/cli/internal/client"
	"github.com/gumm-ai/gumm/cli/internal/config"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show connection & brain status",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}

		fmt.Println()
		fmt.Printf("  \033[1;35mgumm\033[0m status\n\n")
		fmt.Printf("  Remote: \033[1m%s\033[0m\n", cfg.URL)

		if cfg.Token == "" {
			fmt.Println("  Auth:   \033[33mnot logged in\033[0m")
			fmt.Println("\n  Run 'gumm login' to authenticate.\n")
			return
		}
		fmt.Println("  Auth:   \033[32mauthenticated\033[0m")
		fmt.Println()

		c := client.New(cfg)

		stats, err := c.Get("/api/brain/stats", nil)
		if err != nil {
			fatal(err.Error())
		}

		brainConfig, err := c.GetBrainConfig()
		if err != nil {
			fatal(err.Error())
		}

		name := brainConfig["identity.name"]
		if name == "" {
			name = "Gumm"
		}
		model := brainConfig["llm.model"]
		if model == "" {
			model = "unknown"
		}

		fmt.Printf("  Brain:  \033[1m%s\033[0m\n", name)
		fmt.Printf("  Model:  %s\n\n", model)

		if statsMap, ok := stats.(map[string]any); ok {
			for _, key := range []string{"conversations", "messages", "modules", "events", "memories"} {
				if v, ok := statsMap[key]; ok {
					fmt.Printf("  %-15s %v\n", capitalize(key), v)
				}
			}
		}

		fmt.Println()
		success("Brain is online.")
	},
}

func capitalize(s string) string {
	if s == "" {
		return s
	}
	return fmt.Sprintf("%c%s", s[0]-32, s[1:])
}
