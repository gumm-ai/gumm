package auth

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// BrowserSSO opens the browser for SSO authentication and prompts for token entry.
func BrowserSSO(targetURL string) (string, error) {
	fmt.Println("\n📋 SSO Authentication Steps:")
	fmt.Println("1. A browser will open to authenticate with the reverse proxy")
	fmt.Println("2. Complete the SSO login in the browser")
	fmt.Println("3. Once logged in, open Developer Tools (F12) → Network tab")
	fmt.Println("4. Refresh the page and click on any request")
	fmt.Println("5. Copy the 'Cookie' header value from the request headers")
	fmt.Println()

	// Open browser to the target URL
	if err := openBrowser(targetURL); err != nil {
		fmt.Printf("⚠️  Could not open browser automatically: %v\n", err)
		fmt.Printf("Please open this URL manually: %s\n", targetURL)
	} else {
		fmt.Println("🌐 Browser opened. Complete the login, then return here.")
	}

	fmt.Println()
	fmt.Print("Paste the Cookie header value (or press Enter to cancel): ")

	reader := bufio.NewReader(os.Stdin)
	token, err := reader.ReadString('\n')
	if err != nil {
		return "", fmt.Errorf("failed to read input: %w", err)
	}

	token = strings.TrimSpace(token)
	if token == "" {
		return "", fmt.Errorf("authentication cancelled")
	}

	return token, nil
}

func openBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}
	return cmd.Start()
}
