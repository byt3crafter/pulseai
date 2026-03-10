# Pulse AI - How to Deploy to Live Server

The deployment process for Pulse AI is entirely automated through the `scripts/deploy.sh` script located in the `Pulse_AI` root directory.

## Prerequisites
To ensure this works, your local machine needs to have SSH access configured for `pulse-vps` (likely defined in your `~/.ssh/config` pointing to your serverIP with the `root` user).

## How to Deploy
From your local terminal, inside the `Pulse_AI` folder, you can run the following commands based on what you need to deploy:

### Full Deploy
Sync code, run DB migrations, and rebuild all containers:
```bash
./scripts/deploy.sh
```

### Partial Deploys
- **Deploy Dashboard only:**
  ```bash
  ./scripts/deploy.sh --dashboard
  ```
- **Deploy Gateway only:**
  ```bash
  ./scripts/deploy.sh --gateway
  ```

### Advanced Options
- **Sync files only (no container rebuild):**
  ```bash
  ./scripts/deploy.sh --sync-only
  ```
- **Deploy without database migrations:**
  ```bash
  ./scripts/deploy.sh --no-migrate
  ```

## What `deploy.sh` Actually Does Under the Hood:
1. **Pre-flight Checks**: Runs `./scripts/pre-deploy-check.sh` locally to ensure everything is ready for deployment.
2. **File Sync**: Uses `rsync` to sync your local code directly to the VPS (host alias: `pulse-vps`) into the directory `/opt/pulse-ai`. It intentionally ignores folders like `.git`, `node_modules`, `.next`, and data folders.
3. **Dependency Installation**: SSHs into the VPS and runs `npm ci --production` to install backend dependencies.
4. **Database Migrations**: Runs `./scripts/db-migrate.sh --vps` which SSHs into the VPS to apply any pending database updates.
5. **Container Rebuild**: Rebuilds the Docker containers (`pulse-gateway` and/or `pulse-dashboard`) using `docker compose` with the production override file (`docker-compose.prod.yml`).
