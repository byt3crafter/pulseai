#!/usr/bin/env node
/**
 * Multi-Gateway Profile CLI — manage isolated Pulse AI instances.
 * Usage: npx tsx src/cli/profile.ts --name <profile> --port <port>
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
    const idx = args.indexOf(`--${name}`);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1];
    return undefined;
}

const profileName = getArg("name");
const port = getArg("port") || "3000";

if (!profileName) {
    console.log(`
Pulse AI Profile Manager

Usage:
  npx tsx src/cli/profile.ts --name <profile> [--port <port>]

Options:
  --name    Profile name (required)
  --port    Port number (default: 3000)

Examples:
  npx tsx src/cli/profile.ts --name staging --port 3002
  npx tsx src/cli/profile.ts --name production --port 3000
`);
    process.exit(1);
}

const profileDir = join(process.cwd(), ".profiles", profileName);
const envFile = join(profileDir, ".env");
const workspaceDir = join(profileDir, "workspaces");
const stateDir = join(profileDir, "state");

if (existsSync(envFile)) {
    console.log(`Profile "${profileName}" already exists at ${profileDir}`);
    console.log(`To start: PORT=${port} npx tsx --env-file=${envFile} src/index.ts`);
    process.exit(0);
}

// Create profile directories
mkdirSync(profileDir, { recursive: true });
mkdirSync(workspaceDir, { recursive: true });
mkdirSync(stateDir, { recursive: true });

// Generate .env template
const envTemplate = `# Pulse AI Profile: ${profileName}
# Generated: ${new Date().toISOString()}

NODE_ENV=development
PORT=${port}
LOG_LEVEL=info

# Copy your database URL here (consider using a separate DB per profile)
DATABASE_URL=postgres://pulseadmin:password@localhost:5432/pulse_${profileName}

# Redis (optional)
# REDIS_URL=redis://localhost:6379/${profileName === "production" ? "0" : "1"}

# API Keys
ANTHROPIC_API_KEY=

# Security
ENCRYPTION_KEY=

# Workspace (isolated per profile)
WORKSPACE_BASE_DIR=${workspaceDir}

# Webhooks
# WEBHOOK_BASE_URL=https://your-domain.com

# Features
GATEWAY_WS_ENABLED=false
BONJOUR_ENABLED=false
`;

writeFileSync(envFile, envTemplate, "utf-8");

console.log(`
Profile "${profileName}" created at ${profileDir}

Files:
  ${envFile}
  ${workspaceDir}/
  ${stateDir}/

Next steps:
  1. Edit ${envFile} with your config
  2. Start: npx tsx --env-file=${envFile} src/index.ts
`);
