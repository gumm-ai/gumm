package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/spf13/cobra"

	"github.com/gumm-ai/gumm/cli/internal/client"
	"github.com/gumm-ai/gumm/cli/internal/config"
)

var storageCmd = &cobra.Command{
	Use:   "storage",
	Short: "Manage centralized file storage — the brain's \"stomach\"",
	Long: `Register this device as the centralized file storage for your brain.

When a device runs 'gumm storage serve', it becomes the "stomach" — the central
place where all files from the brain and connected devices are stored.

This is useful for VPS or NAS setups where you want a single, always-on
device to hold all your files (screenshots, uploads, attachments, etc.).`,
}

var storageStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show registered storage nodes",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}
		c := client.New(cfg)

		data, err := c.Get("/api/storage/nodes", nil)
		if err != nil {
			fatal(err.Error())
		}

		m, ok := data.(map[string]any)
		if !ok {
			fatal("Unexpected response format")
		}

		nodes, _ := m["nodes"].([]any)
		if len(nodes) == 0 {
			fmt.Println()
			fmt.Println("  No storage nodes registered.")
			fmt.Println()
			info("Run 'gumm storage register' to designate this device as storage.")
			return
		}

		fmt.Println()
		fmt.Printf("  \033[1;35mgumm\033[0m storage nodes\n\n")
		for _, n := range nodes {
			node, ok := n.(map[string]any)
			if !ok {
				continue
			}
			name, _ := node["name"].(string)
			url, _ := node["url"].(string)
			role, _ := node["role"].(string)
			status, _ := node["status"].(string)
			totalBytes, _ := node["totalBytes"].(float64)
			usedBytes, _ := node["usedBytes"].(float64)

			statusColor := "\033[31m" // red = offline
			if status == "online" {
				statusColor = "\033[32m" // green
			}

			fmt.Printf("  \033[1m%s\033[0m (%s)\n", name, role)
			fmt.Printf("  URL:    %s\n", url)
			fmt.Printf("  Status: %s%s\033[0m\n", statusColor, status)
			if totalBytes > 0 {
				fmt.Printf("  Disk:   %s / %s\n", formatBytes(usedBytes), formatBytes(totalBytes))
			}
			fmt.Println()
		}
	},
}

var storagePort int
var storagePath string

var storageRegisterCmd = &cobra.Command{
	Use:   "register",
	Short: "Register this device as a storage node",
	Long: `Register this device with the brain as a centralized storage node.
After registering, run 'gumm storage serve' to start serving files.`,
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}
		c := client.New(cfg)

		// Determine public URL for this device
		publicURL, _ := cmd.Flags().GetString("url")
		if publicURL == "" {
			publicURL = fmt.Sprintf("http://%s:%d", getOutboundIP(), storagePort)
		}
		publicURL = strings.TrimRight(publicURL, "/")

		name, _ := cmd.Flags().GetString("name")
		if name == "" {
			hostname, _ := os.Hostname()
			if hostname == "" {
				hostname = "storage-node"
			}
			name = hostname
		}

		fmt.Println()
		fmt.Printf("  \033[1;35mgumm\033[0m storage register\n\n")
		fmt.Printf("  Name: %s\n", name)
		fmt.Printf("  URL:  %s\n", publicURL)
		fmt.Println()

		data, err := c.Post("/api/storage/nodes", map[string]any{
			"name": name,
			"url":  publicURL,
		})
		if err != nil {
			fatal(fmt.Sprintf("Failed to register: %v", err))
		}

		m, ok := data.(map[string]any)
		if !ok {
			fatal("Unexpected response from brain")
		}

		token, _ := m["token"].(string)
		nodeID, _ := m["id"].(string)

		// Save storage config locally
		storCfg := &storageConfig{
			NodeID:      nodeID,
			Token:       token,
			StoragePath: storagePath,
			Port:        storagePort,
		}
		if err := saveStorageConfig(storCfg); err != nil {
			fatal(fmt.Sprintf("Node registered but failed to save local config: %v", err))
		}

		success(fmt.Sprintf("Registered as storage node \"%s\"", name))
		fmt.Println()
		info("Token saved to ~/.gumm/storage.json")
		info(fmt.Sprintf("Run 'gumm storage serve' to start (port %d)", storagePort))
		fmt.Println()
	},
}

var storageServeCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the storage server — serve files for the brain",
	Long: `Start the local storage HTTP server. This makes this device the active
file storage ("stomach") for the brain and all connected devices.

Files are stored locally and served to the brain on demand. The brain
proxies file uploads/downloads through this node.

Press Ctrl+C to stop.`,
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}

		storCfg, err := loadStorageConfig()
		if err != nil {
			fatal("Not registered as storage node. Run 'gumm storage register' first.")
		}

		// Override port from flag if provided
		if cmd.Flags().Changed("port") {
			storCfg.Port = storagePort
		}
		if cmd.Flags().Changed("path") {
			storCfg.StoragePath = storagePath
		}

		// Ensure storage directory exists
		absPath, _ := filepath.Abs(storCfg.StoragePath)
		if err := os.MkdirAll(absPath, 0750); err != nil {
			fatal(fmt.Sprintf("Cannot create storage directory: %v", err))
		}

		brainURL := cfg.URL
		token := storCfg.Token

		fmt.Println()
		fmt.Printf("  \033[1;35mgumm\033[0m storage server\n\n")
		fmt.Printf("  \033[2mBrain:   %s\033[0m\n", brainURL)
		fmt.Printf("  \033[2mStorage: %s\033[0m\n", absPath)
		fmt.Printf("  \033[2mPort:    %d\033[0m\n", storCfg.Port)
		fmt.Println()

		// Start heartbeat goroutines
		go heartbeatLoop(brainURL, token, absPath)
		go deviceHeartbeatLoop(client.New(cfg), "storage", storCfg.NodeID, "")

		// Start HTTP server
		mux := http.NewServeMux()
		mux.HandleFunc("/storage/upload", storageUploadHandler(token, absPath))
		mux.HandleFunc("/storage/files/", storageFilesHandler(token, absPath))
		mux.HandleFunc("/storage/health", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"ok":true}`))
		})

		addr := fmt.Sprintf(":%d", storCfg.Port)
		fmt.Printf("  \033[32m✓ Listening on %s\033[0m\n", addr)
		fmt.Println("  \033[2mPress Ctrl+C to stop\033[0m")

		server := &http.Server{
			Addr:         addr,
			Handler:      mux,
			ReadTimeout:  120 * time.Second,
			WriteTimeout: 120 * time.Second,
		}

		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fatal(fmt.Sprintf("Server error: %v", err))
		}
	},
}

var storageRemoveCmd = &cobra.Command{
	Use:   "remove <node-id>",
	Short: "Unregister a storage node from the brain",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}
		c := client.New(cfg)

		nodeID := args[0]

		if err := c.Delete("/api/storage/nodes/" + nodeID); err != nil {
			fatal(fmt.Sprintf("Failed to remove node: %v", err))
		}

		// Also remove local config if it matches
		storCfg, err := loadStorageConfig()
		if err == nil && storCfg.NodeID == nodeID {
			_ = deleteStorageConfig()
		}

		success("Storage node removed.")
	},
}

func init() {
	storageCmd.AddCommand(storageStatusCmd)
	storageCmd.AddCommand(storageRegisterCmd)
	storageCmd.AddCommand(storageServeCmd)
	storageCmd.AddCommand(storageRemoveCmd)

	storageRegisterCmd.Flags().IntVar(&storagePort, "port", 7777, "Port this storage node listens on")
	storageRegisterCmd.Flags().StringVar(&storagePath, "path", "./gumm-storage", "Local directory to store files")
	storageRegisterCmd.Flags().String("url", "", "Public URL of this node (auto-detected if empty)")
	storageRegisterCmd.Flags().String("name", "", "Human-readable name (defaults to hostname)")

	storageServeCmd.Flags().IntVar(&storagePort, "port", 7777, "Port to listen on")
	storageServeCmd.Flags().StringVar(&storagePath, "path", "./gumm-storage", "Local directory to store files")
}

// ─── Storage config (persisted at ~/.gumm/storage.json) ─────────────────────

type storageConfig struct {
	NodeID      string `json:"nodeId"`
	Token       string `json:"token"`
	StoragePath string `json:"storagePath"`
	Port        int    `json:"port"`
}

func storageConfigFile() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".gumm", "storage.json")
}

func saveStorageConfig(cfg *storageConfig) error {
	dir := filepath.Dir(storageConfigFile())
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(storageConfigFile(), data, 0600)
}

func loadStorageConfig() (*storageConfig, error) {
	data, err := os.ReadFile(storageConfigFile())
	if err != nil {
		return nil, err
	}
	var cfg storageConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func deleteStorageConfig() error {
	return os.Remove(storageConfigFile())
}

// ─── Heartbeat to brain ─────────────────────────────────────────────────────

func heartbeatLoop(brainURL, token, storagePath string) {
	httpClient := &http.Client{Timeout: 10 * time.Second}

	for {
		total, used := getDiskUsage(storagePath)
		payload, _ := json.Marshal(map[string]any{
			"totalBytes": total,
			"usedBytes":  used,
		})

		req, err := http.NewRequest("POST", brainURL+"/api/storage/heartbeat", strings.NewReader(string(payload)))
		if err == nil {
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+token)
			resp, err := httpClient.Do(req)
			if err == nil {
				resp.Body.Close()
			}
		}

		time.Sleep(30 * time.Second)
	}
}

// ─── HTTP handlers for storage node ─────────────────────────────────────────

func storageUploadHandler(token, basePath string) http.HandlerFunc {
	var mu sync.Mutex

	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if !checkStorageAuth(r, token) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Parse multipart form (max 100MB)
		if err := r.ParseMultipartForm(100 << 20); err != nil {
			http.Error(w, "Failed to parse form", http.StatusBadRequest)
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "No file in request", http.StatusBadRequest)
			return
		}
		defer file.Close()

		key := r.FormValue("key")
		if key == "" {
			key = fmt.Sprintf("files/%d-%s", time.Now().UnixMilli(), header.Filename)
		}

		// Prevent path traversal
		key = sanitizeKey(key)

		mu.Lock()
		defer mu.Unlock()

		dest := filepath.Join(basePath, key)
		if err := os.MkdirAll(filepath.Dir(dest), 0750); err != nil {
			http.Error(w, "Failed to create directory", http.StatusInternalServerError)
			return
		}

		out, err := os.Create(dest)
		if err != nil {
			http.Error(w, "Failed to create file", http.StatusInternalServerError)
			return
		}
		defer out.Close()

		if _, err := io.Copy(out, file); err != nil {
			http.Error(w, "Failed to write file", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"ok":         true,
			"storageKey": key,
		})
	}
}

func storageFilesHandler(token, basePath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if !checkStorageAuth(r, token) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		key := strings.TrimPrefix(r.URL.Path, "/storage/files/")
		if key == "" {
			http.Error(w, "Key required", http.StatusBadRequest)
			return
		}

		// Prevent path traversal
		key = sanitizeKey(key)

		filePath := filepath.Join(basePath, key)

		info, err := os.Stat(filePath)
		if err != nil || info.IsDir() {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}

		http.ServeFile(w, r, filePath)
	}
}

func checkStorageAuth(r *http.Request, token string) bool {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		return false
	}
	provided := auth[7:]
	// Constant-time comparison to prevent timing attacks
	if len(provided) != len(token) {
		return false
	}
	match := true
	for i := range provided {
		if provided[i] != token[i] {
			match = false
		}
	}
	return match
}

func sanitizeKey(key string) string {
	// Remove path traversal components
	key = strings.ReplaceAll(key, "..", "")
	key = strings.TrimLeft(key, "/")
	return filepath.Clean(key)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func getOutboundIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "localhost"
	}
	defer conn.Close()
	addr := conn.LocalAddr().(*net.UDPAddr)
	return addr.IP.String()
}

func getDiskUsage(path string) (total, used uint64) {
	// Walk directory to calculate used space
	var totalSize uint64
	filepath.Walk(path, func(_ string, finfo os.FileInfo, err error) error {
		if err != nil || finfo == nil {
			return nil
		}
		if !finfo.IsDir() {
			totalSize += uint64(finfo.Size())
		}
		return nil
	})
	return getDiskTotal(path), totalSize
}

func formatBytes(b float64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%.0f B", b)
	}
	div, exp := float64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", b/div, "KMGTPE"[exp])
}


