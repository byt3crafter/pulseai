# Pulse AI - Quick Reference Guide

**For Developers** - Last Updated: February 24, 2026

---

## 🏗️ Project Structure

```
Pulse_AI/
├── pulse/                          # Backend (Node.js + TypeScript)
│   ├── src/
│   │   ├── agent/                  # Agent runtime + LLM providers
│   │   │   ├── runtime.ts          # Core message processing loop
│   │   │   ├── providers/          # Anthropic, OpenAI
│   │   │   └── tools/              # Skills framework (TODO)
│   │   ├── channels/               # Channel adapters (Telegram, WhatsApp, WebChat)
│   │   │   ├── telegram/           # grammY-based Telegram bot
│   │   │   └── types.ts            # InboundMessage, OutboundMessage
│   │   ├── storage/                # Database layer
│   │   │   ├── schema.ts           # Drizzle ORM schema
│   │   │   ├── db.ts               # DB connection
│   │   │   └── migrations/         # SQL migrations
│   │   ├── gateway/                # Fastify HTTP server
│   │   │   ├── server.ts           # Server setup
│   │   │   ├── oauth.ts            # OAuth 2.0 flow
│   │   │   ├── routes/             # API routes (TODO)
│   │   │   └── middleware/         # Auth, rate limiting (TODO)
│   │   ├── utils/                  # Utilities
│   │   │   ├── logger.ts           # Pino logger
│   │   │   └── crypto.ts           # Encryption/hashing
│   │   ├── config.ts               # Environment config (Zod)
│   │   └── index.ts                # Entry point
│   ├── scripts/                    # Utility scripts
│   │   └── seed.ts                 # Seed demo tenant
│   └── test/                       # Tests (TODO)
│
├── dashboard/                      # Frontend (Next.js 16 + React 19)
│   ├── src/
│   │   ├── app/                    # Next.js App Router
│   │   │   ├── (public)/           # Home, login
│   │   │   ├── admin/              # Admin portal
│   │   │   │   └── tenants/        # Tenant management
│   │   │   └── dashboard/          # Client workspace
│   │   │       ├── page.tsx        # Overview
│   │   │       └── settings/       # Settings page
│   │   ├── storage/                # Same schema as backend
│   │   ├── auth.ts                 # NextAuth config
│   │   ├── proxy.ts                # Route protection middleware
│   │   └── config.ts               # Environment validation
│   └── public/                     # Static assets
│
├── openclaw_ref/                   # OpenClaw reference implementation
├── scripts/                        # Project-wide scripts
├── pulse-project-kickoff.md        # Original vision document
├── CODEBASE_OVERVIEW.md            # Comprehensive overview (THIS)
├── ROADMAP.md                      # Development roadmap
└── QUICK_REFERENCE.md              # This file
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 22+
- PostgreSQL 16
- Redis 7 (optional for Phase 2)
- Telegram Bot Token (from @BotFather)

### Backend Setup

```bash
# Navigate to backend
cd pulse

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env

# Required variables:
# - DATABASE_URL=postgresql://user:pass@localhost:5432/pulse
# - ANTHROPIC_API_KEY=sk-ant-...
# - ENCRYPTION_KEY=<64-char hex string>
# - TELEGRAM_BOT_TOKEN=<from BotFather>

# Run database migrations
pnpm db:migrate

# Seed demo tenant
pnpm tsx scripts/seed.ts

# Start development server
pnpm dev
```

### Dashboard Setup

```bash
# Navigate to dashboard
cd dashboard

# Install dependencies
npm install

# Dashboard shares .env with backend via symlink
# OR create separate .env with same DATABASE_URL

# Start Next.js dev server
npm run dev
```

### Access Points
- Backend: http://localhost:3000
- Dashboard: http://localhost:3001
- Health Check: http://localhost:3000/health

---

## 🗄️ Database Schema Quick Reference

### Core Tables

**tenants** - SaaS customers
- `id` (UUID, PK)
- `name`, `slug` (unique)
- `config` (JSONB) - Custom instructions, model preferences
- `api_key_hash` - SHA-256 hash for API authentication
- `status` - active/inactive

**conversations** - Chat threads
- `id` (UUID, PK)
- `tenant_id` (FK)
- `channel_type` - telegram/whatsapp/webchat
- `channel_contact_id` - User ID from channel
- `contact_name`
- Unique constraint: (tenant_id, channel_type, channel_contact_id)

**messages** - Conversation history
- `id` (UUID, PK)
- `conversation_id` (FK)
- `tenant_id` (FK)
- `role` - user/assistant/system/tool
- `content` (TEXT)
- `metadata` (JSONB) - tokens_used, model, latency_ms

**tenant_balances** - Credit balances
- `tenant_id` (PK, FK)
- `balance` (DECIMAL 12,4)
- `currency` - default 'CREDITS'

**ledger_transactions** - Audit trail
- `id` (UUID, PK)
- `tenant_id` (FK)
- `type` - debit/credit
- `amount` (DECIMAL 12,4)
- `description`
- `reference_id` - Links to conversation_id or message_id

**channel_connections** - Per-tenant channel configs
- `id` (UUID, PK)
- `tenant_id` (FK)
- `channel_type`
- `channel_config` (JSONB, encrypted) - bot_token, webhook_secret

**allowlists** - Contact approval
- `id` (UUID, PK)
- `tenant_id` (FK)
- `channel_type`, `contact_id`
- `status` - approved/pending/blocked

**oauth_clients** - Third-party CLI tools
- `id` (UUID, PK)
- `tenant_id` (FK)
- `client_id` (unique)
- `client_secret_hash`
- `name` - "Claude Code", "Cursor", etc.

**oauth_tokens** - Access tokens
- `id` (UUID, PK)
- `tenant_id` (FK)
- `token` - Format: `pls_<64 hex chars>`
- `expires_at` - Default 30 days

### Useful Queries

```sql
-- Get tenant with balance
SELECT t.*, tb.balance
FROM tenants t
LEFT JOIN tenant_balances tb ON t.id = tb.tenant_id
WHERE t.slug = 'demo-business';

-- Get conversation history (last 20 messages)
SELECT role, content, created_at
FROM messages
WHERE conversation_id = 'uuid-here'
ORDER BY created_at DESC
LIMIT 20;

-- Get tenant usage summary
SELECT
  DATE(created_at) as date,
  SUM(input_tokens) as input_tokens,
  SUM(output_tokens) as output_tokens,
  SUM(cost_usd) as cost_usd
FROM usage_records
WHERE tenant_id = 'uuid-here'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Get ledger balance (should match tenant_balances)
SELECT
  SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END) -
  SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END) as calculated_balance
FROM ledger_transactions
WHERE tenant_id = 'uuid-here';
```

---

## 🔑 Key Concepts

### Message Flow

1. **Inbound Message**
   - User sends message on Telegram
   - Telegram adapter receives via polling (dev) or webhook (prod)
   - Normalized to `InboundMessage` format
   - Passed to Agent Runtime

2. **Agent Processing**
   - Look up tenant config
   - Look up or create conversation
   - Load last 20 messages for context
   - Check tenant balance (pre-flight)
   - Build system prompt
   - Call LLM provider (Anthropic Claude)
   - Track usage (tokens, cost)
   - Deduct from balance via ledger transaction
   - Save assistant response to DB

3. **Outbound Message**
   - Agent runtime returns response
   - Channel adapter formats for platform (Markdown, etc.)
   - Send via grammY bot.api.sendMessage()

### Multi-Tenancy

- Every query MUST include `tenant_id` WHERE clause
- Use `createTenantLogger(tenantId)` for scoped logging
- Config stored in `tenants.config` JSONB field
- Isolation at database level (future: schema per tenant)

### Billing Model

- **Credits** - Abstract currency (1 credit ≈ $0.01)
- **Cost Calculation:**
  - Input tokens: $0.003 / 1K tokens (Claude 3.7 Sonnet)
  - Output tokens: $0.015 / 1K tokens
  - Convert USD to credits: cost_usd * 100
- **Ledger Transactions:**
  - Top-up: `type=credit`
  - Usage: `type=debit`
- **Pre-flight Check:** Reject if `balance < 0.10` (10 credits)

### Channel Adapter Pattern

All channel adapters implement `ChannelAdapter` interface:

```typescript
interface ChannelAdapter {
  readonly channelType: string;
  initialize(connections: ChannelConnection[]): Promise<void>;
  shutdown(): Promise<void>;
  onMessage(handler: (msg: InboundMessage) => Promise<void>): void;
  sendMessage(msg: OutboundMessage): Promise<{ channelMessageId: string }>;
  formatResponse(content: string): string;
}
```

---

## 🧪 Testing (TODO)

### Running Tests

```bash
# Run all tests
pnpm test

# Run in watch mode
pnpm test:watch

# Run specific test file
pnpm test src/agent/runtime.test.ts
```

### Writing Tests

```typescript
import { describe, it, expect } from 'vitest';

describe('Agent Runtime', () => {
  it('should process message and return response', async () => {
    // TODO: Implement
  });
});
```

---

## 🔧 Common Tasks

### Add a New Built-in Tool

1. Create file: `src/agent/tools/built-in/your-tool.ts`
```typescript
import type { Skill } from '../tool.interface';

export const yourTool: Skill = {
  name: 'your_tool',
  description: 'What this tool does',
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'Input parameter' }
    },
    required: ['input']
  },
  async execute({ tenantId, conversationId, args }) {
    // Your logic here
    return {
      result: 'Tool output',
      metadata: {}
    };
  }
};
```

2. Register in `src/agent/tools/registry.ts` (TODO: create this file)
3. Update agent runtime to call tools

### Add a New Channel

1. Create directory: `src/channels/yourchannel/`
2. Implement adapter: `adapter.ts` (implements `ChannelAdapter`)
3. Add handlers: `handlers.ts`
4. Add formatter: `formatter.ts`
5. Register in `src/index.ts`

### Add a Dashboard Page

1. Create route: `dashboard/src/app/dashboard/yourpage/page.tsx`
2. Add to sidebar: `dashboard/src/app/dashboard/layout.tsx`
3. Add API endpoint if needed: `dashboard/src/app/api/yourpage/route.ts`

---

## 🐛 Debugging

### Enable Debug Logging

```bash
# Backend
LOG_LEVEL=debug pnpm dev

# Or in .env
LOG_LEVEL=debug
```

### View Logs

```bash
# Backend logs (pino pretty-print)
pnpm dev

# Database queries (Drizzle debug mode)
# Add to db.ts:
import { drizzle } from 'drizzle-orm/postgres-js';
const db = drizzle(client, { logger: true });
```

### Common Issues

**"Insufficient balance"**
- Check tenant balance: `SELECT * FROM tenant_balances WHERE tenant_id = '...'`
- Top up balance via ledger transaction

**"Contact not in allowlist"**
- Add to allowlist: `INSERT INTO allowlists (tenant_id, channel_type, contact_id, status) VALUES (...)`

**Telegram bot not responding**
- Check bot token in `.env`
- Verify polling is running: Look for "Telegram adapter started (polling)" in logs
- Test with `/start` command

---

## 📚 Useful Commands

### Database

```bash
# Generate migration
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Rollback last migration
# (Manual: delete from drizzle.__drizzle_migrations, drop tables)

# Connect to DB
psql $DATABASE_URL
```

### Development

```bash
# Backend
pnpm dev              # Start dev server with hot reload
pnpm build            # Compile TypeScript
pnpm start            # Run production build
pnpm lint             # Run ESLint

# Dashboard
npm run dev           # Start Next.js dev server
npm run build         # Build for production
npm run start         # Start production server
```

### Deployment

```bash
# TODO: Add Docker commands when Dockerfile is created
```

---

## 🔐 Security Notes

### Encryption

- **AES-256-GCM** for channel configs (bot tokens, API keys)
- **SHA-256** for tenant API keys (one-way hash)
- **bcrypt** for user passwords (dashboard)

### Secrets Management

```bash
# Generate encryption key (64-char hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate secure random string
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### Environment Variables (Never Commit!)

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `ENCRYPTION_KEY`
- `DATABASE_URL`
- `NEXTAUTH_SECRET`

---

## 📞 Support & Resources

### Documentation
- [Fastify Docs](https://fastify.dev)
- [Drizzle ORM](https://orm.drizzle.team)
- [grammY](https://grammy.dev)
- [Anthropic API](https://docs.anthropic.com)
- [Next.js 16](https://nextjs.org/docs)

### Project Docs
- `pulse-project-kickoff.md` - Original vision
- `CODEBASE_OVERVIEW.md` - Comprehensive overview
- `ROADMAP.md` - Development roadmap
- `QUICK_REFERENCE.md` - This file

### Contact
- **Owner:** Ludovic @ Runstate Ltd
- **Email:** [contact info]
- **GitHub:** [repo URL when created]

---

**Last Updated:** February 24, 2026 | **Version:** 1.0
