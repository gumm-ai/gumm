package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

const version = "0.2.0"

var rootCmd = &cobra.Command{
	Use:     "gumm",
	Short:   "gumm — CLI for your personal AI brain",
	Version: version,
}

// Execute runs the root command.
func Execute() error {
	return rootCmd.Execute()
}

func init() {
	rootCmd.AddCommand(connectCmd)
	rootCmd.AddCommand(disconnectCmd)
	rootCmd.AddCommand(loginCmd)
	rootCmd.AddCommand(statusCmd)
	rootCmd.AddCommand(modulesCmd)
	rootCmd.AddCommand(brainCmd)
	rootCmd.AddCommand(chatCmd)
	rootCmd.AddCommand(conversationsCmd)
	rootCmd.AddCommand(logsCmd)
	rootCmd.AddCommand(upCmd)
	rootCmd.AddCommand(storageCmd)
	rootCmd.AddCommand(networkCmd)
}

func fatal(msg string) {
	fmt.Fprintf(os.Stderr, "✗ %s\n", msg)
	os.Exit(1)
}

func success(msg string) {
	fmt.Printf("✓ %s\n", msg)
}

func warn(msg string) {
	fmt.Printf("⚠ %s\n", msg)
}

func info(msg string) {
	fmt.Printf("ℹ %s\n", msg)
}
