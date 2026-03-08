package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/gumm-ai/gumm/cli/internal/client"
	"github.com/gumm-ai/gumm/cli/internal/config"
)

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate with the remote brain",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.Load()
		if err != nil {
			fatal(err.Error())
		}

		fmt.Print("Password: ")
		pwBytes, err := term.ReadPassword(0)
		fmt.Println()
		if err != nil {
			fatal(fmt.Sprintf("Failed to read password: %v", err))
		}
		password := string(pwBytes)
		if password == "" {
			fatal("Password cannot be empty.")
		}

		c := client.New(cfg)
		token, err := c.Login(password)
		if err != nil {
			fatal(err.Error())
		}

		cfg.Token = token
		if err := config.Save(cfg); err != nil {
			fatal(fmt.Sprintf("Failed to save config: %v", err))
		}
		success("Authenticated successfully.")
	},
}
