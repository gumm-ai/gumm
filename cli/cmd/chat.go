package cmd

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"

	"github.com/gumm-ai/gumm/cli/internal/agent"
	"github.com/gumm-ai/gumm/cli/internal/client"
	"github.com/gumm-ai/gumm/cli/internal/config"
	"github.com/gumm-ai/gumm/cli/internal/tui"
)

var chatConversation string

var chatCmd = &cobra.Command{
	Use:   "chat [message...]",
	Short: "Chat with the brain. Without arguments, launches interactive TUI.",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}

		if len(args) > 0 {
			// One-shot mode
			text := strings.Join(args, " ")
			c := client.New(cfg)

			fmt.Printf("\n  \033[2mYou:\033[0m %s\n\n", text)

			body := map[string]any{
				"messages": []map[string]string{
					{"role": "user", "content": text},
				},
			}
			if chatConversation != "" {
				body["conversationId"] = chatConversation
			}

			result, err := c.Post("/api/chat", body)
			if err != nil {
				fatal(err.Error())
			}

			if m, ok := result.(map[string]any); ok {
				reply := ""
				for _, key := range []string{"reply", "content", "message", "response"} {
					if v, ok := m[key].(string); ok && v != "" {
						reply = v
						break
					}
				}
				if reply == "" {
					b, _ := json.Marshal(result)
					reply = string(b)
				}
				fmt.Printf("  \033[36mBrain:\033[0m %s\n", reply)

				if cid, ok := m["conversationId"].(string); ok {
					fmt.Printf("\n  \033[2mConversation: %s\033[0m\n", cid)
				}
			}
			fmt.Println()
			return
		}

		// Interactive TUI mode
		launchTUI(cfg, chatConversation)
	},
}

var conversationsCmd = &cobra.Command{
	Use:   "conversations",
	Short: "List recent conversations",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}
		c := client.New(cfg)

		data, err := c.Get("/api/conversations", nil)
		if err != nil {
			fatal(err.Error())
		}

		var items []any
		switch v := data.(type) {
		case []any:
			items = v
		case map[string]any:
			if convs, ok := v["conversations"].([]any); ok {
				items = convs
			}
		}

		fmt.Printf("\n  \033[1;35mConversations\033[0m (%d)\n\n", len(items))

		if len(items) == 0 {
			info("No conversations yet.")
			return
		}

		max := 30
		if len(items) > max {
			items = items[:max]
		}

		fmt.Printf("  %-10s %-50s %s\n", "ID", "Title", "Created")
		fmt.Println("  " + repeat("─", 75))

		for _, item := range items {
			conv, ok := item.(map[string]any)
			if !ok {
				continue
			}
			id := getStr(conv, "id", "")
			if len(id) > 8 {
				id = id[:8]
			}
			title := getStr(conv, "title", "—")
			if len(title) > 47 {
				title = title[:47] + "..."
			}

			dateStr := "—"
			if created, ok := conv["createdAt"].(string); ok {
				if t, err := time.Parse(time.RFC3339, created); err == nil {
					dateStr = t.Local().Format("Jan 02, 3:04 PM")
				}
			}

			fmt.Printf("  %-10s %-50s %s\n", id, title, dateStr)
		}
		fmt.Println()
	},
}

var logsCmd = &cobra.Command{
	Use:   "logs",
	Short: "Stream live events from the brain",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}
		c := client.New(cfg)

		fmt.Println("  \033[1;35mLive Events\033[0m (Ctrl+C to stop)\n")

		ch := make(chan string, 64)
		go func() {
			if err := c.StreamSSE("/api/brain/events/stream", ch); err != nil {
				fmt.Printf("  \033[31m✗ %s\033[0m\n", err)
			}
		}()

		for data := range ch {
			var event map[string]any
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				fmt.Printf("  \033[2m%s\033[0m\n", data)
				continue
			}

			timeStr := time.Now().Format("15:04:05")
			if ts, ok := event["createdAt"].(string); ok {
				if t, err := time.Parse(time.RFC3339, ts); err == nil {
					timeStr = t.Local().Format("15:04:05")
				}
			}

			source := getStr(event, "source", "—")
			etype := getStr(event, "type", "—")
			payload, _ := json.Marshal(event["payload"])

			fmt.Printf("  \033[2m%s\033[0m \033[36m%s\033[0m \033[1m%s\033[0m \033[2m%s\033[0m\n",
				timeStr, source, etype, string(payload))
		}
	},
}

func init() {
	chatCmd.Flags().StringVarP(&chatConversation, "conversation", "c", "", "Continue an existing conversation")
}

func launchTUI(cfg *config.Config, conversationID string) {
	c := client.New(cfg)

	apiKey, model, err := c.GetAPIKey()
	if err != nil {
		fatal(fmt.Sprintf("Failed to fetch brain config: %v", err))
	}
	if apiKey == "" {
		fatal("OpenRouter API key not configured. Set it in Brain settings.")
	}
	if model == "" {
		model = "google/gemini-2.5-flash"
	}

	brainConfig, _ := c.GetBrainConfig()
	brainName := brainConfig["identity.name"]
	if brainName == "" {
		brainName = "Gumm"
	}

	a := agent.New(apiKey, model, brainName)

	// Connect agent to Brain: fetch system prompt + tools from the backend
	brainTools, err := c.GetBrainTools()
	if err != nil {
		// Non-fatal: continue with local tools only
		fmt.Printf("  \033[33m⚠ Could not fetch Brain tools: %s\033[0m\n", err)
	} else {
		systemPrompt, err := c.GetBrainSystemPrompt("")
		if err != nil {
			fmt.Printf("  \033[33m⚠ Could not fetch Brain context: %s\033[0m\n", err)
		} else {
			a.SetBrainContext(systemPrompt, brainTools, &brainToolAdapter{client: c, channelCtx: nil})
		}
	}

	// Load conversation history if continuing
	if conversationID != "" {
		conv, err := c.Get("/api/conversations/"+conversationID, nil)
		if err == nil {
			if m, ok := conv.(map[string]any); ok {
				if msgs, ok := m["messages"].([]any); ok {
					var history []agent.Message
					for _, msg := range msgs {
						if mm, ok := msg.(map[string]any); ok {
							history = append(history, agent.Message{
								Role:    getStr(mm, "role", ""),
								Content: getStr(mm, "content", ""),
							})
						}
					}
					a.LoadHistory(history)
				}
			}
		}
	}

	m := tui.NewModel(a, brainName, model)
	p := tea.NewProgram(m, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fatal(fmt.Sprintf("TUI error: %v", err))
	}
}

// brainToolAdapter implements agent.BrainToolExecutor by delegating to the backend API.
type brainToolAdapter struct {
	client     *client.Client
	channelCtx map[string]any
}

func (b *brainToolAdapter) Execute(toolName string, args map[string]any) (string, error) {
	return b.client.ExecuteBrainToolWithContext(toolName, args, b.channelCtx)
}
