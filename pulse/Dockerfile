# Use a lightweight Node Alpine image
FROM node:20-alpine AS builder

WORKDIR /app

# Core dependancy maps
COPY pulse/package.json ./
COPY pulse/package-lock.json* ./
RUN npm ci

# Source files
COPY pulse/tsconfig.json .
COPY pulse/src ./src
COPY pulse/plugins ./plugins
COPY pulse/drizzle.config.ts .

# Build TS to JS
RUN npm run build

# ==========================================
# Run Stage
# ==========================================
FROM node:20-alpine AS runner

ARG BUILD_VERSION=dev
LABEL org.opencontainers.image.version=$BUILD_VERSION

WORKDIR /app

# Copy isolated dependencies
COPY pulse/package.json ./
COPY pulse/package-lock.json* ./
RUN npm ci --only=production

# Copy compiled resources
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# We need drizzle-kit globally available for runtime migrations in production
RUN npm install drizzle-kit@0.31.9 -g

# Docker CLI so the agent code-sandbox can spin up ephemeral containers via the
# host daemon (socket is mounted + group-added in docker-compose). Docker-out-of-Docker.
RUN apk add --no-cache docker-cli

# Codex CLI — lets an agent run on the ChatGPT/Codex subscription via the codex
# app-server provider (no API key). Auth lives in the mounted CODEX_HOME volume.
RUN npm install -g @openai/codex@0.142.1

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

# Run as non-root user for security
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 pulse
RUN chown -R pulse:nodejs /app
USER pulse

EXPOSE 8080

# Exécute the server (no tsx watcher needed)
# Using 'node' directly for performance
CMD ["node", "dist/src/index.js"]
