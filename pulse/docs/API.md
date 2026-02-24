# Pulse AI - API Documentation

## Base URL

```
https://pulse.runstate.mu
```

## Authentication

Currently, webhooks use tenant slug-based routing. Future versions will implement API key authentication.

## Endpoints

### Health Check

Check if the API is running.

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 123.45
}
```

### Telegram Webhook

Receive updates from Telegram.

```http
POST /webhooks/telegram/:tenantSlug
```

**Parameters:**
- `tenantSlug` (path) - Tenant identifier

**Request Body:**
Telegram Update object (sent by Telegram servers)

**Response:**
```json
{
  "ok": true
}
```

**Error Responses:**

404 - Tenant not found:
```json
{
  "error": "Tenant not found"
}
```

500 - Processing failed:
```json
{
  "error": "Failed to process webhook"
}
```

### Telegram Webhook Info

Get webhook registration status for debugging.

```http
GET /webhooks/telegram/:tenantSlug/info
```

**Response:**
```json
{
  "url": "https://pulse.runstate.mu/webhooks/telegram/demo",
  "has_custom_certificate": false,
  "pending_update_count": 0,
  "last_error_date": null,
  "last_error_message": null,
  "max_connections": 40,
  "ip_address": "1.2.3.4"
}
```

### OAuth 2.0 Endpoints

#### Authorization

Initiate OAuth flow.

```http
GET /oauth/authorize
```

**Query Parameters:**
- `client_id` - OAuth client ID
- `redirect_uri` - Callback URL
- `response_type=code` - Always "code"
- `state` - CSRF protection token

**Response:**
Redirects to login page or consent screen.

#### Token Exchange

Exchange authorization code for access token.

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded
```

**Body Parameters:**
- `grant_type=authorization_code`
- `code` - Authorization code from /authorize
- `client_id` - OAuth client ID
- `client_secret` - OAuth client secret
- `redirect_uri` - Same as /authorize request

**Response:**
```json
{
  "access_token": "at_abc123...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "rt_xyz789..."
}
```

#### Token Refresh

Refresh an expired access token.

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded
```

**Body Parameters:**
- `grant_type=refresh_token`
- `refresh_token` - Refresh token from previous response
- `client_id` - OAuth client ID
- `client_secret` - OAuth client secret

**Response:**
Same as token exchange.

## Rate Limiting

All endpoints are rate-limited to prevent abuse.

**Limits:**
- 100 requests per minute per tenant
- Fallback to 100 requests per minute per IP

**Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1645564320
Retry-After: 60
```

**429 Response:**
```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again later.",
  "retryAfter": "60"
}
```

## Database Schema

### Tenants

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    config JSONB DEFAULT '{}',
    api_key_hash VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Channel Connections

```sql
CREATE TABLE channel_connections (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    channel_type VARCHAR(50) NOT NULL,
    channel_config JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Channel Config Example (Telegram):**
```json
{
  "botToken": "123456:ABC-DEF..."
}
```

### Conversations

```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    channel_type VARCHAR(50) NOT NULL,
    channel_contact_id VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, channel_type, channel_contact_id)
);
```

### Messages

```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id),
    tenant_id UUID REFERENCES tenants(id),
    role VARCHAR(20) NOT NULL, -- 'user', 'assistant', 'system', 'tool'
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tenant Skills

```sql
CREATE TABLE tenant_skills (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    skill_name VARCHAR(100) NOT NULL,
    config JSONB DEFAULT '{}',
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, skill_name)
);
```

**Available Skills:**
- `get_current_time` - Returns current date/time
- `calculator` - Performs math calculations

### Usage Records

```sql
CREATE TABLE usage_records (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    conversation_id UUID REFERENCES conversations(id),
    model VARCHAR(100) NOT NULL, -- Format: "provider:model"
    input_tokens DECIMAL DEFAULT 0,
    output_tokens DECIMAL DEFAULT 0,
    cost_usd DECIMAL(10,6) DEFAULT 0,
    credits_used DECIMAL(12,4) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tenant Balances

```sql
CREATE TABLE tenant_balances (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id),
    balance DECIMAL(12,4) NOT NULL DEFAULT 0, -- 1 credit = $0.01
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Built-in Tools

### get_current_time

Returns the current date and time.

**Parameters:**
```json
{
  "timezone": "America/New_York"  // Optional IANA timezone
}
```

**Response:**
```
Current time: Monday, February 24, 2026 at 3:45:00 PM EST
```

### calculator

Performs mathematical calculations.

**Parameters:**
```json
{
  "expression": "(15 * 23) + 100"  // Math expression
}
```

**Response:**
```
Result: 445
```

**Supported Operations:**
- Basic: `+`, `-`, `*`, `/`, `%`, `()`
- Math functions: `Math.sqrt()`, `Math.pow()`, `Math.sin()`, etc.

## Error Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing/invalid credentials |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Something went wrong |
| 503 | Service Unavailable - Temporary issue |

## Webhook Security

### Telegram Webhook Validation

Telegram can optionally validate webhook requests using a secret token.

**Setup:**
1. Set `TELEGRAM_WEBHOOK_SECRET` in .env
2. Telegram will include it in `X-Telegram-Bot-Api-Secret-Token` header
3. Pulse validates the header matches

**Without validation:**
- Webhook URL should be kept secret
- Use HTTPS to prevent man-in-the-middle attacks

## Message Flow

```
1. User sends message via Telegram
2. Telegram sends webhook to /webhooks/telegram/:tenantSlug
3. Pulse enqueues message in Redis (BullMQ)
4. Worker picks up message from queue
5. Worker loads conversation history (last 20 messages)
6. Worker loads enabled tools for tenant
7. Worker calls LLM (Anthropic, fallback to OpenAI)
8. If LLM requests tools, worker executes and loops back to step 7
9. Worker saves assistant message to database
10. Worker records usage and deducts credits
11. Worker sends response via Telegram adapter
12. User receives response
```

## Provider Pricing

### Anthropic (Primary)

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| Claude 3.7 Sonnet | $3.00 | $15.00 |
| Claude 3.5 Sonnet | $3.00 | $15.00 |
| Claude 3 Opus | $15.00 | $75.00 |
| Claude 3 Haiku | $0.25 | $1.25 |

### OpenAI (Fallback)

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| GPT-4o | $2.50 | $10.00 |
| GPT-4o-mini | $0.15 | $0.60 |
| GPT-4-turbo | $10.00 | $30.00 |

**Credits:**
- 1 credit = $0.01 USD
- Credits are deducted based on actual usage
- Balance checked before processing each message
