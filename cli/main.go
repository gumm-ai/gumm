package main

import (
	"os"

	"github.com/gumm-ai/gumm/cli/cmd"
)

func main() {
	if err := cmd.Execute(); err != nil {
		os.Exit(1)
	}
}
