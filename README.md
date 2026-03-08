<p align="center">
  <img src="gumm.png" alt="Gumm" width="120" />
</p>

# Gumm

**Self-hosted personal AI assistant** — modular, extensible, and designed for zero-friction setup.

Website: [gumm.app](https://gumm.app)

> **⚠️ Heavy Development** — Gumm is under active, heavy development. Expect bugs, breaking changes, and hundreds of missing features. Contributions and feedback are very welcome!
>
> Join the community on Discord: [discord.gg/S2FEDCzpxp](https://discord.gg/S2FEDCzpxp)

Gumm runs as a lightweight Docker container (Bun + Nuxt 4 + SQLite) with a hot-swappable module system, long-term memory, and optional Tailscale mesh networking. Control it from the web dashboard or the CLI.

---

## Sponsors

Gumm is free and open-source. If it's useful to you, consider sponsoring its development.

<!-- sponsors -->
<!-- /sponsors -->

---

## Quick Start (VPS / Server)

### Server Requirements

- **RAM:** 4 GB minimum
- **Disk:** 10 GB minimum
- **Recommended provider (EU):** [Skrime.eu](https://skrime.eu/a/gumm)

One command to install everything on a fresh server (Docker, Tailscale, Go, the CLI, and Gumm itself):

```bash
curl -fsSL https://raw.githubusercontent.com/gumm-ai/gumm/main/scripts/setup-server.sh | sudo bash
```

The script handles:

- **System dependencies** (curl, git, openssl, make…)
- **Docker** + Docker Compose
- **Tailscale** (optional mesh networking)
- **Go 1.23+** (to build the CLI)
- **Gumm CLI** (pre-built binary or compiled from source via `make build`)
- **Firewall** rules (UFW / firewalld)
- `.env` generation (admin password, session secret, Redis, timezone)
- Docker image build + service start
- **systemd service** (auto-start on boot)

Supports Ubuntu 20.04+, Debian 11+, CentOS 8+, RHEL 8+, Fedora, Amazon Linux 2.

After install, open the URL shown at the end of the script output to complete the Setup Wizard (assistant name, OpenRouter API key, optional Telegram).

### Uninstall

```bash
sudo bash scripts/setup-server.sh --uninstall
```

---

## Local Development (PC / macOS)

### Prerequisites

| Tool       | Version | Check              |
| ---------- | ------- | ------------------ |
| **Bun**    | 1.1+    | `bun --version`    |
| **Docker** | 20+     | `docker --version` |
| **Go**     | 1.23+   | `go version`       |

### Run locally

```bash
git clone https://github.com/gumm-ai/gumm.git
cd gumm
docker compose up -d --build
```

Dashboard: [http://localhost:3000](http://localhost:3000)

### Dev mode (hot reload)

```bash
bun install
bun run dev
```

---

## CLI

The Gumm CLI lets you manage your brain from any terminal — chat, install modules, browse memory, and more.

### Install

```bash
curl -fsSL https://raw.githubusercontent.com/gumm-ai/gumm/main/scripts/install.sh | bash
```

Or build from source:

```bash
cd gumm
make build    # → bin/gumm
make install  # copies to $GOPATH/bin or ~/go/bin
```

### Usage

```bash
gumm connect http://<your-server>:3000
gumm login
gumm status

gumm chat "What's the weather in Paris?"
gumm modules                         # list installed modules
gumm modules install owner/repo      # install from GitHub
gumm brain memory                    # list memories
gumm logs                            # live events
```

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Docker Container (oven/bun:alpine)             │
│                                                 │
│   Nuxt 4 (SSR) ─── Hono API ─── Nitro          │
│       │                │                        │
│   Dashboard        /api/chat ← LLM (OpenRouter) │
│   (Tailwind)       /api/brain                   │
│                    /api/modules                  │
│                        │                        │
│   SQLite (.data/)    Redis (vector + cache)      │
│                                                 │
│   Tailscale (optional mesh networking)          │
│                                                 │
│   /modules/user/ ← hot-swap modules (volume)    │
└─────────────────────────────────────────────────┘
```

**Runtime:** Bun · **Framework:** Nuxt 4 · **API:** Hono (via Nitro) · **DB:** SQLite (Drizzle ORM) · **Cache:** Redis Stack · **LLM:** OpenRouter · **Auth:** nuxt-auth-utils · **Style:** Tailwind CSS

---

## Project Structure

```
back/           Server — API routes, core logic, database, plugins
front/          Client — pages, components, composables, layouts
modules/
  official/     Built-in modules shipped with Gumm
  user/         User-installed modules (Docker volume)
cli/            CLI source (Go)
scripts/        Install, deploy, setup scripts
```

---

## Acknowledgements

Gumm is built on the shoulders of great open-source projects:

- [Bun](https://bun.sh) — JavaScript runtime & package manager
- [Nuxt](https://nuxt.com) — Full-stack Vue framework
- [Nitro](https://nitro.build) — Server engine powering the API layer
- [Hono](https://hono.dev) — Lightweight web framework for the API routes
- [Drizzle ORM](https://orm.drizzle.team) — TypeScript ORM for SQLite
- [Redis Stack](https://redis.io/docs/stack/) — Vector search & caching
- [OpenRouter](https://openrouter.ai) — Unified LLM API gateway
- [Tailwind CSS](https://tailwindcss.com) — Utility-first CSS framework
- [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils) — Session-based auth for Nuxt
- [Tailscale](https://tailscale.com) — Zero-config mesh networking
- [NetBird](https://netbird.io) — Open-source overlay network
- [Docker](https://docker.com) — Container runtime
- [Go](https://go.dev) — CLI binary language
- [Cobra](https://github.com/spf13/cobra) — CLI framework for Go
- [Telegram Bot API](https://core.telegram.org/bots/api) — Messaging integration

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=gumm-ai/gumm&type=Date)](https://star-history.com/#gumm-ai/gumm&Date)
