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
	Role       string          `json:"role"`
	Content    json.RawMessage `json:"content,omitempty"`
	ToolCalls  []ToolCall      `json:"tool_calls,omitempty"`
	ToolCallID string          `json:"tool_call_id,omitempty"`
}

// TextContent encodes a plain string as a JSON-quoted string for Message.Content.
// Exported so external packages (e.g. cmd/chat.go) can build history messages.
func TextContent(s string) json.RawMessage {
	b, _ := json.Marshal(s)
	return b
}

func textContent(s string) json.RawMessage { return TextContent(s) }

// visionContent creates a multi-modal content array with a text part and an inline PNG image.
func visionContent(text, base64png string) json.RawMessage {
	parts := []map[string]any{
		{"type": "text", "text": text},
		{"type": "image_url", "image_url": map[string]any{
			"url": "data:image/png;base64," + base64png,
		}},
	}
	b, _ := json.Marshal(parts)
	return b
}

// buildToolContent returns the appropriate content for a tool result message.
// For take_screenshot results that contain base64 image data, it returns a
// vision-capable content array so the LLM can actually see the screenshot.
func buildToolContent(toolName, result string) json.RawMessage {
	if toolName == "take_screenshot" {
		var res map[string]any
		if err := json.Unmarshal([]byte(result), &res); err == nil {
			if b64, ok := res["image_base64"].(string); ok && b64 != "" {
				return visionContent(
					"Screenshot captured. Analyze this image to determine what is on screen, identify UI elements, their positions, and decide the next action.",
					b64,
				)
			}
		}
	}
	return textContent(result)
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
	proxyURL      string          // server LLM proxy URL (e.g. https://server/api/agent/llm-proxy)
	proxyHeaders  http.Header     // auth headers for the proxy
}

// SetProxy configures the agent to use a server-side LLM proxy
// instead of calling OpenRouter directly. This avoids sending the
// raw API key to remote CLI agents.
func (a *Agent) SetProxy(proxyURL string, headers http.Header) {
	a.proxyURL = proxyURL
	a.proxyHeaders = headers
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
			"- Run shell commands\n"+
			"- Read and write files\n"+
			"- Take screenshots of the screen (with vision — you SEE the image)\n"+
			"- Browser DOM extraction + JavaScript-based clicking and typing\n"+
			"- Click at screen coordinates, type text, press keyboard shortcuts\n"+
			"- Read browser DOM (interactive elements) and current URL\n"+
			"- Control media playback (play/pause, next, previous) on any app\n"+
			"- Upload files to server storage (for Telegram, etc.)\n\n"+
			"## MANDATORY: Browser preference (ALWAYS DO THIS FIRST)\n"+
			"**BEFORE any browser task**, you MUST determine which browser to use:\n"+
			"1. Call `memory_recall(key: 'preferred_browser')` — check for a saved preference\n"+
			"2. If a preference exists → use that browser for ALL browser operations\n"+
			"3. If NO preference is saved → call `detect_browsers` to list installed browsers, then:\n"+
			"   a. Tell the user: 'J'ai détecté ces navigateurs: [list]. Je recommande [best] pour "+
			"l'automatisation. Lequel tu utilises / préfères ?'\n"+
			"   b. WAIT for their answer — do NOT proceed without it\n"+
			"   c. Save their choice: `memory_remember(key: 'preferred_browser', value: '<browser>')`\n"+
			"NEVER assume a default browser. NEVER skip this step.\n\n"+
			"## Web page automation workflow\n"+
			"Once you have the preferred browser:\n"+
			"1. `open_url(url, browser: '<preferred>')` — opens in the correct browser\n"+
			"2. Wait 2-3 seconds for page to load, then `get_browser_dom(browser: '<preferred>')` → numbered list of interactive elements\n"+
			"3. Identify the element by its text, label, or role\n"+
			"4. `click_browser_element(id, browser: '<preferred>')` — NO coordinate guessing\n"+
			"5. For text input: `type_in_browser(id, text, browser: '<preferred>')`\n"+
			"6. `scroll_browser(browser: '<preferred>')` if needed\n"+
			"7. After each major action, run `get_browser_dom` again for the updated state\n"+
			"ALWAYS pass the `browser` parameter to ALL browser tools: get_browser_dom, click_browser_element, type_in_browser, scroll_browser.\n\n"+
			"## CRITICAL: Complete the full task\n"+
			"Do NOT stop until ALL steps of the task are done (e.g. open page → click button → type text → publish). "+
			"After each action, call get_browser_dom to verify and continue. "+
			"If get_browser_dom fails, wait 3 seconds and retry — the page may still be loading. "+
			"If it fails 3 times, use take_screenshot + click_at as fallback, but still COMPLETE the task.\n\n"+
			"## Browser compatibility\n"+
			"- OS: %s\n"+
			"- On macOS: Full automation with Chrome, Brave, Arc, Edge, Safari (via AppleScript)\n"+
			"- On macOS: Firefox is NOT supported (no AppleScript JS API)\n"+
			"- On Linux/Windows: Browser DOM tools are NOT available. Use take_screenshot + click_at as fallback.\n"+
			"If user picks Firefox on macOS, explain the limitation and suggest a compatible alternative.\n"+
			"If the user gets an error about JavaScript in Apple Events, tell them to enable it:\n"+
			"  macOS (English): View > Developer > Allow JavaScript from Apple Events\n"+
			"  macOS (French): Présentation > Outils pour les développeurs > Autoriser JavaScript dans les événements Apple\n"+
			"  (The menu name adapts to the user's OS language)\n\n"+
			"## Non-browser app interaction\n"+
			"For desktop apps (Finder, etc.), use:\n"+
			"1. Open/focus the app\n"+
			"2. `take_screenshot` → analyze the image to locate UI elements and coordinates\n"+
			"3. `click_at` / `type_text` / `press_key` based on what you see\n"+
			"4. `take_screenshot` again to verify\n"+
			"NEVER guess coordinates without a screenshot first.\n"+
			"Screenshots are auto-scaled to logical resolution — coordinates in the image "+
			"match click_at coordinates directly, regardless of Retina/HiDPI scaling.\n\n"+
			"## Other guidelines\n"+
			"- Be concise — you are in a terminal.\n"+
			"- Use tools proactively when the user asks for actions on their computer.\n"+
			"- Think step by step for complex tasks.\n"+
			"- Always use the correct home directory from System info above "+
			"when the user refers to personal folders (Downloads, Desktop, Documents, etc.).\n"+
			"- When searching for files, be thorough: use case-insensitive search, "+
			"search for related terms and variations (e.g. if asked for 'pokemon', "+
			"also search for 'pikachu', 'charizard', etc.), and use wildcards.\n"+
			"- When asked to send files to Telegram: find the file, upload it with "+
			"upload_file, then send it with send_telegram_file using the storageKey.\n",
		brainName, runtime.GOOS, homeDir, runtime.GOOS,
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
			{Role: "system", Content: textContent(systemPrompt)},
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
			"You also have direct access to the user's computer. "+
			"You can open URLs, open applications, run shell commands, "+
			"read/write files, take screenshots (with vision), list directories, upload files, "+
			"interact with browser pages via DOM extraction and JavaScript clicking/typing, "+
			"click at screen coordinates, type text, press keyboard shortcuts, "+
			"and control media playback on any app.\n\n"+
			"## MANDATORY: Browser preference (ALWAYS DO THIS FIRST)\n"+
			"**BEFORE any browser task**, you MUST determine which browser to use:\n"+
			"1. Call `memory_recall(key: 'preferred_browser')` — check for a saved preference\n"+
			"2. If a preference exists → use that browser for ALL browser operations\n"+
			"3. If NO preference is saved → call `detect_browsers` to list installed browsers, then:\n"+
			"   a. Tell the user: 'J'ai détecté ces navigateurs: [list]. Je recommande [best] pour "+
			"l'automatisation. Lequel tu utilises / préfères ?'\n"+
			"   b. WAIT for their answer — do NOT proceed without it\n"+
			"   c. Save their choice: `memory_remember(key: 'preferred_browser', value: '<browser>')`\n"+
			"NEVER assume a default browser. NEVER skip this step.\n\n"+
			"## Web page automation workflow\n"+
			"Once you have the preferred browser:\n"+
			"1. `open_url(url, browser: '<preferred>')` — opens in the correct browser\n"+
			"2. Wait 2-3 seconds for page to load, then `get_browser_dom(browser: '<preferred>')` → numbered list of interactive elements\n"+
			"3. Identify the element by its text, label, or role\n"+
			"4. `click_browser_element(id, browser: '<preferred>')` — NO coordinate guessing\n"+
			"5. For text input: `type_in_browser(id, text, browser: '<preferred>')`\n"+
			"6. `scroll_browser(browser: '<preferred>')` if needed\n"+
			"7. After each major action, run `get_browser_dom` again for the updated state\n"+
			"ALWAYS pass the `browser` parameter to ALL browser tools: get_browser_dom, click_browser_element, type_in_browser, scroll_browser.\n\n"+
			"## CRITICAL: Complete the full task\n"+
			"Do NOT stop until ALL steps of the task are done (e.g. open page → click button → type text → publish). "+
			"After each action, call get_browser_dom to verify and continue. "+
			"If get_browser_dom fails, wait 3 seconds and retry — the page may still be loading. "+
			"If it fails 3 times, use take_screenshot + click_at as fallback, but still COMPLETE the task.\n\n"+
			"## Browser compatibility\n"+
			"- On macOS: Full automation with Chrome, Brave, Arc, Edge, Safari (via AppleScript)\n"+
			"- On macOS: Firefox is NOT supported (no AppleScript JS API)\n"+
			"- On Linux/Windows: Browser DOM tools (get_browser_dom, click_browser_element, type_in_browser) are NOT available. Use take_screenshot + click_at as fallback.\n"+
			"If user picks Firefox on macOS, explain the limitation and suggest a compatible alternative.\n"+
			"If the user gets an error about JavaScript in Apple Events, tell them to enable it in their browser:\n"+
			"  macOS (English): View > Developer > Allow JavaScript from Apple Events\n"+
			"  macOS (French): Présentation > Outils pour les développeurs > Autoriser JavaScript dans les événements Apple\n"+
			"  (The exact menu name adapts to the user's OS language)\n\n"+
			"## Non-browser app interaction (Finder, etc.)\n"+
			"For desktop apps that are NOT web browsers, use the visual approach:\n"+
			"1. Open/focus the app first\n"+
			"2. `take_screenshot` → analyze the image visually to locate buttons, fields, and their exact coordinates\n"+
			"3. Act: `click_at` / `type_text` / `press_key` based on what you see in the screenshot\n"+
			"4. `take_screenshot` again to confirm the action had the expected effect\n"+
			"NEVER guess or hardcode coordinates — always verify visually first.\n"+
			"Screenshots are automatically scaled to match logical coordinates, so pixel positions "+
			"in the image correspond directly to click_at coordinates regardless of screen resolution, "+
			"Retina/HiDPI scaling, ultra-wide, or multi-monitor setups.\n\n"+
			"## Media & music playback\n"+
			"ONLY use these instructions when the user EXPLICITLY asks to play music or control music playback.\n"+
			"Do NOT play music, open Spotify, or perform any music action unless the user specifically requests it.\n"+
			"When the user asks to play music:\n"+
			"1. If the user asks for a specific genre, mood, artist, or playlist (e.g. 'ambient bvdub', 'chill playlist', 'something by Radiohead'), use `spotify_search` with the appropriate query and type ('playlist', 'track', or 'artist') to find matching results\n"+
			"2. If the user asks vaguely ('play something I like', 'play music'), use `spotify_top_items` or `spotify_recently_played` to understand their taste and pick a track\n"+
			"3. Pick a specific result from step 1 or 2 — don't ask the user, make a smart choice\n"+
			"4. Use `spotify_play` with the URI (track, playlist, or album URI) — this launches and plays it directly, no need to open the app manually\n"+
			"5. Tell the user what you chose and why\n"+
			"NEVER call `spotify_play` without a URI unless the user says 'resume'. NEVER open Spotify manually with open_application — always use the spotify tools instead.\n"+
			"For universal media control (pause, next, volume), use `press_media_key`.\n\n"+
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
		a.messages[0].Content = textContent(systemPrompt + cliAddendum)
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
		if (m.Role == "user" || m.Role == "assistant") && len(m.Content) > 0 {
			a.messages = append(a.messages, Message{
				Role: m.Role, Content: m.Content,
			})
		}
	}
}

func (a *Agent) Send(userMessage string, events chan<- Event) {
	defer close(events)

	a.messages = append(a.messages, Message{
		Role: "user", Content: textContent(userMessage),
	})

	maxRounds := 25
	for round := 0; round < maxRounds; round++ {
		content, toolCalls, err := a.streamLLM(events)
		if err != nil {
			events <- Event{Type: EventError, Data: err.Error()}
			return
		}

		if len(toolCalls) == 0 {
			a.messages = append(a.messages, Message{
				Role: "assistant", Content: textContent(content),
			})
			events <- Event{Type: EventDone}
			return
		}

		a.messages = append(a.messages, Message{
			Role:      "assistant",
			Content:   textContent(content),
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
				Content:    buildToolContent(tc.Function.Name, result),
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

	var req *http.Request
	var err error

	if a.proxyURL != "" {
		// Use server-side LLM proxy — API key stays on the server
		req, err = http.NewRequest("POST", a.proxyURL, bytes.NewReader(body))
		if err != nil {
			return "", nil, err
		}
		req.Header = a.proxyHeaders.Clone()
		req.Header.Set("Content-Type", "application/json")
	} else {
		// Direct call to OpenRouter (localhost / legacy)
		req, err = http.NewRequest(
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
	}

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return "", nil, fmt.Errorf(
			"LLM error (%d): %s",
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
