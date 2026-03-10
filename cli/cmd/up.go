package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/gumm-ai/gumm/cli/internal/agent"
	"github.com/gumm-ai/gumm/cli/internal/client"
	"github.com/gumm-ai/gumm/cli/internal/config"
)

var upCmd = &cobra.Command{
	Use:   "up",
	Short: "Start the CLI agent daemon — listens for tasks from Telegram/web and executes locally",
	Long: `Start the CLI agent in daemon mode. It connects to your Gumm server via SSE
and waits for tasks delegated from Telegram or the web interface.

When someone sends a message on Telegram like "open my browser" or "take a
screenshot", the Brain delegates it to this CLI agent which executes it
on your local machine.

The agent has access to: open_url, open_application, run_shell_command,
take_screenshot, read_file, write_file, list_directory, plus all Brain
tools (memory, reminders, modules, send_telegram_message, etc.).

Press Ctrl+C to stop.`,
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}
		c := client.New(cfg)

		// Fetch model config (API key stays on the server via LLM proxy)
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

		// LLM proxy: the server handles API key injection
		proxyURL := c.LLMProxyURL()
		proxyHeaders := c.AuthHeaders()

		brainConfig, _ := c.GetBrainConfig()
		brainName := brainConfig["identity.name"]
		if brainName == "" {
			brainName = "Gumm"
		}

		dcfg := &daemonConfig{
			apiKey:       apiKey,
			model:        model,
			brainName:    brainName,
			proxyURL:     proxyURL,
			proxyHeaders: proxyHeaders,
		}

		fmt.Printf("\n  \033[1;35m%s CLI Agent\033[0m — daemon mode\n", brainName)
		fmt.Printf("  \033[2mModel: %s\033[0m\n", model)
		fmt.Printf("  \033[2mServer: %s\033[0m\n", cfg.URL)
		fmt.Println("  \033[2mListening for tasks... (Ctrl+C to stop)\033[0m")

		// Register device and start heartbeat
		deviceID := getOrCreateDeviceID()
		go deviceHeartbeatLoop(c, "cli", "", "")

		// Set up signal handling
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

		// Track tasks currently being processed to avoid duplicates
		activeTasks := &sync.Map{}

		// Start SSE stream for agent tasks with auto-reconnect
		retryDelay := 3 // seconds

		for {
			taskCh := make(chan string, 64)
			errCh := make(chan error, 1)

			go func() {
				errCh <- c.StreamAgentTasks(taskCh, deviceID)
			}()

			// Polling fallback: check for pending tasks every 10s
			// in case SSE events are missed (Bun/proxy buffering, etc.)
			pollTicker := time.NewTicker(10 * time.Second)

			reconnect := false
		inner:
			for {
				select {
				case <-sigCh:
					pollTicker.Stop()
					fmt.Println("\n  \033[33m⚠ Shutting down agent...\033[0m")
					return

				case err := <-errCh:
					pollTicker.Stop()
					if err != nil {
						fmt.Printf("  \033[33m⚠ SSE connection lost: %s — reconnecting in %ds...\033[0m\n", err, retryDelay)
					} else {
						fmt.Printf("  \033[33m⚠ SSE connection closed by server — reconnecting in %ds...\033[0m\n", retryDelay)
					}
					reconnect = true
					break inner

				case data, ok := <-taskCh:
					if !ok {
						pollTicker.Stop()
						fmt.Printf("  \033[33m⚠ Connection closed by server — reconnecting in %ds...\033[0m\n", retryDelay)
						reconnect = true
						break inner
					}
					go handleAgentEvent(c, data, dcfg, activeTasks)

				case <-pollTicker.C:
					// Poll for pending tasks as a fallback
					go pollPendingTasks(c, dcfg, activeTasks, deviceID)
				}
			}

			if !reconnect {
				return
			}

			// Wait before reconnecting, but allow Ctrl+C during wait
			select {
			case <-sigCh:
				fmt.Println("\n  \033[33m⚠ Shutting down agent...\033[0m")
				return
			case <-time.After(time.Duration(retryDelay) * time.Second):
			}
			fmt.Println("  \033[2mReconnecting...\033[0m")
		}
	},
}

// daemonConfig holds the configuration for daemon-mode agent execution.
type daemonConfig struct {
	apiKey       string
	model        string
	brainName    string
	proxyURL     string
	proxyHeaders http.Header
}

func handleAgentEvent(c *client.Client, data string, dcfg *daemonConfig, activeTasks *sync.Map) {
	var event struct {
		Type string `json:"type"`
		Task struct {
			ID     string `json:"id"`
			Prompt string `json:"prompt"`
		} `json:"task"`
	}

	if err := json.Unmarshal([]byte(data), &event); err != nil {
		return // skip malformed events
	}

	if event.Type == "connected" {
		fmt.Println("  \033[32m✓ Connected to server\033[0m")
		return
	}

	if event.Type != "agent.task.created" || event.Task.ID == "" {
		return
	}

	executeTask(c, event.Task.ID, event.Task.Prompt, dcfg, activeTasks)
}

// pollPendingTasks fetches pending tasks via REST and processes any that aren't already active.
func pollPendingTasks(c *client.Client, dcfg *daemonConfig, activeTasks *sync.Map, deviceID string) {
	tasks, err := c.GetPendingTasks(deviceID)
	if err != nil {
		return // silent fail — SSE is the primary mechanism
	}
	for _, task := range tasks {
		executeTask(c, task.ID, task.Prompt, dcfg, activeTasks)
	}
}

func executeTask(c *client.Client, taskID, prompt string, dcfg *daemonConfig, activeTasks *sync.Map) {
	// Skip if already being processed
	if _, loaded := activeTasks.LoadOrStore(taskID, true); loaded {
		return
	}
	defer activeTasks.Delete(taskID)

	fmt.Printf("  \033[36m⬇ Task received:\033[0m %s\n", truncate(prompt, 80))

	// Claim the task and get channel metadata
	claimResult, err := c.ClaimAgentTaskFull(taskID)
	if err != nil {
		fmt.Printf("  \033[31m✗ Failed to claim task %s: %s\033[0m\n", taskID[:8], err)
		return
	}
	fmt.Printf("  \033[33m⚡ Executing task %s...\033[0m\n", taskID[:8])

	// Create a fresh agent for this task
	a := agent.New(dcfg.apiKey, dcfg.model, dcfg.brainName)

	// Use server-side LLM proxy so the API key never leaves the server
	if dcfg.proxyURL != "" {
		a.SetProxy(dcfg.proxyURL, dcfg.proxyHeaders)
	}

	// Set up file upload capability
	a.SetUploader(c)

	// Build channel context from task metadata for brain tool calls
	var channelCtx map[string]any
	if claimResult != nil && claimResult.Channel != "" {
		channelCtx = map[string]any{
			"channel": claimResult.Channel,
		}
		if claimResult.ChatId != 0 {
			channelCtx["chatId"] = claimResult.ChatId
		}
		if claimResult.ConversationId != "" {
			channelCtx["conversationId"] = claimResult.ConversationId
		}
	}

	// Connect to Brain tools (memory, reminders, send_telegram_message, etc.)
	brainTools, err := c.GetBrainTools()
	if err == nil {
		systemPrompt, err := c.GetBrainSystemPrompt(prompt)
		if err == nil {
			a.SetBrainContext(systemPrompt, brainTools, &brainToolAdapter{client: c, channelCtx: channelCtx})
		}
	}

	// Execute the task via the agent (agentic loop with local + brain tools)
	events := make(chan agent.Event, 256)
	go a.Send(prompt, events)

	var resultParts []string
	var uploadedKeys []string // storageKeys from upload_file calls
	sentKeys := make(map[string]bool) // storageKeys already sent via send_telegram_file
	for ev := range events {
		switch ev.Type {
		case agent.EventToken:
			// Accumulate response tokens
			resultParts = append(resultParts, ev.Data)
		case agent.EventToolStart:
			var info map[string]any
			_ = json.Unmarshal([]byte(ev.Data), &info)
			toolName, _ := info["name"].(string)
			fmt.Printf("    \033[2m🔧 %s\033[0m\n", toolName)
			// Track send_telegram_file calls to avoid double-sending
			if toolName == "send_telegram_file" {
				if argsRaw, ok := info["args"].(map[string]any); ok {
					if sk, ok := argsRaw["storageKey"].(string); ok {
						sentKeys[sk] = true
					}
				}
			}
		case agent.EventToolEnd:
			// Track uploaded files so we can auto-send them if the LLM forgets
			var info map[string]any
			if err := json.Unmarshal([]byte(ev.Data), &info); err == nil {
				if name, _ := info["name"].(string); name == "upload_file" {
					if resultStr, ok := info["result"].(string); ok {
						var res map[string]any
						if json.Unmarshal([]byte(resultStr), &res) == nil {
							if sk, ok := res["storageKey"].(string); ok {
								uploadedKeys = append(uploadedKeys, sk)
							}
						}
					}
				}
			}
		case agent.EventError:
			fmt.Printf("  \033[31m✗ Agent error: %s\033[0m\n", ev.Data)
			_ = c.SubmitAgentTaskResult(taskID, ev.Data, false, nil)
			return
		case agent.EventDone:
			// Done
		}
	}

	result := strings.Join(resultParts, "")
	if result == "" {
		result = "(no output)"
	}

	// Collect unsent attachments (uploaded but not sent via send_telegram_file)
	var unsentAttachments []string
	for _, sk := range uploadedKeys {
		if !sentKeys[sk] {
			unsentAttachments = append(unsentAttachments, sk)
		}
	}

	// Submit result back to server (with unsent attachments for auto-delivery)
	if err := c.SubmitAgentTaskResult(taskID, result, true, unsentAttachments); err != nil {
		fmt.Printf("  \033[31m✗ Failed to submit result: %s\033[0m\n", err)
		return
	}

	fmt.Printf("  \033[32m✓ Task %s completed\033[0m — %s\n\n", taskID[:8], truncate(result, 60))
}

func truncate(s string, max int) string {
	if len(s) > max {
		return s[:max] + "..."
	}
	return s
}

func init() {
	// upCmd is registered in root.go
}
