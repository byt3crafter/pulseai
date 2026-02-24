# Pulse AI - Development Roadmap

**Last Updated:** February 24, 2026
**Current Status:** Phase 1 - 60% Complete

---

## 🎯 Phase 1: Core Platform (Weeks 1-4)

### ✅ Completed

- [x] Database schema and migrations (3 migrations applied)
- [x] Multi-tenant architecture with tenant isolation
- [x] Agent runtime with conversation threading
- [x] Sliding context window (last 20 messages)
- [x] Anthropic Claude 3.7 Sonnet integration
- [x] Telegram channel adapter (polling mode)
- [x] Credit-based billing system with ledger
- [x] Pre-flight balance checks
- [x] Token counting and cost calculation
- [x] OAuth 2.0 for third-party CLI tools
- [x] AES-256-GCM encryption for credentials
- [x] Contact allowlist system
- [x] NextAuth authentication (role-based access)
- [x] Admin portal (tenant listing)
- [x] Client workspace dashboard
- [x] Settings page UI

### 🔴 Critical Priorities (Next 1-2 Weeks)

1. **Telegram Webhook Mode**
   - Replace polling with production-ready webhooks
   - Add webhook secret validation
   - Files: `src/channels/telegram/adapter.ts`, `src/gateway/routes/webhooks.ts`
   - **Blocks:** Production deployment

2. **Tools/Skills Framework**
   - Implement tool registry and execution engine
   - Add time.ts as proof-of-concept built-in tool
   - Integrate tool calling in agent runtime
   - Files: `src/agent/tools/registry.ts`, `src/agent/tools/built-in/time.ts`
   - **Blocks:** Core product vision

3. **Message Queuing (BullMQ)**
   - Redis-backed queue for async LLM processing
   - Worker process separate from webhook handler
   - Prevents timeout issues on slow LLM responses
   - Files: `src/index.ts`, `src/agent/runtime.ts`, `src/queue/`
   - **Blocks:** Production scalability

4. **Rate Limiting Middleware**
   - Per-tenant message rate limits
   - Redis-based distributed rate limiting
   - Prevent API abuse
   - Files: `src/gateway/middleware/rate-limit.ts`
   - **Blocks:** Production security

### 🟡 High Priorities (Weeks 3-4)

5. **OpenAI Fallback Provider**
   - Implement OpenAI provider interface
   - Add provider selection logic (primary/fallback)
   - Files: `src/agent/providers/openai.ts`
   - **Impact:** Resilience against Anthropic API outages

6. **Dashboard API Endpoints**
   - Tenant CRUD API (`/api/tenants`)
   - Usage statistics API (`/api/usage`)
   - Settings persistence API (`/api/settings`)
   - Balance top-up API (`/api/billing/topup`)
   - **Impact:** Makes dashboard fully functional

7. **Docker Deployment**
   - Multi-stage Dockerfile
   - docker-compose.yml (app, PostgreSQL, Redis)
   - Environment configuration documentation
   - Files: `Dockerfile`, `docker-compose.yml`
   - **Impact:** Consistent deployment environment

8. **Critical Tests**
   - Agent runtime tests (conversation flow, billing)
   - Channel adapter tests (message normalization)
   - Billing calculation tests
   - Coverage target: >60%
   - **Impact:** Quality assurance before production

---

## 📦 Phase 2: Enhanced Features (Month 2)

### 🔵 Medium Priorities

9. **Custom System Prompts**
   - Fetch from tenant config instead of hardcoded default
   - Template variable support
   - Files: `src/agent/system-prompt.ts`

10. **Tenant & Session Services**
    - Create service modules for business logic
    - Move code out of inline implementations
    - Files: `src/tenants/tenant.service.ts`, `src/sessions/session.service.ts`, `src/billing/usage.service.ts`

11. **Concurrency Control**
    - Conversation-level locking (Redis or DB advisory locks)
    - Prevent parallel processing of same thread
    - Handle rapid-fire messages

12. **Message Chunking**
    - Smart splitting of long responses (Telegram 4096 char limit)
    - Paragraph-aware chunking
    - Files: `src/channels/telegram/formatter.ts`

13. **Additional Built-in Tools**
    - Weather lookup tool
    - Calculator tool
    - Web search tool (optional)

14. **Monitoring & Observability**
    - Prometheus metrics
    - Grafana dashboards
    - Error tracking (Sentry or similar)
    - Performance monitoring

### 🌐 WhatsApp Channel (Phase 2 Goal)

15. **WhatsApp Adapter**
    - Baileys library integration (personal accounts)
    - OR WhatsApp Business API (official)
    - Message normalization
    - Media handling (images, documents)
    - Files: `src/channels/whatsapp/adapter.ts`, `handlers.ts`, `formatter.ts`

---

## 🚀 Phase 3: Advanced Features (Month 3-4)

### 🎨 Dashboard Enhancements

16. **Complete Admin Features**
    - Create tenant functionality
    - Edit tenant
    - Delete tenant (soft delete)
    - Search and filter tenants

17. **Analytics Dashboard**
    - Conversation volume charts
    - Token usage trends
    - Cost breakdown by model
    - Response time metrics
    - Files: `/dashboard/src/app/admin/analytics`

18. **Billing Management UI**
    - Transaction history
    - Top-up interface
    - Invoice generation
    - Files: `/dashboard/src/app/dashboard/billing`

19. **Channel Management UI**
    - Connect/disconnect channels
    - Configure channel settings
    - Test channel connectivity
    - Files: `/dashboard/src/app/dashboard/channels`

### 🧩 Business Integrations

20. **ERPNext MCP Integration**
    - Inventory lookup tool
    - Invoice query tool
    - Customer information tool
    - Leverage existing MCP server work

21. **Custom Skills per Tenant**
    - Skill marketplace or registry
    - Per-tenant skill configuration
    - Skill permission management

22. **Appointment Booking Tool**
    - Calendar integration
    - Availability checking
    - Booking confirmation

### 🌍 WebChat Channel

23. **WebChat Widget**
    - Embeddable JavaScript widget
    - WebSocket real-time messaging
    - Customizable branding
    - Files: `src/channels/webchat/`, `/widget/` (new package)

---

## 🏢 Phase 4: Enterprise Features (Month 4-6)

### 🔐 Compliance & Security

24. **Audit Logs**
    - Complete action logging
    - Audit log viewer in admin portal
    - Export functionality
    - Retention policies

25. **Data Residency Controls**
    - Per-tenant data location specification
    - Important for African markets
    - Regional deployment support

26. **Advanced Security**
    - Two-factor authentication (2FA)
    - IP whitelisting
    - API key rotation
    - Security headers (CSP, HSTS)

### 🎯 White-Label & Multi-Region

27. **White-Label Option**
    - Custom branding per tenant
    - Custom domain support
    - Custom email templates

28. **Multi-Region Deployment**
    - Region-specific instances
    - Data synchronization
    - Latency optimization

### 📊 Advanced Analytics

29. **Conversation Insights**
    - Common questions analysis
    - Resolution rate tracking
    - Sentiment analysis
    - User satisfaction scores

30. **AI Model Performance**
    - Model comparison metrics
    - Cost vs. quality analysis
    - Auto-switching based on performance

---

## 🛠️ Ongoing Tasks (All Phases)

### Documentation
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Deployment guide
- [ ] Developer onboarding guide
- [ ] User manual for dashboard
- [ ] Architecture decision records (ADRs)

### DevOps
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Automated testing in CI
- [ ] Staging environment setup
- [ ] Production deployment automation
- [ ] Backup and disaster recovery

### Performance
- [ ] Database query optimization
- [ ] Redis caching strategy
- [ ] CDN for static assets (dashboard)
- [ ] Load testing and benchmarking
- [ ] Auto-scaling configuration

### Maintenance
- [ ] Dependency updates (weekly)
- [ ] Security vulnerability scanning
- [ ] Database maintenance (vacuuming, reindexing)
- [ ] Log rotation and archival
- [ ] Cost monitoring and optimization

---

## 📋 Definition of Done

### Phase 1 Complete When:
- [x] Telegram webhook mode works in production
- [x] At least 3 built-in tools functional
- [x] Message queuing prevents timeouts
- [x] Rate limiting protects API
- [x] OpenAI fallback implemented
- [x] Test coverage >60%
- [x] Docker deployment documented
- [x] Admin can create tenants via dashboard
- [x] Dashboard shows real usage data

**Target Date:** End of Week 4 (March 24, 2026)

### Phase 2 Complete When:
- [ ] WhatsApp channel operational
- [ ] Dashboard fully functional (all CRUD operations)
- [ ] Analytics dashboard live
- [ ] Monitoring and alerting configured
- [ ] Custom system prompts working
- [ ] Message chunking implemented

**Target Date:** End of Month 2 (April 30, 2026)

### Phase 3 Complete When:
- [ ] ERPNext integration live
- [ ] WebChat widget embeddable
- [ ] Custom skills per tenant
- [ ] Appointment booking tool
- [ ] White-label option available

**Target Date:** End of Month 4 (June 30, 2026)

---

## 🎯 Success Metrics

| Metric | Phase 1 Target | Phase 2 Target | Phase 3 Target |
|--------|---------------|---------------|---------------|
| **Active Tenants** | 3-5 (beta) | 10-15 | 25+ |
| **Messages/Day** | 100-500 | 1,000-5,000 | 10,000+ |
| **Uptime** | 95% | 99% | 99.5% |
| **Avg Response Time** | <3s | <2s | <1.5s |
| **Test Coverage** | 60% | 75% | 85% |
| **Cost per 1K messages** | <$0.50 | <$0.40 | <$0.30 |

---

## 🚨 Risk Management

| Risk | Mitigation | Owner |
|------|-----------|-------|
| Anthropic API outage | OpenAI fallback (Priority 5) | Backend Team |
| Webhook timeouts | Message queue (Priority 3) | Backend Team |
| Database performance | Proper indexing, query optimization | Backend Team |
| Security breach | Regular audits, penetration testing | Security Team |
| Runaway costs | Pre-flight balance checks (✅ done) | Backend Team |
| Scalability limits | Load testing, auto-scaling | DevOps Team |

---

**Next Review:** Weekly until Phase 1 complete, then bi-weekly

**Questions or blockers?** Contact: Ludovic @ Runstate Ltd
