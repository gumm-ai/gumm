package agent

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"
)

const (
	EventToken     = "token"
	EventToolStart = "tool_start"
	EventToolEnd   = "tool_end"
	EventError     = "error"
	EventDone      = "done"
)

type Event struct {
	Type string
	Data string
}

type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function ToolCallFunc `json:"function"`
}

type ToolCallFunc struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type Message struct {
	Role       string     `json:"role"`
	Content    string     `json:"content,omitempty"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

// BrainToolExecutor handles remote execution of Brain tools (builtin + modules).
type BrainToolExecutor interface {
	Execute(toolName string, args map[string]any) (string, error)
}

type Agent struct {
	apiKey        string
	model         string
	messages      []Message
	tools         []map[string]any
	executor      *ToolExecutor
	brainExecutor BrainToolExecutor
	localTools    map[string]bool // tracks which tools are local
}

func New(apiKey, model, brainName string) *Agent {
	homeDir, _ := os.UserHomeDir()
	systemPrompt := fmt.Sprintf(
		"You are %s, a personal AI assistant running in a "+
			"terminal on the user's local machine.\n\n"+
			"## System info\n"+
			"- OS: %s\n"+
			"- Home directory: %s\n\n"+
			"You have direct access to the user's computer. "+
			"Available capabilities:\n"+
			"- Open URLs in the default browser\n"+
			"- Open applications\n"+
			"- Run shell commands (user must confirm)\n"+
			"- Read and write files\n"+
			"- Take screenshots of the screen\n"+
			"- List directory contents\n"+
			"- Upload files to server storage (for Telegram, etc.)\n\n"+
			"Guidelines:\n"+
			"- Be concise — you are in a terminal.\n"+
			"- Use tools proactively when the user asks for "+
			"actions on their computer.\n"+
			"- For shell commands, briefly explain what you "+
			"will run.\n"+
			"- When reading files or directories, summarize "+
			"key information.\n"+
			"- Think step by step for complex tasks.\n"+
			"- Always use the correct home directory from System info above "+
			"when the user refers to personal folders (Downloads, Desktop, Documents, etc.).\n"+
			"- When searching for files, be thorough: use case-insensitive search, "+
			"search for related terms and variations (e.g. if asked for 'pokemon', "+
			"also search for 'pikachu', 'charizard', etc.), and use wildcards.\n"+
			"- When asked to send files to Telegram: find the file, upload it with "+
			"upload_file, then send it with send_telegram_file using the storageKey.\n",
		brainName, runtime.GOOS, homeDir,
	)

	localToolDefs := GetToolDefinitions()
	localToolNames := make(map[string]bool)
	for _, t := range localToolDefs {
		if fn, ok := t["function"].(map[string]any); ok {
			if name, ok := fn["name"].(string); ok {
				localToolNames[name] = true
			}
		}
	}

	return &Agent{
		apiKey:     apiKey,
		model:      model,
		executor:   NewToolExecutor(),
		tools:      localToolDefs,
		localTools: localToolNames,
		messages: []Message{
			{Role: "system", Content: systemPrompt},
		},
	}
}

// SetUploader configures the agent's file upload capability.
func (a *Agent) SetUploader(uploader FileUploader) {
	a.executor.SetUploader(uploader)
}

// SetBrainContext configures the agent with Brain system prompt and tools.
// The Brain system prompt replaces the default hardcoded prompt.
// Brain tools are merged with local CLI tools.
func (a *Agent) SetBrainContext(systemPrompt string, brainTools []map[string]any, executor BrainToolExecutor) {
	// Replace system prompt with Brain's dynamic prompt, appending CLI capabilities
	homeDir, _ := os.UserHomeDir()
	cliAddendum := fmt.Sprintf(
		"\n\n## Local machine access (CLI)\n"+
			"You also have direct access to the user's computer terminal. "+
			"You can open URLs, open applications, run shell commands, "+
			"read/write files, take screenshots, list directories, and upload files.\n"+
			"Be concise — you are in a terminal. Use tools proactively.\n\n"+
			"## File search best practices\n"+
			"When searching for files, be thorough:\n"+
			"- Use case-insensitive search (e.g. `find ... -iname`)\n"+
			"- Search for related terms, not just the exact query. For example, if asked for 'pokemon', also search for character names like 'pikachu', 'charizard', etc.\n"+
			"- Use broad patterns with wildcards: `*pokemon*`, `*pikachu*`\n"+
			"- Search common directories: Downloads, Desktop, Documents, Pictures\n\n"+
			"## Sending files to Telegram\n"+
			"When the user wants a file sent to Telegram:\n"+
			"1. Find the file on the local machine\n"+
			"2. Upload it using the `upload_file` tool (returns a storageKey)\n"+
			"3. Send it to Telegram using the `send_telegram_file` brain tool with that storageKey\n"+
			"Always complete all 3 steps in sequence. Do NOT just describe the file — actually send it.\n\n"+
			"## System info\n"+
			"- OS: %s\n"+
			"- Home directory: %s\n"+
			"Always use the correct home directory when the user refers to personal folders "+
			"(Downloads, Desktop, Documents, etc.).",
		runtime.GOOS, homeDir,
	)

	if len(a.messages) > 0 && a.messages[0].Role == "system" {
		a.messages[0].Content = systemPrompt + cliAddendum
	}

	// Merge brain tools with local tools (local tools take precedence on name conflict).
	// Exclude execute_on_cli to prevent the CLI agent from recursively delegating to itself.
	merged := make([]map[string]any, 0, len(a.tools)+len(brainTools))
	merged = append(merged, a.tools...) // local tools first

	for _, bt := range brainTools {
		if fn, ok := bt["function"].(map[string]any); ok {
			if name, ok := fn["name"].(string); ok {
				if name == "execute_on_cli" {
					continue
				}
				if !a.localTools[name] {
					merged = append(merged, bt)
				}
			}
		}
	}
	a.tools = merged
	a.brainExecutor = executor
}

// ToolCount returns the total number of tools available (local + brain).
func (a *Agent) ToolCount() int {
	return len(a.tools)
}

func (a *Agent) LoadHistory(history []Message) {
	for _, m := range history {
		if (m.Role == "user" || m.Role == "assistant") && m.Content != "" {
			a.messages = append(a.messages, Message{
				Role: m.Role, Content: m.Content,
			})
		}
	}
}

func (a *Agent) Send(userMessage string, events chan<- Event) {
	defer close(events)

	a.messages = append(a.messages, Message{
		Role: "user", Content: userMessage,
	})

	maxRounds := 12
	for round := 0; round < maxRounds; round++ {
		content, toolCalls, err := a.streamLLM(events)
		if err != nil {
			events <- Event{Type: EventError, Data: err.Error()}
			return
		}

		if len(toolCalls) == 0 {
			a.messages = append(a.messages, Message{
				Role: "assistant", Content: content,
			})
			events <- Event{Type: EventDone}
			return
		}

		a.messages = append(a.messages, Message{
			Role:      "assistant",
			Content:   content,
			ToolCalls: toolCalls,
		})

		for _, tc := range toolCalls {
			var args map[string]any
			_ = json.Unmarshal([]byte(tc.Function.Arguments), &args)

			infoJSON, _ := json.Marshal(map[string]any{
				"name": tc.Function.Name, "args": args,
			})
			events <- Event{
				Type: EventToolStart, Data: string(infoJSON),
			}

			var result string
			if a.localTools[tc.Function.Name] {
				// Execute locally on the user's machine
				result = a.executor.Run(tc.Function.Name, args)
			} else if a.brainExecutor != nil {
				// Execute on the Brain server (builtin + module tools)
				var err error
				result, err = a.brainExecutor.Execute(tc.Function.Name, args)
				if err != nil {
					result = fmt.Sprintf(`{"error": "%s"}`, err.Error())
				}
			} else {
				result = fmt.Sprintf(`{"error": "unknown tool: %s"}`, tc.Function.Name)
			}

			resJSON, _ := json.Marshal(map[string]any{
				"name": tc.Function.Name, "result": result,
			})
			events <- Event{
				Type: EventToolEnd, Data: string(resJSON),
			}

			a.messages = append(a.messages, Message{
				Role:       "tool",
				ToolCallID: tc.ID,
				Content:    result,
			})
		}
	}

	events <- Event{
		Type: EventToken,
		Data: "\n⚠ Reached maximum tool iterations.",
	}
	events <- Event{Type: EventDone}
}

func (a *Agent) streamLLM(
	events chan<- Event,
) (string, []ToolCall, error) {
	payload := map[string]any{
		"model":    a.model,
		"messages": a.messages,
		"stream":   true,
	}
	if len(a.tools) > 0 {
		payload["tools"] = a.tools
		payload["tool_choice"] = "auto"
	}

	body, _ := json.Marshal(payload)

	req, err := http.NewRequest(
		"POST",
		"https://openrouter.ai/api/v1/chat/completions",
		bytes.NewReader(body),
	)
	if err != nil {
		return "", nil, err
	}
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", "https://gumm.dev")
	req.Header.Set("X-Title", "Gumm CLI")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return "", nil, fmt.Errorf(
			"OpenRouter error (%d): %s",
			resp.StatusCode, truncStr(string(b), 500),
		)
	}

	var contentParts []string
	tcBuf := make(map[int]*ToolCall)

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		raw := line[6:]
		if strings.TrimSpace(raw) == "[DONE]" {
			break
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content   string `json:"content"`
					ToolCalls []struct {
						Index    int    `json:"index"`
						ID       string `json:"id"`
						Function struct {
							Name      string `json:"name"`
							Arguments string `json:"arguments"`
						} `json:"function"`
					} `json:"tool_calls"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(raw), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) == 0 {
			continue
		}

		delta := chunk.Choices[0].Delta

		if delta.Content != "" {
			contentParts = append(contentParts, delta.Content)
			events <- Event{Type: EventToken, Data: delta.Content}
		}

		for _, tcd := range delta.ToolCalls {
			if _, ok := tcBuf[tcd.Index]; !ok {
				tcBuf[tcd.Index] = &ToolCall{Type: "function"}
			}
			tc := tcBuf[tcd.Index]
			if tcd.ID != "" {
				tc.ID = tcd.ID
			}
			if tcd.Function.Name != "" {
				tc.Function.Name += tcd.Function.Name
			}
			if tcd.Function.Arguments != "" {
				tc.Function.Arguments += tcd.Function.Arguments
			}
		}
	}

	content := strings.Join(contentParts, "")

	var toolCalls []ToolCall
	for i := 0; i < len(tcBuf); i++ {
		if tc, ok := tcBuf[i]; ok {
			toolCalls = append(toolCalls, *tc)
		}
	}

	return content, toolCalls, nil
}

func truncStr(s string, max int) string {
	if len(s) > max {
		return s[:max]
	}
	return s
}
