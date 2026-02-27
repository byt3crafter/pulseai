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

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

# Exécute the server (no tsx watcher needed)
# Using 'node' directly for performance 
CMD ["node", "dist/src/index.js"]
