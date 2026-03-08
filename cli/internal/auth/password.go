package auth

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"regexp"
	"strings"
	"syscall"

	"golang.org/x/term"
)

// AuthResult contains the authentication result
type AuthResult struct {
	Token    string // Session cookie
	Password string // Password for auto-refresh
}

// PasswordAuth handles password-based authentication for NetBird reverse proxy.
// It prompts for a password, submits it to the auth endpoint, and returns the session cookie and password.
func PasswordAuth(targetURL string) (*AuthResult, error) {
	fmt.Println("\n🔐 Password Authentication")
	fmt.Println()

	// Prompt for password (hidden input)
	password, err := promptPassword("Enter password: ")
	if err != nil {
		return nil, fmt.Errorf("failed to read password: %w", err)
	}

	if password == "" {
		return nil, fmt.Errorf("authentication cancelled")
	}

	fmt.Println()
	fmt.Println("🔄 Authenticating...")

	// Create a cookie jar to capture session cookies
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create cookie jar: %w", err)
	}

	client := &http.Client{
		Jar: jar,
		// Don't follow redirects automatically so we can capture cookies
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	// First, try to discover the auth endpoint by fetching the login page
	authEndpoint, err := discoverAuthEndpoint(client, targetURL)
	if err != nil {
		// Fall back to common NetBird auth endpoint
		authEndpoint = targetURL + "/_netbird/auth/password"
	}

	// Submit password to auth endpoint
	form := url.Values{}
	form.Set("password", password)

	req, err := http.NewRequest("POST", authEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to create auth request: %w", err)
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Origin", targetURL)
	req.Header.Set("Referer", targetURL)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("auth request failed: %w", err)
	}
	defer resp.Body.Close()

	// Check if authentication was successful
	// NetBird typically returns a redirect on success with session cookie
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed: invalid password")
	}

	// Extract cookies from the jar
	parsedURL, err := url.Parse(targetURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse URL: %w", err)
	}

	cookies := jar.Cookies(parsedURL)
	if len(cookies) == 0 {
		// Also check response cookies directly
		cookies = resp.Cookies()
	}

	if len(cookies) == 0 {
		return nil, fmt.Errorf("no session cookie received - authentication may have failed")
	}

	// Build cookie string
	var cookieParts []string
	for _, c := range cookies {
		cookieParts = append(cookieParts, c.Name+"="+c.Value)
	}

	return &AuthResult{
		Token:    strings.Join(cookieParts, "; "),
		Password: password,
	}, nil
}

// discoverAuthEndpoint tries to find the password auth endpoint from the login page
func discoverAuthEndpoint(client *http.Client, targetURL string) (string, error) {
	resp, err := client.Get(targetURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	// If we get a redirect, the auth page might be elsewhere
	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		location := resp.Header.Get("Location")
		if location != "" {
			// Parse and follow the redirect to find the form
			redirectURL, err := url.Parse(location)
			if err == nil {
				if !redirectURL.IsAbs() {
					base, _ := url.Parse(targetURL)
					redirectURL = base.ResolveReference(redirectURL)
				}
				return discoverFromLoginPage(client, redirectURL.String(), targetURL)
			}
		}
	}

	return discoverFromLoginPage(client, targetURL, targetURL)
}

func discoverFromLoginPage(client *http.Client, loginURL, baseURL string) (string, error) {
	// Temporarily allow redirects
	oldRedirect := client.CheckRedirect
	client.CheckRedirect = nil
	defer func() { client.CheckRedirect = oldRedirect }()

	resp, err := client.Get(loginURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	// Look for form action in the HTML
	// Common patterns: action="/_netbird/auth/password" or action="/auth/password"
	formActionRegex := regexp.MustCompile(`<form[^>]*action=["']([^"']+)["'][^>]*>`)
	matches := formActionRegex.FindStringSubmatch(string(body))
	if len(matches) > 1 {
		action := matches[1]
		if !strings.HasPrefix(action, "http") {
			// Relative URL - resolve against base
			base, _ := url.Parse(baseURL)
			rel, _ := url.Parse(action)
			return base.ResolveReference(rel).String(), nil
		}
		return action, nil
	}

	// Also try looking for common NetBird patterns
	patterns := []string{
		"/_netbird/auth/password",
		"/_netbird/auth",
		"/auth/password",
	}

	for _, pattern := range patterns {
		if strings.Contains(string(body), pattern) {
			base, _ := url.Parse(baseURL)
			rel, _ := url.Parse(pattern)
			return base.ResolveReference(rel).String(), nil
		}
	}

	return "", fmt.Errorf("could not discover auth endpoint")
}

// promptPassword prompts for password with hidden input
func promptPassword(prompt string) (string, error) {
	fmt.Print(prompt)

	// Check if stdin is a terminal
	fd := int(syscall.Stdin)
	if term.IsTerminal(fd) {
		// Read password without echo
		passwordBytes, err := term.ReadPassword(fd)
		fmt.Println() // Add newline after hidden input
		if err != nil {
			return "", err
		}
		return string(passwordBytes), nil
	}

	// Fall back to regular input (for piped input)
	reader := bufio.NewReader(os.Stdin)
	password, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(password), nil
}
