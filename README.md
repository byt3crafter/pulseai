# Pulse AI - Multi-Tenant AI Assistant Platform

**Runstate Pulse** - AI-powered customer service for SME clients

**Status:** ✅ Development (60% Complete) | **Phase:** 1 - Core Platform | **Target:** Production Q2 2026

---

## 🎯 What is Pulse?

Pulse is a **multi-tenant AI assistant gateway** that connects businesses to their customers through messaging platforms (Telegram, WhatsApp, WebChat) powered by LLM providers (Anthropic Claude, OpenAI).

Think of it as **"AI customer service in a box"** for SME clients who want to:
- Provide 24/7 customer support
- Answer common questions automatically
- Handle inquiries on channels customers already use (Telegram, WhatsApp)
- Track usage and costs transparently
- Extend capabilities with business-specific tools (ERPNext, booking systems)

**Built by:** Runstate Ltd (Mauritius)
**Target Market:** SME clients in Mauritius and beyond
**Domain:** pulse.runstate.mu

---

## 🚀 Quick Start

### For Developers

1. **Read the Documentation** (Start Here!)
   - [STATUS_SUMMARY.md](./STATUS_SUMMARY.md) - Current state at a glance
   - [CODEBASE_OVERVIEW.md](./CODEBASE_OVERVIEW.md) - Comprehensive analysis
   - [ROADMAP.md](./ROADMAP.md) - Development priorities
   - [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - Developer guide
   - [pulse-project-kickoff.md](./pulse-project-kickoff.md) - Original vision

2. **Set Up Backend**
   ```bash
   cd pulse
   pnpm install
   cp .env.example .env
   # Edit .env with your credentials
   pnpm db:migrate
   pnpm tsx scripts/seed.ts
   pnpm dev
   ```

3. **Set Up Dashboard**
   ```bash
   cd dashboard
   npm install
   npm run dev
   ```

4. **Access**
   - Backend: http://localhost:3000
   - Dashboard: http://localhost:3001
   - Health: http://localhost:3000/health

### For Business Users

📧 Contact Runstate Ltd for access to:
- Pre-configured Pulse instance
- Telegram bot setup
- Dashboard credentials
- Usage tracking

---

## 📚 Documentation Index

| Document | Purpose | Audience |
|----------|---------|----------|
| [STATUS_SUMMARY.md](./STATUS_SUMMARY.md) | Quick overview of what works now | Everyone |
| [CODEBASE_OVERVIEW.md](./CODEBASE_OVERVIEW.md) | Deep technical analysis | Developers, Architects |
| [ROADMAP.md](./ROADMAP.md) | Development priorities & timeline | Product, Engineering |
| [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) | Developer commands & patterns | Developers |
| [pulse-project-kickoff.md](./pulse-project-kickoff.md) | Original vision & architecture | Everyone |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Pulse Platform                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Telegram   │  │   WhatsApp   │  │   WebChat    │       │
│  │   Channel    │  │   Channel    │  │   Channel    │       │
│  │   (grammY)   │  │  (Phase 2)   │  │  (Phase 3)   │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │                │
│         └─────────────────┼─────────────────┘                │
│                           ▼                                  │
│                  ┌────────────────┐                          │
│                  │ Channel Router │                          │
│                  │ (Normalize)    │                          │
│                  └────────┬───────┘                          │
│                           ▼                                  │
│                  ┌────────────────┐                          │
│                  │ Agent Runtime  │                          │
│                  │ - Context      │                          │
│                  │ - Balance      │                          │
│                  │ - Tools        │                          │
│                  └────────┬───────┘                          │
│                           ▼                                  │
│          ┌────────────────┴────────────────┐                │
│          ▼                                  ▼                │
│  ┌───────────────┐                 ┌───────────────┐        │
│  │  Anthropic    │                 │    OpenAI     │        │
│  │  Claude API   │                 │  (Fallback)   │        │
│  │  (Primary)    │                 │               │        │
│  └───────────────┘                 └───────────────┘        │
│                                                               │
│  ┌─────────────────────────────────────────────────┐        │
│  │              PostgreSQL Database                 │        │
│  │  - Tenants    - Messages    - Billing           │        │
│  │  - Channels   - Usage       - OAuth             │        │
│  └─────────────────────────────────────────────────┘        │
│                                                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Admin Dashboard (Next.js)                 │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Platform   │  │    Tenant     │  │   Global     │       │
│  │   Overview   │  │  Management   │  │   Settings   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  Client Workspace (Next.js)                  │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Dashboard  │  │   Channels   │  │   Billing    │       │
│  │   Overview   │  │ Integrations │  │   & Usage    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Key Features

### ✅ Implemented

- **Multi-Tenant Architecture** - Complete isolation per client
- **Telegram Integration** - grammY-based bot (polling mode)
- **AI Conversations** - Claude 3.7 Sonnet with context memory
- **Credit-Based Billing** - Pre-flight balance checks, audit trail
- **OAuth 2.0** - Third-party CLI tool integration (Claude Code, Cursor)
- **Admin Dashboard** - Tenant management, usage monitoring
- **Client Workspace** - Self-service dashboard for each tenant
- **Security** - AES-256-GCM encryption, contact allowlists
- **Structured Logging** - Pino logger with tenant context

### ⚠️ In Progress

- **Webhook Mode** (Telegram) - Production-ready webhook handling
- **Tools Framework** - Extensible business logic plugins
- **Message Queue** - Async processing to prevent timeouts
- **Rate Limiting** - API abuse protection
- **Testing** - Unit and integration tests
- **Docker Deployment** - Containerized setup

### 📅 Planned (Phase 2+)

- **WhatsApp Channel** - Via Baileys or Business API
- **WebChat Widget** - Embeddable web chat
- **ERPNext Integration** - Inventory, invoices, customer data
- **Analytics Dashboard** - Conversation insights
- **White-Label** - Custom branding per tenant

---

## 🎯 Current Status

**Overall Progress:** 60% Complete

| Component | Status |
|-----------|--------|
| Database Schema | ✅ 95% |
| Agent Runtime | ✅ 80% |
| Telegram Channel | ⚠️ 70% (Polling only) |
| Billing System | ✅ 100% |
| OAuth Integration | ✅ 100% |
| Admin Dashboard | ✅ 70% |
| Client Dashboard | ⚠️ 65% |
| Tools Framework | 🔴 10% |
| Testing | 🔴 0% |
| Deployment | 🔴 0% |

**See [STATUS_SUMMARY.md](./STATUS_SUMMARY.md) for details**

---

## 🛠️ Technology Stack

### Backend (`/pulse/`)
- **Runtime:** Node.js 22+ / TypeScript 5.x
- **Framework:** Fastify (HTTP server)
- **Database:** PostgreSQL 16 + Drizzle ORM
- **Cache:** Redis (planned)
- **AI:** Anthropic Claude API, OpenAI (fallback, planned)
- **Channels:** grammY (Telegram)
- **Validation:** Zod
- **Logging:** Pino
- **Testing:** Vitest (framework ready)

### Dashboard (`/dashboard/`)
- **Framework:** Next.js 16 (App Router)
- **UI:** React 19 + Tailwind CSS 4
- **Auth:** NextAuth 5.0 (beta)
- **Icons:** Heroicons React
- **Fonts:** Geist Sans & Geist Mono

---

## 📊 Database Schema

11 tables across 3 migrations:

**Core Tables:**
- `tenants` - SaaS customers
- `conversations` - Chat threads
- `messages` - Conversation history
- `channel_connections` - Per-tenant channel configs
- `allowlists` - Contact approval

**Billing Tables:**
- `tenant_balances` - Credit balances
- `ledger_transactions` - Audit trail
- `usage_records` - Token tracking

**OAuth Tables:**
- `oauth_clients` - Third-party apps
- `oauth_codes` - Authorization codes
- `oauth_tokens` - Access tokens

---

## 🚦 Roadmap

### Phase 1: Core Platform (Weeks 1-4) - **60% Complete**

**Critical Priorities:**
1. ✅ Multi-tenant database
2. ✅ Agent runtime with billing
3. ✅ Telegram adapter (polling)
4. ⏳ Telegram webhooks
5. ⏳ Tools framework
6. ⏳ Message queue
7. ⏳ Rate limiting
8. ⏳ Testing
9. ⏳ Docker deployment

**Target:** Production-ready platform with Telegram support

### Phase 2: Enhanced Features (Month 2) - **Not Started**

- WhatsApp channel
- Dashboard CRUD operations
- Analytics
- Monitoring

### Phase 3: Business Integrations (Month 3-4) - **Not Started**

- ERPNext MCP integration
- Custom skills per tenant
- WebChat widget

**See [ROADMAP.md](./ROADMAP.md) for complete timeline**

---

## 🔐 Security

- **Encryption:** AES-256-GCM for API keys and credentials
- **Hashing:** SHA-256 for tenant API keys, bcrypt for passwords
- **Isolation:** Multi-tenant database scoping on all queries
- **Access Control:** Contact allowlists (approved/pending/blocked)
- **OAuth 2.0:** Secure third-party integrations
- **Pre-flight Checks:** Balance validation before LLM calls

**Removed from OpenClaw:**
- No host bash/shell access
- No browser automation
- No file system access
- No elevated permissions

---

## 📝 Project Structure

```
Pulse_AI/
├── pulse/                    # Backend (Node.js + TypeScript)
│   ├── src/
│   │   ├── agent/            # Agent runtime + LLM providers
│   │   ├── channels/         # Telegram, WhatsApp, WebChat
│   │   ├── storage/          # Database + migrations
│   │   ├── gateway/          # Fastify server + OAuth
│   │   └── utils/            # Logger, crypto
│   ├── scripts/
│   │   └── seed.ts           # Demo tenant seeding
│   └── test/                 # Tests (TODO)
│
├── dashboard/                # Frontend (Next.js + React)
│   ├── src/
│   │   ├── app/
│   │   │   ├── admin/        # Platform admin portal
│   │   │   └── dashboard/    # Client workspace
│   │   ├── storage/          # Shared database schema
│   │   └── auth.ts           # NextAuth config
│   └── public/               # Static assets
│
├── openclaw_ref/             # OpenClaw reference
├── scripts/                  # Project-wide utilities
│
├── pulse-project-kickoff.md  # Original vision
├── CODEBASE_OVERVIEW.md      # Technical deep dive
├── ROADMAP.md                # Development plan
├── QUICK_REFERENCE.md        # Developer guide
├── STATUS_SUMMARY.md         # Current status
└── README.md                 # This file
```

---

## 🤝 Contributing

This is a **private commercial project** by Runstate Ltd.

**For Runstate Team:**
1. Read [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for developer setup
2. Check [ROADMAP.md](./ROADMAP.md) for current priorities
3. Follow Git workflow (feature branches, PRs)
4. Write tests for new features
5. Update documentation

---

## 📞 Contact & Support

**Owner:** Ludovic @ Runstate Ltd
**Company:** Runstate Ltd (Mauritius)
**Website:** runstate.mu
**Email:** [contact information]

**For Technical Issues:**
- Check [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for common issues
- Review logs: `pnpm dev` (backend) or `npm run dev` (dashboard)
- Contact development team

---

## 📄 License

**UNLICENSED** - Proprietary software by Runstate Ltd.
All rights reserved. Not for public distribution.

---

## 🎉 Acknowledgments

**Inspired by:**
- [OpenClaw](https://github.com/openclaw/openclaw) - Multi-channel AI agent architecture
- DockCtrl - Internal Runstate project for admin UI patterns

**Powered by:**
- Anthropic Claude API
- grammY Telegram Bot Framework
- Next.js & React
- Fastify & Drizzle ORM

---

**Built with ❤️ in Mauritius** 🇲🇺

*Last Updated: February 24, 2026*
