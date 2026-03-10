package cmd

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/spf13/cobra"
)

const (
	ghReleaseAPI = "https://api.github.com/repos/gumm-ai/gumm/releases/latest"
	ghBinaryURL  = "https://github.com/gumm-ai/gumm/releases/download/%s/gumm-%s-%s"
)

var selfUpdateCmd = &cobra.Command{
	Use:   "self-update",
	Short: "Update the gumm CLI to the latest version",
	Long: `Checks GitHub Releases for a newer version of the gumm CLI binary
and replaces the current executable if a newer version is available.

Example:
  gumm self-update          # update to latest
  gumm self-update --check  # just check, don't install`,
	Run: func(cmd *cobra.Command, args []string) {
		checkOnly, _ := cmd.Flags().GetBool("check")
		runSelfUpdate(checkOnly)
	},
}

func init() {
	selfUpdateCmd.Flags().BoolP("check", "c", false, "Only check for updates, do not install")
	rootCmd.AddCommand(selfUpdateCmd)
}

func runSelfUpdate(checkOnly bool) {
	fmt.Println()
	fmt.Printf("  \033[1;35mgumm self-update\033[0m\n\n")

	latestTag, err := fetchLatestReleaseTag()
	if err != nil {
		fatal(fmt.Sprintf("Could not check for updates: %v", err))
	}

	// Normalize: strip leading 'v' for display comparison
	current := strings.TrimPrefix(version, "v")
	latest := strings.TrimPrefix(latestTag, "v")

	fmt.Printf("  Installed : \033[1m%s\033[0m\n", current)
	fmt.Printf("  Latest    : \033[1m%s\033[0m\n", latest)
	fmt.Println()

	if current == latest || current == "dev" && latest == "" {
		fmt.Println("  \033[32m✓ Already up to date.\033[0m")
		fmt.Println()
		return
	}

	if checkOnly {
		fmt.Printf("  \033[33m↑ Update available: %s → %s\033[0m\n", current, latest)
		fmt.Println()
		fmt.Println("  Run \033[1mgumm self-update\033[0m to install it.")
		fmt.Println()
		return
	}

	platform := runtime.GOOS + "/" + runtime.GOARCH
	binaryURL := fmt.Sprintf(ghBinaryURL, latestTag, runtime.GOOS, runtime.GOARCH)

	fmt.Printf("  Downloading %s (%s)...\n", latest, platform)

	execPath, err := os.Executable()
	if err != nil {
		fatal(fmt.Sprintf("Cannot resolve current executable path: %v", err))
	}

	// Resolve symlinks so we replace the actual binary
	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		fatal(fmt.Sprintf("Cannot resolve symlink: %v", err))
	}

	if err := downloadAndReplaceBinary(binaryURL, execPath); err != nil {
		// Give a clear hint if it's a permissions issue
		if os.IsPermission(err) {
			fmt.Fprintf(os.Stderr, "\n  \033[31m✗ Permission denied.\033[0m\n")
			fmt.Fprintf(os.Stderr, "  Try: \033[1msudo gumm self-update\033[0m\n\n")
			os.Exit(1)
		}
		fatal(fmt.Sprintf("Update failed: %v", err))
	}

	fmt.Printf("\n  \033[32m✓ Updated to %s\033[0m\n\n", latest)
}

// fetchLatestReleaseTag queries the GitHub API for the latest release tag_name.
func fetchLatestReleaseTag() (string, error) {
	req, err := http.NewRequest(http.MethodGet, ghReleaseAPI, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "gumm-cli/"+version)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request failed (are you online?): %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return "", fmt.Errorf("no releases found for gumm-ai/gumm")
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API returned HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return "", err
	}

	tag := extractJSONStringValue(string(body), "tag_name")
	if tag == "" {
		return "", fmt.Errorf("could not parse tag_name from GitHub response")
	}
	return tag, nil
}

// downloadAndReplaceBinary downloads url to a temp file in the same directory
// as dest, then atomically renames it into place.
func downloadAndReplaceBinary(url, dest string) error {
	// Validate URL scheme to prevent SSRF — only allow https to github.com
	if !strings.HasPrefix(url, "https://github.com/") {
		return fmt.Errorf("refusing to download from unexpected host: %s", url)
	}

	resp, err := http.Get(url) //nolint:noctx — intentional, user-triggered action
	if err != nil {
		return fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("binary not available for %s/%s — check https://github.com/gumm-ai/gumm/releases",
			runtime.GOOS, runtime.GOARCH)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download returned HTTP %d", resp.StatusCode)
	}

	// Write temp file in the *same directory* as the binary so rename is
	// guaranteed to be on the same filesystem (atomic on POSIX, best-effort on Windows).
	dir := filepath.Dir(dest)
	tmp, err := os.CreateTemp(dir, ".gumm-update-*")
	if err != nil {
		return fmt.Errorf("cannot create temp file in %s: %w", dir, err)
	}
	tmpPath := tmp.Name()

	// Always clean up the temp file on failure
	success := false
	defer func() {
		if !success {
			os.Remove(tmpPath)
		}
	}()

	hasher := sha256.New()
	tee := io.TeeReader(resp.Body, hasher)

	if _, err := io.Copy(tmp, tee); err != nil {
		tmp.Close()
		return fmt.Errorf("write failed: %w", err)
	}
	tmp.Close()

	fmt.Printf("  SHA256    : %s\n", hex.EncodeToString(hasher.Sum(nil)))

	if err := os.Chmod(tmpPath, 0755); err != nil {
		return err
	}

	if err := os.Rename(tmpPath, dest); err != nil {
		return fmt.Errorf("could not replace binary: %w", err)
	}

	success = true
	return nil
}

// extractJSONStringValue is a minimal parser to avoid adding a JSON dependency.
// It finds the first occurrence of `"key": "value"` and returns value.
func extractJSONStringValue(body, key string) string {
	needle := `"` + key + `"`
	idx := strings.Index(body, needle)
	if idx == -1 {
		return ""
	}
	rest := strings.TrimLeft(body[idx+len(needle):], " \t\n\r:")
	if !strings.HasPrefix(rest, `"`) {
		return ""
	}
	rest = rest[1:]
	end := strings.Index(rest, `"`)
	if end == -1 {
		return ""
	}
	return rest[:end]
}
