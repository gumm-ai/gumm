#!/usr/bin/env bash
# ─── Gumm CLI Installer ─────────────────────────────────────────────────────
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<org>/gumm/main/scripts/install.sh | bash
#
# Supports: macOS (arm64, amd64), Linux (amd64, arm64)
# Installs to /usr/local/bin (or ~/.local/bin if no write access)

set -euo pipefail

REPO="gumm-ai/gumm"
BINARY="gumm"

# ─── Detect OS & Arch ────────────────────────────────────────────────────────

detect_platform() {
  local os arch

  case "$(uname -s)" in
    Linux*)  os="linux" ;;
    Darwin*) os="darwin" ;;
    *)       echo "✗ Unsupported OS: $(uname -s)"; exit 1 ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64)  arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *)             echo "✗ Unsupported architecture: $(uname -m)"; exit 1 ;;
  esac

  echo "${os}-${arch}"
}

# ─── Find install dir ────────────────────────────────────────────────────────

find_install_dir() {
  if [ -w /usr/local/bin ]; then
    echo "/usr/local/bin"
  elif [ -d "$HOME/.local/bin" ] || mkdir -p "$HOME/.local/bin" 2>/dev/null; then
    echo "$HOME/.local/bin"
  else
    echo "✗ Cannot find writable install directory." >&2
    echo "  Run with sudo or create ~/.local/bin" >&2
    exit 1
  fi
}

# ─── Get latest release tag ──────────────────────────────────────────────────

get_latest_version() {
  local url="https://api.github.com/repos/${REPO}/releases/latest"
  local version

  if command -v curl &>/dev/null; then
    version=$(curl -fsSL "$url" 2>/dev/null | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//')
  elif command -v wget &>/dev/null; then
    version=$(wget -qO- "$url" 2>/dev/null | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//')
  fi

  # Fallback: build from source
  if [ -z "${version:-}" ]; then
    echo ""
  else
    echo "$version"
  fi
}

# ─── Download binary from release ────────────────────────────────────────────

download_binary() {
  local version="$1" platform="$2" dest="$3"
  local asset="${BINARY}-${platform}"
  local url="https://github.com/${REPO}/releases/download/${version}/${asset}"

  echo "  Downloading ${BINARY} ${version} (${platform})..."

  local tmp
  tmp=$(mktemp)
  trap "rm -f '$tmp'" EXIT

  if command -v curl &>/dev/null; then
    if ! curl -fsSL -o "$tmp" "$url" 2>/dev/null; then
      return 1
    fi
  elif command -v wget &>/dev/null; then
    if ! wget -qO "$tmp" "$url" 2>/dev/null; then
      return 1
    fi
  else
    echo "✗ Neither curl nor wget found"
    exit 1
  fi

  chmod +x "$tmp"
  mv "$tmp" "${dest}/${BINARY}"
  trap - EXIT
  return 0
}

# ─── Build from source (fallback) ────────────────────────────────────────────

build_from_source() {
  local dest="$1"

  if ! command -v go &>/dev/null; then
    echo "✗ No release found and Go is not installed."
    echo "  Install Go 1.23+ from https://go.dev/dl/ or wait for a release."
    exit 1
  fi

  echo "  No release available — building from source..."

  local tmp
  tmp=$(mktemp -d)
  trap "rm -rf '$tmp'" EXIT

  if ! command -v git &>/dev/null; then
    echo "✗ Git is required to build from source"
    exit 1
  fi

  git clone --depth 1 "https://github.com/${REPO}.git" "$tmp/gumm" 2>/dev/null
  cd "$tmp/gumm/cli"
  go build -ldflags "-s -w" -o "${dest}/${BINARY}" .
  cd - >/dev/null
  trap - EXIT
  rm -rf "$tmp"
}

# ─── Main ─────────────────────────────────────────────────────────────────────

main() {
  echo
  echo "  \033[1;35mgumm\033[0m CLI installer"
  echo

  local platform install_dir version
  platform=$(detect_platform)
  install_dir=$(find_install_dir)
  version=$(get_latest_version)

  if [ -n "$version" ]; then
    if download_binary "$version" "$platform" "$install_dir"; then
      echo
      echo "  \033[32m✓\033[0m Installed ${BINARY} ${version} to ${install_dir}/${BINARY}"
    else
      echo "  Binary not available for ${platform}, falling back to source build..."
      build_from_source "$install_dir"
      echo
      echo "  \033[32m✓\033[0m Built and installed ${BINARY} to ${install_dir}/${BINARY}"
    fi
  else
    build_from_source "$install_dir"
    echo
    echo "  \033[32m✓\033[0m Built and installed ${BINARY} to ${install_dir}/${BINARY}"
  fi

  # Check if install dir is in PATH
  case ":$PATH:" in
    *":${install_dir}:"*) ;;
    *)
      echo
      echo "  \033[33m⚠\033[0m  ${install_dir} is not in your PATH."
      echo "  Add it with:"
      echo "    export PATH=\"${install_dir}:\$PATH\""
      echo "  (Add this to your ~/.bashrc or ~/.zshrc)"
      ;;
  esac

  echo
  echo "  Get started:"
  echo "    gumm connect <your-brain-url>"
  echo "    gumm login"
  echo "    gumm status"
  echo
}

main "$@"
