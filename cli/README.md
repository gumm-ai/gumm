# gumm CLI

Official terminal client for your Gumm brain, built in Go with [Bubble Tea](https://github.com/charmbracelet/bubbletea).

## Build

```bash
# Requires Go 1.23+
make build        # → bin/gumm (from repo root)
make install      # copies to $GOPATH/bin
```

## Quick start

```bash
gumm connect https://your-instance.dev
gumm login
gumm chat              # interactive TUI
gumm chat hello world  # one-shot mode
```

## Commands

| Command                           | Description                  |
| --------------------------------- | ---------------------------- |
| `gumm connect <url>`              | Connect to a Gumm instance   |
| `gumm disconnect`                 | Remove saved connection      |
| `gumm login`                      | Authenticate                 |
| `gumm status`                     | Show connection & brain info |
| `gumm chat`                       | Interactive TUI (Bubble Tea) |
| `gumm chat <msg>`                 | One-shot message             |
| `gumm conversations`              | List recent conversations    |
| `gumm logs`                       | Stream live brain events     |
| `gumm modules`                    | List installed modules       |
| `gumm modules install owner/repo` | Install from GitHub          |
| `gumm modules reload`             | Force-reload modules         |
| `gumm brain config`               | Show brain config            |
| `gumm brain config-set KEY VAL`   | Update config entry          |
| `gumm brain stats`                | Show statistics              |
| `gumm brain memory`               | List memories                |

## Chat TUI

The interactive `gumm chat` launches a Bubble Tea TUI with:

- Streaming token display (opencode/crush style)
- Tool execution with live status indicators
- Viewport scrollback for long conversations
- Keyboard: `Enter` send, `Ctrl+C` quit, `Ctrl+L` clear

Local tools available to the AI: open URLs, open apps, run shell commands, read/write files, screenshots, list directories.

## Config

Connection stored in `~/.gumm/config.json` (mode 600).
