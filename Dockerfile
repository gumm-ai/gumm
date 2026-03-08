FROM oven/bun:alpine

WORKDIR /app

# Timezone support (Alpine doesn't ship tzdata)
# bind-tools provides nslookup/host for DNS resolution
# NOTE: Tailscale/NetBird are NOT installed here.
# VPN should run on the HOST, not in the container, to avoid conflicts.
# The container accepts traffic from Docker internal network when VPN mode is enabled.
RUN apk add --no-cache tzdata curl bind-tools

# Install JS dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build Nuxt (bun preset set in nuxt.config.ts)
RUN bun run build

# Mount point for external user modules
VOLUME /app/modules/user

EXPOSE 3000

COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
