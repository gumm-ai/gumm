package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Config holds the CLI connection state.
type Config struct {
	URL           string `json:"url"`
	Token         string `json:"token,omitempty"`
	ProxyToken    string `json:"proxyToken,omitempty"` // Session cookie for reverse proxy auth
	ProxyPassword string `json:"proxyPassword,omitempty"` // Password for auto-refresh (base64 encoded)
}

func configDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".gumm")
}

func configFile() string {
	return filepath.Join(configDir(), "config.json")
}

// Load reads the config from ~/.gumm/config.json.
func Load() (*Config, error) {
	data, err := os.ReadFile(configFile())
	if err != nil {
		return nil, fmt.Errorf(
			"not connected — run 'gumm connect <url>' first",
		)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("corrupted config: %w", err)
	}
	if cfg.URL == "" {
		return nil, fmt.Errorf(
			"not connected — run 'gumm connect <url>' first",
		)
	}
	return &cfg, nil
}

// Save writes the config to ~/.gumm/config.json.
func Save(cfg *Config) error {
	dir := configDir()
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configFile(), data, 0600)
}

// Delete removes the config file.
func Delete() error {
	return os.Remove(configFile())
}
