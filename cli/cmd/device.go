package cmd

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/gumm-ai/gumm/cli/internal/client"
)

// deviceIDFile returns the path to the persistent device ID file.
func deviceIDFile() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".gumm", "device-id")
}

// getOrCreateDeviceID returns a stable device ID for this machine.
// The ID is persisted in ~/.gumm/device-id so it survives restarts.
func getOrCreateDeviceID() string {
	path := deviceIDFile()
	data, err := os.ReadFile(path)
	if err == nil && len(data) > 0 {
		return string(data)
	}

	// Generate a new device ID
	b := make([]byte, 16)
	rand.Read(b)
	id := hex.EncodeToString(b)

	// Persist it
	dir := filepath.Dir(path)
	os.MkdirAll(dir, 0700)
	os.WriteFile(path, []byte(id), 0600)

	return id
}

// deviceHeartbeatLoop sends periodic heartbeats to register this device.
// deviceType is "cli" or "storage". storageNodeId links to a storage node.
func deviceHeartbeatLoop(c *client.Client, deviceType, storageNodeId, cliVersion string) {
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "unknown"
	}

	deviceID := getOrCreateDeviceID()

	capabilities := []string{"agent"}
	if deviceType == "storage" {
		capabilities = []string{"storage"}
	}

	info := client.DeviceInfo{
		DeviceID:      deviceID,
		Name:          hostname,
		Type:          deviceType,
		OS:            runtime.GOOS,
		Arch:          runtime.GOARCH,
		Version:       version,
		Capabilities:  capabilities,
		StorageNodeId: storageNodeId,
	}

	// Detect Tailscale VPN IP if available
	if vpnIp := detectTailscaleIP(); vpnIp != "" {
		info.VpnIp = vpnIp
		info.VpnType = "tailscale"
	} else if vpnIp := detectNetbirdIP(); vpnIp != "" {
		// Fallback to NetBird if Tailscale not connected
		info.VpnIp = vpnIp
		info.VpnType = "netbird"
	}

	// Send first heartbeat immediately
	if err := c.SendDeviceHeartbeat(info); err != nil {
		// Silent — don't block startup
		_ = err
	}

	// Then every 30 seconds
	for {
		time.Sleep(30 * time.Second)
		// Refresh VPN IP (Tailscale/NetBird may connect/disconnect)
		if vpnIp := detectTailscaleIP(); vpnIp != "" {
			info.VpnIp = vpnIp
			info.VpnType = "tailscale"
		} else if vpnIp := detectNetbirdIP(); vpnIp != "" {
			info.VpnIp = vpnIp
			info.VpnType = "netbird"
		} else if info.VpnType == "tailscale" || info.VpnType == "netbird" {
			info.VpnIp = ""
			info.VpnType = ""
		}
		_ = c.SendDeviceHeartbeat(info)
	}
}

// deviceConfigFile returns the path to the device metadata JSON.
func deviceMetadataFile() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".gumm", "device.json")
}

type deviceMetadata struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func saveDeviceMetadata(meta *deviceMetadata) error {
	dir := filepath.Dir(deviceMetadataFile())
	os.MkdirAll(dir, 0700)
	data, _ := json.MarshalIndent(meta, "", "  ")
	return os.WriteFile(deviceMetadataFile(), data, 0600)
}

// detectTailscaleIP returns the Tailscale IPv4 address if available.
func detectTailscaleIP() string {
	// Reuse the macOS-aware helper from network.go (same package)
	return getTailscaleIP()
}

// detectNetbirdIP returns the NetBird IPv4 address if available.
func detectNetbirdIP() string {
	// Reuse the helper from network.go (same package)
	return getNetbirdIP()
}
