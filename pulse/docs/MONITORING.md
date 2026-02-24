# Pulse AI - Monitoring Guide

## Log Levels

Pulse AI uses Pino for structured JSON logging.

**Available Levels:**
- `fatal` - Fatal errors that crash the application
- `error` - Errors that should be investigated
- `warn` - Warnings that don't stop execution
- `info` - General informational messages (default)
- `debug` - Detailed debugging information
- `trace` - Very detailed tracing (not recommended for production)
- `silent` - Disable logging

**Configuration:**
```bash
# .env
LOG_LEVEL=info
```

## Log Format

### Development Mode

Pretty-printed, colorized output:
```
[2026-02-24 15:30:45] INFO: 🤖 Pulse AI Gateway is running on port 3000
[2026-02-24 15:30:46] DEBUG: Telegram bot initialized
  tenantId: "123e4567-e89b-12d3-a456-426614174000"
```

### Production Mode

Structured JSON for log aggregation:
```json
{
  "level": 30,
  "time": 1708790445000,
  "pid": 1,
  "hostname": "pulse-backend",
  "msg": "Telegram bot initialized",
  "tenantId": "123e4567-e89b-12d3-a456-426614174000"
}
```

## Key Log Events

### Startup Events

```json
// Server started
{"level":30,"msg":"🤖 Pulse AI Gateway is running on port 3000"}

// Channels initialized
{"level":30,"msg":"Telegram bot initialized","tenantId":"..."}

// Queue status
{"level":30,"msg":"Message queue enabled - using async processing"}

// Webhooks configured
{"level":30,"msg":"Webhook configured successfully","tenantSlug":"demo"}
```

### Message Processing

```json
// Message received
{"level":20,"msg":"Received Telegram webhook","tenantSlug":"demo"}

// Message enqueued
{"level":20,"msg":"Message enqueued successfully","messageId":"...","tenantId":"..."}

// Message processing
{"level":30,"msg":"Processing message from queue","jobId":"...","messageId":"..."}

// Tool execution
{"level":20,"msg":"Executing tool","toolName":"calculator","args":{"expression":"2+2"}}

// Usage calculated
{"level":30,"msg":"Usage calculated","provider":"anthropic","model":"claude-3-7-sonnet-20250219","inputTokens":150,"outputTokens":50,"costUsd":"0.001200","creditsUsed":"0.1200"}

// Message processed
{"level":30,"msg":"Message processed successfully","jobId":"..."}
```

### Errors

```json
// Tool execution error
{"level":50,"msg":"Tool execution failed","err":{"message":"...","stack":"..."}}

// Provider fallback
{"level":40,"msg":"Primary provider (Anthropic) failed, falling back to OpenAI","err":{"message":"..."}}

// Both providers failed
{"level":50,"msg":"Both primary and fallback providers failed","primaryErr":"...","fallbackErr":"..."}

// Job failed
{"level":50,"msg":"Job failed","jobId":"...","attemptsMade":3,"err":"..."}
```

## Monitoring Metrics

### Application Metrics

```bash
# Health check
curl http://localhost:3000/health

# Response time
time curl http://localhost:3000/health

# Uptime
curl http://localhost:3000/health | jq .uptime
```

### Queue Metrics

```bash
# Connect to Redis
docker exec -it pulse-redis redis-cli

# Waiting jobs
> LLEN bull:pulse-messages:wait

# Active jobs
> LLEN bull:pulse-messages:active

# Failed jobs
> LLEN bull:pulse-messages:failed

# Completed jobs
> LLEN bull:pulse-messages:completed

# Delayed jobs
> LLEN bull:pulse-messages:delayed
```

### Database Metrics

```sql
-- Total messages
SELECT COUNT(*) FROM messages;

-- Messages today
SELECT COUNT(*) FROM messages
WHERE created_at >= CURRENT_DATE;

-- Active conversations
SELECT COUNT(*) FROM conversations
WHERE status = 'active';

-- Usage by tenant (last 24 hours)
SELECT
    t.name,
    COUNT(*) as message_count,
    SUM(ur.input_tokens::numeric) as total_input_tokens,
    SUM(ur.output_tokens::numeric) as total_output_tokens,
    SUM(ur.cost_usd::numeric) as total_cost
FROM usage_records ur
JOIN tenants t ON t.id = ur.tenant_id
WHERE ur.created_at >= NOW() - INTERVAL '24 hours'
GROUP BY t.id, t.name
ORDER BY total_cost DESC;

-- Tenant balances
SELECT
    t.name,
    tb.balance::numeric as credits,
    (tb.balance::numeric / 100) as usd_value
FROM tenant_balances tb
JOIN tenants t ON t.id = tb.tenant_id
ORDER BY tb.balance DESC;

-- Provider usage (last 7 days)
SELECT
    SPLIT_PART(model, ':', 1) as provider,
    COUNT(*) as requests,
    SUM(input_tokens::numeric) as input_tokens,
    SUM(output_tokens::numeric) as output_tokens,
    SUM(cost_usd::numeric) as total_cost
FROM usage_records
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY provider
ORDER BY total_cost DESC;
```

### Container Metrics

```bash
# Container stats
docker stats pulse-backend pulse-postgres pulse-redis

# Logs
docker-compose logs -f --tail=100 pulse

# Container health
docker inspect --format='{{.State.Health.Status}}' pulse-backend
```

## Alerting Scenarios

### Critical Alerts

1. **Service Down**
   - Health endpoint returns non-200
   - Container crashed
   - Action: Restart service, investigate logs

2. **Both Providers Failed**
   - All LLM providers failed
   - Messages stuck in queue
   - Action: Check API keys, provider status

3. **Database Connection Lost**
   - Cannot connect to PostgreSQL
   - Data loss risk
   - Action: Check database health, restore connection

4. **Queue Backed Up**
   - > 100 messages in waiting state
   - Processing delays
   - Action: Scale workers, investigate slow jobs

### Warning Alerts

1. **Provider Fallback Active**
   - Primary provider failing
   - Using fallback provider
   - Action: Investigate Anthropic API issues

2. **Low Tenant Balance**
   - Balance < 100 credits ($1)
   - Risk of service interruption
   - Action: Notify tenant, top up balance

3. **High Error Rate**
   - > 5% of requests failing
   - Quality degradation
   - Action: Investigate error patterns

4. **Rate Limit Hit**
   - 429 responses increasing
   - Potential abuse or legitimate spike
   - Action: Investigate request patterns

## Log Aggregation

### Using Docker Logs

```bash
# Follow all logs
docker-compose logs -f

# Filter by service
docker-compose logs -f pulse

# Search logs
docker-compose logs pulse | grep -i error

# JSON parsing
docker-compose logs pulse | jq 'select(.level >= 40)'
```

### Using Log Files

```bash
# Redirect logs to file
docker-compose logs pulse > /var/log/pulse/app.log 2>&1

# Rotate logs (logrotate)
# /etc/logrotate.d/pulse
/var/log/pulse/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0644 root root
    sharedscripts
    postrotate
        docker-compose restart pulse > /dev/null
    endscript
}
```

### External Services

**Recommended Tools:**
- **Grafana + Loki** - Log aggregation and visualization
- **Prometheus** - Metrics collection
- **Better Stack** - Hosted logging and monitoring
- **Sentry** - Error tracking
- **Uptime Robot** - Uptime monitoring

## Performance Monitoring

### Response Time

```bash
# Monitor webhook response time
while true; do
    time curl -X POST http://localhost:3000/webhooks/telegram/demo \
        -H "Content-Type: application/json" \
        -d '{"update_id":1,"message":{"text":"test"}}' \
        -o /dev/null -s
    sleep 1
done
```

### Resource Usage

```bash
# CPU and memory
docker stats --no-stream pulse-backend

# Disk usage
docker system df

# Database size
docker exec pulse-postgres psql -U pulse -d pulse -c "
    SELECT pg_size_pretty(pg_database_size('pulse'));
"
```

### Queue Performance

```sql
-- Average job processing time (requires custom metrics)
SELECT
    AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_seconds
FROM custom_job_metrics
WHERE status = 'completed'
AND created_at >= NOW() - INTERVAL '1 hour';
```

## Debugging Checklist

### Message Not Processed

1. Check webhook delivery:
   ```bash
   docker-compose logs pulse | grep "Received Telegram webhook"
   ```

2. Check if enqueued:
   ```bash
   docker-compose logs pulse | grep "Message enqueued"
   docker exec pulse-redis redis-cli LLEN bull:pulse-messages:wait
   ```

3. Check worker processing:
   ```bash
   docker-compose logs pulse | grep "Processing message from queue"
   ```

4. Check for errors:
   ```bash
   docker-compose logs pulse | grep '"level":50'
   ```

### High Costs

1. Check usage by tenant:
   ```sql
   SELECT * FROM usage_records
   ORDER BY cost_usd DESC
   LIMIT 10;
   ```

2. Check token usage:
   ```sql
   SELECT
       AVG(input_tokens::numeric) as avg_input,
       AVG(output_tokens::numeric) as avg_output
   FROM usage_records
   WHERE created_at >= NOW() - INTERVAL '24 hours';
   ```

3. Check for tool loops:
   ```bash
   docker-compose logs pulse | grep "Reached maximum tool use iterations"
   ```

### Slow Performance

1. Check queue backlog:
   ```bash
   docker exec pulse-redis redis-cli LLEN bull:pulse-messages:wait
   ```

2. Check database performance:
   ```sql
   -- Slow queries
   SELECT
       query,
       mean_exec_time,
       calls
   FROM pg_stat_statements
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```

3. Check worker concurrency:
   ```bash
   docker-compose logs pulse | grep "Message worker initialized"
   # Should show concurrency: 5
   ```

## Runbook

### Common Issues

**Issue: Webhook 404 errors**
- **Cause:** Tenant slug mismatch or tenant not found
- **Fix:** Verify tenant slug in database, check webhook URL

**Issue: Messages stuck in queue**
- **Cause:** Worker not running or Redis connection lost
- **Fix:** `docker-compose restart pulse`

**Issue: Balance insufficient**
- **Cause:** Tenant balance depleted
- **Fix:** Top up balance in tenant_balances table

**Issue: Tool execution timeout**
- **Cause:** Tool taking too long or infinite loop
- **Fix:** Check tool implementation, add timeout

**Issue: Database migration failed**
- **Cause:** Schema conflict or connection error
- **Fix:** Restore backup, rerun migrations

## SLA Targets

- **Uptime:** 99.9% (43 minutes downtime/month)
- **Response Time:** < 200ms for /health
- **Message Processing:** < 5 seconds end-to-end
- **Queue Lag:** < 10 messages in waiting state
- **Error Rate:** < 1% of total requests

## Contact

- **Logs Location:** `docker-compose logs -f pulse`
- **Metrics Dashboard:** (To be configured)
- **On-call:** (To be configured)
- **Documentation:** `/docs`
