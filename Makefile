BINARY=gumm
VERSION=$(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
CLI_DIR=cli

.PHONY: build install uninstall clean dev build-all publish publish-dry pull-public pull-public-dry

# --- CLI (Go) ---
# Find Go binary (check common install locations)
GO_BIN := $(shell command -v go 2>/dev/null || (test -x /usr/local/go/bin/go && echo /usr/local/go/bin/go))

build:
	@if [ -n "$(GO_BIN)" ]; then \
		cd $(CLI_DIR) && $(GO_BIN) build -ldflags "-s -w" -o ../bin/$(BINARY) .; \
	elif command -v docker >/dev/null 2>&1; then \
		echo "Go not found, building with Docker..."; \
		docker run --rm -v "$(PWD)":/app -w /app/cli golang:1.23-alpine \
			go build -ldflags "-s -w" -o ../bin/$(BINARY) .; \
	else \
		echo "Error: Neither Go nor Docker found. Install one of them to build the CLI."; \
		exit 1; \
	fi

install: build
	@if [ -d /usr/local/bin ]; then \
		sudo cp bin/$(BINARY) /usr/local/bin/$(BINARY) && echo "Installed to /usr/local/bin/$(BINARY)"; \
	elif [ -d "$(GOPATH)/bin" ]; then \
		cp bin/$(BINARY) $(GOPATH)/bin/$(BINARY) && echo "Installed to $(GOPATH)/bin/$(BINARY)"; \
	elif [ -d ~/go/bin ]; then \
		cp bin/$(BINARY) ~/go/bin/$(BINARY) && echo "Installed to ~/go/bin/$(BINARY)"; \
	else \
		echo "Could not find install location. Binary at: bin/$(BINARY)"; \
	fi

uninstall:
	rm -f $(GOPATH)/bin/$(BINARY) ~/go/bin/$(BINARY) ~/.bun/bin/$(BINARY) /usr/local/bin/$(BINARY)
	rm -rf bin/

dev:
	@if [ -n "$(GO_BIN)" ]; then \
		cd $(CLI_DIR) && $(GO_BIN) run .; \
	else \
		echo "Go not found. Install Go or use 'make build' for Docker fallback."; \
		exit 1; \
	fi

clean:
	rm -rf bin/

# Cross-compile (requires Go)
build-all:
	@if [ -z "$(GO_BIN)" ]; then echo "Error: Go is required for cross-compilation."; exit 1; fi
	cd $(CLI_DIR) && GOOS=darwin GOARCH=arm64 $(GO_BIN) build -ldflags "-s -w" -o ../bin/$(BINARY)-darwin-arm64 .
	cd $(CLI_DIR) && GOOS=darwin GOARCH=amd64 $(GO_BIN) build -ldflags "-s -w" -o ../bin/$(BINARY)-darwin-amd64 .
	cd $(CLI_DIR) && GOOS=linux GOARCH=amd64 $(GO_BIN) build -ldflags "-s -w" -o ../bin/$(BINARY)-linux-amd64 .
	cd $(CLI_DIR) && GOOS=linux GOARCH=arm64 $(GO_BIN) build -ldflags "-s -w" -o ../bin/$(BINARY)-linux-arm64 .

# --- Publish to public repo ---
publish:
	@bash scripts/publish.sh push

publish-dry:
	@bash scripts/publish.sh push --dry-run

pull-public:
	@bash scripts/publish.sh pull

pull-public-dry:
	@bash scripts/publish.sh pull --dry-run
