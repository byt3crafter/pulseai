# Pulse AI - Production Deployment Guide

## Prerequisites

- Ubuntu 22.04+ or similar Linux server
- Docker and Docker Compose installed
- Domain name with DNS configured
- SSL certificate (Let's Encrypt recommended)
- Minimum 2GB RAM, 2 CPU cores, 20GB disk

## Environment Variables

Create a `.env` file with the following required variables:

```bash
# Environment
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database (PostgreSQL)
DATABASE_URL=postgres://pulse:CHANGE_ME@postgres:5432/pulse

# Redis (Required in production)
REDIS_URL=redis://redis:6379

# LLM Providers
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE
OPENAI_API_KEY=sk-proj-YOUR_KEY_HERE  # Fallback provider

# Security
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Webhooks (Production only)
WEBHOOK_BASE_URL=https://your-domain.com
TELEGRAM_WEBHOOK_SECRET=your-secret-token-here

# Logging
LOG_LEVEL=info
```

## Deployment Steps

### 1. Clone Repository

```bash
git clone https://github.com/your-org/pulse-ai.git
cd pulse-ai/pulse
```

### 2. Configure Environment

```bash
cp .env.example .env
nano .env  # Edit with your values
```

**Critical Settings:**
- `ENCRYPTION_KEY`: Generate with `openssl rand -hex 32`
- `WEBHOOK_BASE_URL`: Your public domain (e.g., https://pulse.runstate.mu)
- `TELEGRAM_WEBHOOK_SECRET`: Random secure token
- Database password: Change from default

### 3. Build and Start Services

```bash
# Build and start all services
docker-compose up --build -d

# View logs
docker-compose logs -f pulse

# Check service health
docker-compose ps
```

### 4. Run Database Migrations

```bash
# Enter the container
docker exec -it pulse-backend sh

# Run migrations
npx drizzle-kit push

# Seed demo tenant skills (optional)
psql $DATABASE_URL -f scripts/seed-demo-skills.sql
```

### 5. Create Demo Tenant

```sql
-- Connect to database
psql $DATABASE_URL

-- Create tenant
INSERT INTO tenants (name, slug, config)
VALUES ('Demo Company', 'demo', '{}')
RETURNING id;

-- Create tenant balance (100 credits = $1.00)
INSERT INTO tenant_balances (tenant_id, balance)
VALUES ('TENANT_ID_FROM_ABOVE', 10000);  -- $100 starting balance

-- Create channel connection (replace with your bot token)
INSERT INTO channel_connections (tenant_id, channel_type, channel_config, status)
VALUES (
    'TENANT_ID_FROM_ABOVE',
    'telegram',
    '{"botToken": "YOUR_TELEGRAM_BOT_TOKEN"}',
    'active'
);

-- Enable skills
INSERT INTO tenant_skills (tenant_id, skill_name, enabled)
VALUES
    ('TENANT_ID_FROM_ABOVE', 'get_current_time', true),
    ('TENANT_ID_FROM_ABOVE', 'calculator', true);
```

### 6. Configure Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name pulse.runstate.mu;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name pulse.runstate.mu;

    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/pulse.runstate.mu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pulse.runstate.mu/privkey.pem;

    # Proxy to Pulse AI
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Apply configuration:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 7. Verify Deployment

```bash
# Check health endpoint
curl https://pulse.runstate.mu/health

# Expected response:
# {"status":"ok","version":"1.0.0","uptime":123.45}

# Check logs
docker-compose logs -f pulse | grep "Pulse AI Gateway is running"

# Test webhook endpoint
curl https://pulse.runstate.mu/webhooks/telegram/demo/info
```

### 8. Set Up Telegram Bot

1. Create bot with [@BotFather](https://t.me/BotFather)
2. Get bot token
3. Add to channel_connections table (see step 5)
4. Restart Pulse to activate webhook:
   ```bash
   docker-compose restart pulse
   ```
5. Verify webhook:
   ```bash
   curl https://api.telegram.org/botYOUR_TOKEN/getWebhookInfo
   ```

## Production Checklist

- [ ] Changed default database password
- [ ] Generated secure ENCRYPTION_KEY
- [ ] Set TELEGRAM_WEBHOOK_SECRET
- [ ] Configured WEBHOOK_BASE_URL correctly
- [ ] SSL certificate installed and valid
- [ ] Nginx reverse proxy configured
- [ ] Database migrations applied
- [ ] Demo tenant created with balance
- [ ] Channel connection configured
- [ ] Telegram webhook registered
- [ ] Health endpoint returns 200
- [ ] Test message sent and received
- [ ] Monitoring configured (see MONITORING.md)
- [ ] Backups configured for PostgreSQL
- [ ] Log rotation configured

## Monitoring

```bash
# View application logs
docker-compose logs -f pulse

# View database logs
docker-compose logs -f postgres

# View queue logs
docker-compose logs -f redis

# Check queue stats (enter container)
docker exec -it pulse-redis redis-cli
> LLEN bull:pulse-messages:wait
> LLEN bull:pulse-messages:active
```

## Troubleshooting

### Webhook not receiving messages

```bash
# Check webhook registration
curl https://api.telegram.org/botYOUR_TOKEN/getWebhookInfo

# Expected: url should be https://your-domain.com/webhooks/telegram/TENANT_SLUG

# Re-register webhook manually
docker exec -it pulse-backend node -e "
const bot = new (require('grammy')).Bot('YOUR_BOT_TOKEN');
bot.api.setWebhook('https://your-domain.com/webhooks/telegram/demo');
"
```

### Database connection errors

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Test connection
docker exec -it pulse-postgres psql -U pulse -d pulse -c "SELECT 1;"

# Check DATABASE_URL in .env
docker exec -it pulse-backend printenv DATABASE_URL
```

### Queue not processing

```bash
# Check Redis is running
docker-compose ps redis

# Test Redis connection
docker exec -it pulse-redis redis-cli ping

# Check REDIS_URL in .env
docker exec -it pulse-backend printenv REDIS_URL
```

## Scaling

### Horizontal Scaling (Multiple Workers)

```bash
# Scale worker containers
docker-compose up -d --scale pulse=3

# Each instance will:
# - Share Redis queue
# - Process messages in parallel
# - Share PostgreSQL database
```

### Vertical Scaling (Resources)

Edit `docker-compose.yml`:
```yaml
services:
  pulse:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

## Backup & Recovery

### Database Backup

```bash
# Backup database
docker exec pulse-postgres pg_dump -U pulse pulse > backup-$(date +%Y%m%d).sql

# Restore database
docker exec -i pulse-postgres psql -U pulse pulse < backup-20260224.sql
```

### Automated Backups (Cron)

```bash
# Add to crontab
0 2 * * * /usr/local/bin/backup-pulse.sh

# /usr/local/bin/backup-pulse.sh:
#!/bin/bash
BACKUP_DIR="/var/backups/pulse"
DATE=$(date +%Y%m%d_%H%M%S)
docker exec pulse-postgres pg_dump -U pulse pulse | gzip > "$BACKUP_DIR/pulse_$DATE.sql.gz"
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete
```

## Updates & Maintenance

### Update Application

```bash
# Pull latest code
git pull origin master

# Rebuild and restart
docker-compose up --build -d pulse

# Run new migrations
docker exec -it pulse-backend npx drizzle-kit push
```

### Update Dependencies

```bash
# Update npm packages
docker-compose down
npm update
docker-compose up --build -d
```

## Security Best Practices

1. **Firewall**: Only expose ports 80, 443, and 22
2. **Fail2ban**: Protect against brute force
3. **Regular updates**: Keep system packages updated
4. **Secret rotation**: Rotate API keys and secrets regularly
5. **Access control**: Use SSH keys, disable password auth
6. **Monitoring**: Set up alerts for suspicious activity
7. **Backups**: Test recovery procedures regularly

## Support

- Documentation: `/docs`
- Issues: GitHub Issues
- Logs: `docker-compose logs -f`
