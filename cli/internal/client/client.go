package client

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/gumm-ai/gumm/cli/internal/config"
)

type Client struct {
	baseURL       string
	token         string
	proxyToken    string
	proxyPassword string
	httpClient    *http.Client
	cfg           *config.Config
}

func New(cfg *config.Config) *Client {
	proxyPassword := ""
	if cfg.ProxyPassword != "" {
		// Decode base64 password
		if decoded, err := base64.StdEncoding.DecodeString(cfg.ProxyPassword); err == nil {
			proxyPassword = string(decoded)
		}
	}
	return &Client{
		baseURL:       strings.TrimRight(cfg.URL, "/"),
		token:         cfg.Token,
		proxyToken:    cfg.ProxyToken,
		proxyPassword: proxyPassword,
		cfg:           cfg,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

func (c *Client) headers() http.Header {
	h := http.Header{}
	h.Set("Accept", "application/json")

	// Proxy authentication (for reverse proxy like Netbird SSO)
	if c.proxyToken != "" {
		if strings.Contains(c.proxyToken, "=") {
			// Looks like a cookie value
			h.Set("Cookie", c.proxyToken)
		} else {
			// Treat as bearer token
			h.Set("Authorization", "Bearer "+c.proxyToken)
		}
	}

	// Gumm session authentication
	if c.token != "" {
		// Add to existing cookies if present
		existing := h.Get("Cookie")
		if existing != "" {
			h.Set("Cookie", existing+"; nuxt-session="+c.token)
		} else {
			h.Set("Cookie", "nuxt-session="+c.token)
		}
		h.Set("X-Nuxt-Session-Session", c.token)
	}
	return h
}

// Get performs a GET request and returns parsed JSON.
func (c *Client) Get(path string, params map[string]string) (any, error) {
	u := c.baseURL + path
	if len(params) > 0 {
		v := url.Values{}
		for k, val := range params {
			v.Set(k, val)
		}
		u += "?" + v.Encode()
	}

	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return nil, err
	}
	req.Header = c.headers()
	return c.doJSON(req)
}

// Post performs a POST request with a JSON body.
func (c *Client) Post(path string, body any) (any, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(data)
	}
	req, err := http.NewRequest("POST", c.baseURL+path, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header = c.headers()
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return c.doJSON(req)
}

// Put performs a PUT request with a JSON body.
func (c *Client) Put(path string, body any) (any, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(data)
	}
	req, err := http.NewRequest("PUT", c.baseURL+path, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header = c.headers()
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return c.doJSON(req)
}

// Delete performs a DELETE request.
func (c *Client) Delete(path string) error {
	req, err := http.NewRequest("DELETE", c.baseURL+path, nil)
	if err != nil {
		return err
	}
	req.Header = c.headers()
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return c.checkStatus(resp)
}

// Login authenticates and returns the session token.
func (c *Client) Login(password string) (string, error) {
	body, _ := json.Marshal(map[string]string{"password": password})
	req, err := http.NewRequest("POST", c.baseURL+"/api/auth/login", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 && resp.StatusCode != 302 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("login failed (%d): %s", resp.StatusCode, string(b))
	}

	re := regexp.MustCompile(`nuxt-session=([^;]+)`)
	for _, cookie := range resp.Header.Values("Set-Cookie") {
		if m := re.FindStringSubmatch(cookie); m != nil {
			return m[1], nil
		}
	}
	return "", fmt.Errorf("login succeeded but no session cookie received")
}

// StreamSSE opens an SSE connection and sends each data line to the channel.
func (c *Client) StreamSSE(path string, ch chan<- string) error {
	req, err := http.NewRequest("GET", c.baseURL+path, nil)
	if err != nil {
		return err
	}
	req.Header = c.headers()
	req.Header.Set("Accept", "text/event-stream")

	client := &http.Client{
		Timeout: 0,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		if len(body) > 0 {
			return fmt.Errorf("SSE error (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
		}
		return fmt.Errorf("SSE error (%d)", resp.StatusCode)
	}

	buf := make([]byte, 4096)
	var remainder string
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			text := remainder + string(buf[:n])
			lines := strings.Split(text, "\n")
			remainder = lines[len(lines)-1]
			for _, line := range lines[:len(lines)-1] {
				if strings.HasPrefix(line, "data: ") {
					ch <- line[6:]
				}
			}
		}
		if err != nil {
			close(ch)
			if err == io.EOF {
				return nil
			}
			return err
		}
	}
}

// GetBrainConfig fetches brain config as a flat map.
func (c *Client) GetBrainConfig() (map[string]string, error) {
	data, err := c.Get("/api/brain/config", nil)
	if err != nil {
		return nil, err
	}
	result := make(map[string]string)
	switch v := data.(type) {
	case map[string]any:
		if cfg, ok := v["config"].(map[string]any); ok {
			for k, val := range cfg {
				result[k] = fmt.Sprintf("%v", val)
			}
		}
		if identity, ok := v["identity"].(map[string]any); ok {
			for k, val := range identity {
				result["identity."+k] = fmt.Sprintf("%v", val)
			}
		}
	}
	return result, nil
}

// GetAPIKey fetches the OpenRouter API key and model.
func (c *Client) GetAPIKey() (apiKey, model string, err error) {
	data, err := c.Get("/api/brain/api-key", nil)
	if err != nil {
		return "", "", err
	}
	m, ok := data.(map[string]any)
	if !ok {
		return "", "", fmt.Errorf("unexpected response format")
	}
	if v, ok := m["apiKey"].(string); ok {
		apiKey = v
	}
	if v, ok := m["model"].(string); ok {
		model = v
	}
	return apiKey, model, nil
}

// LLMProxyURL returns the full URL for the server-side LLM proxy endpoint.
func (c *Client) LLMProxyURL() string {
	return c.baseURL + "/api/agent/llm-proxy"
}

// AuthHeaders returns a copy of the client's authentication headers,
// suitable for passing to the Agent's proxy config.
func (c *Client) AuthHeaders() http.Header {
	return c.headers()
}

// GetBrainTools fetches all tool definitions from the Brain (builtin + modules).
func (c *Client) GetBrainTools() ([]map[string]any, error) {
	data, err := c.Get("/api/brain/tools", nil)
	if err != nil {
		return nil, err
	}
	m, ok := data.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}
	toolsRaw, ok := m["tools"].([]any)
	if !ok {
		return nil, fmt.Errorf("no tools in response")
	}
	var tools []map[string]any
	for _, t := range toolsRaw {
		if tm, ok := t.(map[string]any); ok {
			tools = append(tools, tm)
		}
	}
	return tools, nil
}

// ExecuteBrainTool executes a Brain tool on the server and returns the result.
func (c *Client) ExecuteBrainTool(toolName string, args map[string]any) (string, error) {
	return c.ExecuteBrainToolWithContext(toolName, args, nil)
}

// ExecuteBrainToolWithContext executes a Brain tool with optional channel context.
// This ensures brain tools like send_telegram_file deliver to the right chat.
func (c *Client) ExecuteBrainToolWithContext(toolName string, args map[string]any, channelCtx map[string]any) (string, error) {
	payload := map[string]any{
		"tool": toolName,
		"args": args,
	}
	if channelCtx != nil {
		payload["channelCtx"] = channelCtx
	}
	data, err := c.Post("/api/brain/tools", payload)
	if err != nil {
		return "", err
	}
	m, ok := data.(map[string]any)
	if !ok {
		return "", fmt.Errorf("unexpected response format")
	}
	if result, ok := m["result"].(string); ok {
		return result, nil
	}
	b, _ := json.Marshal(m["result"])
	return string(b), nil
}

// GetBrainSystemPrompt fetches the Brain's dynamic system prompt for a given query.
func (c *Client) GetBrainSystemPrompt(query string) (string, error) {
	data, err := c.Post("/api/brain/system-prompt", map[string]any{
		"query": query,
	})
	if err != nil {
		return "", err
	}
	m, ok := data.(map[string]any)
	if !ok {
		return "", fmt.Errorf("unexpected response format")
	}

	prompt, _ := m["systemPrompt"].(string)

	// Append relevant memories if present
	if memories, ok := m["memories"].([]any); ok && len(memories) > 0 {
		prompt += "\n\n## Relevant memories\n"
		for _, mem := range memories {
			if mm, ok := mem.(map[string]any); ok {
				key, _ := mm["key"].(string)
				value := fmt.Sprintf("%v", mm["value"])
				prompt += fmt.Sprintf("- %s: %s\n", key, value)
			}
		}
	}

	return prompt, nil
}

// StreamAgentTasks opens an SSE connection to receive agent tasks from the server.
// Each data line is sent to the channel. The caller should parse JSON from each message.
// deviceID is the stable ID of this machine — the server uses it to filter targeted tasks.
func (c *Client) StreamAgentTasks(ch chan<- string, deviceID string) error {
	path := "/api/agent/tasks/stream"
	if deviceID != "" {
		path += "?deviceId=" + deviceID
	}
	return c.StreamSSE(path, ch)
}

// ClaimAgentTask claims a pending agent task for execution.
func (c *Client) ClaimAgentTask(taskId string) error {
	_, err := c.Post("/api/agent/tasks/"+taskId+"/claim", nil)
	return err
}

// TaskClaimResult holds metadata returned when claiming a task.
type TaskClaimResult struct {
	Channel        string
	ChatId         float64
	ConversationId string
}

// ClaimAgentTaskFull claims a task and returns channel metadata.
func (c *Client) ClaimAgentTaskFull(taskId string) (*TaskClaimResult, error) {
	data, err := c.Post("/api/agent/tasks/"+taskId+"/claim", nil)
	if err != nil {
		return nil, err
	}
	m, ok := data.(map[string]any)
	if !ok {
		return &TaskClaimResult{Channel: "web"}, nil
	}
	result := &TaskClaimResult{}
	if v, ok := m["channel"].(string); ok {
		result.Channel = v
	}
	if v, ok := m["chatId"].(float64); ok {
		result.ChatId = v
	}
	if v, ok := m["conversationId"].(string); ok {
		result.ConversationId = v
	}
	return result, nil
}

// SubmitAgentTaskResult sends the result of a completed agent task.
// attachments contains storageKeys of files uploaded but not yet sent to Telegram.
func (c *Client) SubmitAgentTaskResult(taskId, result string, success bool, attachments []string) error {
	payload := map[string]any{
		"result":  result,
		"success": success,
	}
	if len(attachments) > 0 {
		payload["attachments"] = attachments
	}
	_, err := c.Post("/api/agent/tasks/"+taskId+"/result", payload)
	return err
}

// PendingTask represents a task returned by the pending-tasks endpoint.
type PendingTask struct {
	ID      string `json:"id"`
	Prompt  string `json:"prompt"`
	Channel string `json:"channel"`
}

// GetPendingTasks fetches all pending agent tasks via REST (polling fallback).
// deviceID is used to filter tasks: returns tasks targeting this device + untagged tasks.
func (c *Client) GetPendingTasks(deviceID string) ([]PendingTask, error) {
	params := map[string]string{"status": "pending"}
	if deviceID != "" {
		params["deviceId"] = deviceID
	}
	data, err := c.Get("/api/agent/tasks", params)
	if err != nil {
		return nil, err
	}
	m, ok := data.(map[string]any)
	if !ok {
		return nil, nil
	}
	tasksRaw, ok := m["tasks"].([]any)
	if !ok {
		return nil, nil
	}
	var tasks []PendingTask
	for _, t := range tasksRaw {
		tm, ok := t.(map[string]any)
		if !ok {
			continue
		}
		task := PendingTask{}
		if v, ok := tm["id"].(string); ok {
			task.ID = v
		}
		if v, ok := tm["prompt"].(string); ok {
			task.Prompt = v
		}
		if v, ok := tm["channel"].(string); ok {
			task.Channel = v
		}
		if task.ID != "" {
			tasks = append(tasks, task)
		}
	}
	return tasks, nil
}

func (c *Client) doJSON(req *http.Request) (any, error) {
	return c.doJSONWithRetry(req, true)
}

func (c *Client) doJSONWithRetry(req *http.Request, allowRetry bool) (any, error) {
	// Clone request body if present for potential retry
	var bodyBytes []byte
	if req.Body != nil {
		bodyBytes, _ = io.ReadAll(req.Body)
		req.Body = io.NopCloser(bytes.NewReader(bodyBytes))
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if err := c.checkStatus(resp); err != nil {
		// Check if this is a retryable error (session was refreshed)
		if _, ok := err.(*retryableError); ok && allowRetry {
			// Rebuild request with new proxy token
			newReq, err := http.NewRequest(req.Method, req.URL.String(), nil)
			if err != nil {
				return nil, err
			}
			if bodyBytes != nil {
				newReq.Body = io.NopCloser(bytes.NewReader(bodyBytes))
			}
			newReq.Header = c.headers() // Get fresh headers with new token
			for k, v := range req.Header {
				if k != "Cookie" && k != "Authorization" {
					newReq.Header[k] = v
				}
			}
			return c.doJSONWithRetry(newReq, false) // Don't allow infinite retries
		}
		return nil, err
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if len(body) == 0 {
		return nil, fmt.Errorf("empty response from server")
	}

	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "application/json") {
		snippet := string(body)
		if len(snippet) > 200 {
			snippet = snippet[:200]
		}
		return nil, fmt.Errorf("unexpected response (%d, %s): %s", resp.StatusCode, ct, snippet)
	}

	var result any
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}
	return result, nil
}

func (c *Client) checkStatus(resp *http.Response) error {
	if resp.StatusCode == 401 {
		// Try to auto-refresh proxy session if we have a password
		if c.proxyPassword != "" {
			if newToken, err := c.refreshProxySession(); err == nil {
				c.proxyToken = newToken
				// Return a special error to signal retry
				return &retryableError{message: "session refreshed, retry needed"}
			}
		}
		return fmt.Errorf("unauthorized — run 'gumm login' to authenticate")
	}
	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		loc := resp.Header.Get("Location")
		return fmt.Errorf("unexpected redirect (%d) to %s — run 'gumm login'", resp.StatusCode, loc)
	}
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error (%d): %s", resp.StatusCode, string(b))
	}
	return nil
}

// UploadFile uploads a local file to Gumm storage and returns the storageKey.
func (c *Client) UploadFile(localPath string) (string, error) {
	fileData, err := os.ReadFile(localPath)
	if err != nil {
		return "", fmt.Errorf("failed to read file: %w", err)
	}

	filename := filepath.Base(localPath)

	// Build multipart form
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return "", fmt.Errorf("failed to create form: %w", err)
	}
	if _, err := part.Write(fileData); err != nil {
		return "", fmt.Errorf("failed to write file data: %w", err)
	}
	writer.Close()

	req, err := http.NewRequest("POST", c.baseURL+"/api/attachments/upload", &buf)
	if err != nil {
		return "", err
	}
	req.Header = c.headers()
	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Use a longer timeout for file uploads
	uploadClient := &http.Client{Timeout: 120 * time.Second}
	resp, err := uploadClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("upload request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("upload failed (%d): %s", resp.StatusCode, string(b))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read upload response: %w", err)
	}

	var result map[string]any
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("invalid upload response: %w", err)
	}

	storageKey, ok := result["storageKey"].(string)
	if !ok || storageKey == "" {
		return "", fmt.Errorf("no storageKey in upload response")
	}

	return storageKey, nil
}

// DeviceInfo holds metadata about this CLI device for registration.
type DeviceInfo struct {
	DeviceID      string   `json:"deviceId"`
	Name          string   `json:"name"`
	Type          string   `json:"type"` // "cli" or "storage"
	OS            string   `json:"os,omitempty"`
	Arch          string   `json:"arch,omitempty"`
	Version       string   `json:"version,omitempty"`
	Capabilities  []string `json:"capabilities,omitempty"`
	StorageNodeId string   `json:"storageNodeId,omitempty"`
	VpnIp         string   `json:"vpnIp,omitempty"`
	VpnType       string   `json:"vpnType,omitempty"`
	VpnPubkey     string   `json:"vpnPubkey,omitempty"`
	InternalPort  int      `json:"internalPort,omitempty"`
}

// SendDeviceHeartbeat registers or updates this device's status in the brain.
func (c *Client) SendDeviceHeartbeat(info DeviceInfo) error {
	_, err := c.Post("/api/devices/heartbeat", info)
	return err
}

// NetworkStatus represents the VPN network status from the brain.
type NetworkStatus struct {
	Mode         string        `json:"mode"`
	TotalDevices int           `json:"totalDevices"`
	VpnPeers     int           `json:"vpnPeers"`
	OnlinePeers  int           `json:"onlinePeers"`
	Peers        []NetworkPeer `json:"peers"`
}

// NetworkPeer represents a VPN-connected device.
type NetworkPeer struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	VpnIp      string `json:"vpnIp"`
	VpnType    string `json:"vpnType"`
	Status     string `json:"status"`
	LastSeenAt any    `json:"lastSeenAt"`
}

// GetNetworkStatus fetches the current VPN network status.
func (c *Client) GetNetworkStatus() (*NetworkStatus, error) {
	data, err := c.Get("/api/network/status", nil)
	if err != nil {
		return nil, err
	}
	m, ok := data.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}
	status := &NetworkStatus{}
	if v, ok := m["mode"].(string); ok {
		status.Mode = v
	}
	if v, ok := m["totalDevices"].(float64); ok {
		status.TotalDevices = int(v)
	}
	if v, ok := m["vpnPeers"].(float64); ok {
		status.VpnPeers = int(v)
	}
	if v, ok := m["onlinePeers"].(float64); ok {
		status.OnlinePeers = int(v)
	}
	if peers, ok := m["peers"].([]any); ok {
		for _, p := range peers {
			if pm, ok := p.(map[string]any); ok {
				peer := NetworkPeer{}
				if v, ok := pm["id"].(string); ok {
					peer.ID = v
				}
				if v, ok := pm["name"].(string); ok {
					peer.Name = v
				}
				if v, ok := pm["type"].(string); ok {
					peer.Type = v
				}
				if v, ok := pm["vpnIp"].(string); ok {
					peer.VpnIp = v
				}
				if v, ok := pm["vpnType"].(string); ok {
					peer.VpnType = v
				}
				if v, ok := pm["status"].(string); ok {
					peer.Status = v
				}
				peer.LastSeenAt = pm["lastSeenAt"]
				status.Peers = append(status.Peers, peer)
			}
		}
	}
	return status, nil
}

// GetNetworkPeers fetches all VPN-connected peers.
func (c *Client) GetNetworkPeers() ([]NetworkPeer, error) {
	data, err := c.Get("/api/network/peers", nil)
	if err != nil {
		return nil, err
	}
	m, ok := data.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}
	var peers []NetworkPeer
	if peersRaw, ok := m["peers"].([]any); ok {
		for _, p := range peersRaw {
			if pm, ok := p.(map[string]any); ok {
				peer := NetworkPeer{}
				if v, ok := pm["id"].(string); ok {
					peer.ID = v
				}
				if v, ok := pm["name"].(string); ok {
					peer.Name = v
				}
				if v, ok := pm["type"].(string); ok {
					peer.Type = v
				}
				if v, ok := pm["vpnIp"].(string); ok {
					peer.VpnIp = v
				}
				if v, ok := pm["vpnType"].(string); ok {
					peer.VpnType = v
				}
				if v, ok := pm["status"].(string); ok {
					peer.Status = v
				}
				peer.LastSeenAt = pm["lastSeenAt"]
				peers = append(peers, peer)
			}
		}
	}
	return peers, nil
}

// SetupNetwork initializes or changes the VPN networking mode.
func (c *Client) SetupNetwork(mode string, config map[string]string) error {
	payload := map[string]any{
		"mode": mode,
	}
	if config != nil {
		payload["config"] = config
	}
	_, err := c.Post("/api/network/setup", payload)
	return err
}

// retryableError signals that a request should be retried (e.g., after session refresh)
type retryableError struct {
	message string
}

func (e *retryableError) Error() string {
	return e.message
}

// refreshProxySession re-authenticates with the proxy using the stored password
func (c *Client) refreshProxySession() (string, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return "", err
	}

	client := &http.Client{
		Jar: jar,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	// Try common NetBird auth endpoints
	endpoints := []string{
		c.baseURL + "/_netbird/auth/password",
		c.baseURL + "/auth/password",
	}

	form := url.Values{}
	form.Set("password", c.proxyPassword)

	for _, endpoint := range endpoints {
		req, err := http.NewRequest("POST", endpoint, strings.NewReader(form.Encode()))
		if err != nil {
			continue
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Origin", c.baseURL)

		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		resp.Body.Close()

		if resp.StatusCode == 401 || resp.StatusCode == 403 {
			continue
		}

		// Extract cookies
		parsedURL, _ := url.Parse(c.baseURL)
		cookies := jar.Cookies(parsedURL)
		if len(cookies) == 0 {
			cookies = resp.Cookies()
		}

		if len(cookies) > 0 {
			var cookieParts []string
			for _, cookie := range cookies {
				cookieParts = append(cookieParts, cookie.Name+"="+cookie.Value)
			}
			newToken := strings.Join(cookieParts, "; ")

			// Update config file with new token
			if c.cfg != nil {
				c.cfg.ProxyToken = newToken
				_ = config.Save(c.cfg)
			}

			return newToken, nil
		}
	}

	return "", fmt.Errorf("failed to refresh proxy session")
}
