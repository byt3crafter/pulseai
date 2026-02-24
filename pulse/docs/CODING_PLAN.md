# Pulse AI - Coding Plan & Standards

## 🎯 Purpose

This document defines the **mandatory workflow** that all agents/developers must follow when implementing features for Pulse AI. Following this plan ensures:
- Consistent code quality
- Complete git history
- Testable implementations
- Production-ready code
- Easy handoffs between agents

---

## ⚠️ CRITICAL RULES - MUST FOLLOW

### 1. **COMMIT AFTER EACH FEATURE**
- ✅ **DO:** Commit immediately after completing each discrete feature
- ✅ **DO:** Commit even if feature is small (single file change)
- ❌ **DON'T:** Wait to commit multiple features at once
- ❌ **DON'T:** Leave uncommitted changes when switching tasks

### 2. **BUILD BEFORE COMMIT**
- ✅ **DO:** Run `npm run build` before every commit
- ✅ **DO:** Fix all TypeScript errors before committing
- ❌ **DON'T:** Commit code that doesn't compile
- ❌ **DON'T:** Skip build verification

### 3. **DESCRIPTIVE COMMIT MESSAGES**
- ✅ **DO:** Use conventional commit format (see below)
- ✅ **DO:** Include "Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
- ✅ **DO:** Explain what and why, not just what
- ❌ **DON'T:** Use vague messages like "update code" or "fix stuff"

### 4. **TEST YOUR CODE**
- ✅ **DO:** Manually test the feature works
- ✅ **DO:** Write automated tests when required
- ✅ **DO:** Document how to test in commit message
- ❌ **DON'T:** Commit untested code

---

## 📋 Implementation Workflow

### Phase 1: Planning (REQUIRED)

Before writing ANY code:

1. **Read existing code:**
   ```bash
   # Understand the module you're changing
   cat src/path/to/file.ts

   # Check related files
   grep -r "function_name" src/
   ```

2. **Check for existing implementations:**
   ```bash
   # Search for similar features
   grep -r "similar_pattern" src/

   # Review recent commits
   git log --oneline -20
   ```

3. **Create a task (if not exists):**
   ```typescript
   // Use TaskCreate for tracking
   TaskCreate({
     subject: "Implement feature X",
     description: "Detailed description...",
     activeForm: "Implementing feature X"
   })
   ```

4. **Document your plan:**
   ```markdown
   # What I will implement:
   - File X: Add function Y
   - File Z: Update config

   # Why:
   - Solves problem ABC

   # Testing approach:
   - Manual test: Do X, expect Y
   - Automated test: test/file.test.ts
   ```

### Phase 2: Implementation (CAREFUL)

1. **Read before modifying:**
   ```bash
   # ALWAYS read the full file before editing
   cat src/file.ts
   ```

2. **Make minimal changes:**
   - Change only what's necessary
   - Don't refactor unrelated code
   - Don't add features not requested
   - Keep it simple

3. **Follow existing patterns:**
   - Match the code style in the file
   - Use same imports as other files
   - Follow existing naming conventions
   - Maintain consistency

4. **Handle errors gracefully:**
   ```typescript
   // ✅ GOOD: Graceful error handling
   try {
     await riskyOperation();
   } catch (err) {
     logger.error({ err }, "Operation failed");
     return { error: "User-friendly message" };
   }

   // ❌ BAD: Silent failures
   await riskyOperation().catch(() => {});
   ```

### Phase 3: Verification (MANDATORY)

1. **Build the code:**
   ```bash
   cd /home/d0v1k/Projects/Pulse_AI/pulse
   npm run build
   ```

   **If build fails:** Fix ALL errors before proceeding.

2. **Test manually:**
   ```bash
   # Start the application
   docker-compose up --build

   # Test the feature works
   curl http://localhost:3000/your-endpoint

   # Check logs
   docker-compose logs -f pulse
   ```

3. **Verify no regressions:**
   - Test that old features still work
   - Check that you didn't break related code
   - Review changed files for unintended changes

### Phase 4: Commit (REQUIRED)

1. **Stage only related files:**
   ```bash
   # ✅ GOOD: Stage specific files
   git add src/feature/implementation.ts
   git add src/config.ts

   # ❌ BAD: Stage everything
   git add .
   ```

2. **Review what you're committing:**
   ```bash
   git diff --cached
   ```

3. **Use conventional commit format:**
   ```bash
   git commit -m "$(cat <<'EOF'
   feat: add feature X to solve problem Y

   Implement feature X by:
   - Adding function Z to file A
   - Updating config B with new option
   - Registering handler in C

   This solves problem Y by doing Z.

   Testing:
   - Manual: curl http://localhost:3000/test
   - Expected: {"status":"ok"}

   Files changed:
   - src/feature/implementation.ts (new)
   - src/config.ts (updated)

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   EOF
   )"
   ```

4. **Update task status:**
   ```typescript
   // Mark task as completed
   TaskUpdate({ taskId: "1", status: "completed" })
   ```

### Phase 5: Documentation (WHEN NEEDED)

Update docs if you:
- Added a new feature users interact with
- Changed environment variables
- Modified API endpoints
- Added new configuration options

```bash
# Update relevant docs
nano docs/API.md
nano docs/DEPLOYMENT.md

# Commit docs separately
git add docs/
git commit -m "docs: update API docs for feature X"
```

---

## 📝 Commit Message Format

### Template

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code restructuring (no behavior change)
- `perf:` - Performance improvement
- `docs:` - Documentation only
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks
- `style:` - Code style changes (formatting)

### Examples

**Good commits:**
```bash
# Feature implementation
feat: add email notification system

Implement email notifications using SendGrid API:
- Create EmailService class with send() method
- Add email templates for welcome/reset password
- Integrate with user registration flow
- Add EMAIL_API_KEY to environment config

Testing:
- Register new user, verify welcome email sent
- Request password reset, verify email received

Files:
- src/services/email.ts (new)
- src/templates/emails/ (new)
- src/auth/register.ts (updated)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

```bash
# Bug fix
fix: prevent duplicate message processing

Fix race condition where messages were processed twice:
- Add unique job ID based on message ID
- BullMQ now rejects duplicate jobs automatically
- Add test to verify deduplication

The issue occurred when webhooks retried during network issues.

Testing:
- Send same webhook twice rapidly
- Verify only one message in queue
- Check logs show "duplicate job rejected"

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

```bash
# Documentation
docs: add troubleshooting guide for queue issues

Add section to MONITORING.md covering:
- How to check queue stats
- Common queue backup causes
- Recovery procedures
- Monitoring recommendations

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

**Bad commits:**
```bash
# ❌ Too vague
git commit -m "update code"

# ❌ No context
git commit -m "fix bug"

# ❌ Multiple unrelated changes
git commit -m "add feature X, fix bug Y, update docs, refactor Z"

# ❌ Missing co-author
git commit -m "feat: add feature" # Missing Co-Authored-By line
```

---

## 🏗️ Code Standards

### TypeScript Style

```typescript
// ✅ GOOD: Clear, typed, documented
/**
 * Process an inbound message through the agent runtime
 * @param message - The inbound message to process
 * @param callback - Function to send responses
 * @returns Promise that resolves when processing completes
 */
async processMessage(
    message: InboundMessage,
    callback: (msg: OutboundMessage) => Promise<void>
): Promise<void> {
    const logger = this.logger.child({ messageId: message.id });

    try {
        logger.info("Processing message");
        await this.handleMessage(message, callback);
        logger.info("Message processed successfully");
    } catch (err) {
        logger.error({ err }, "Failed to process message");
        throw err;
    }
}

// ❌ BAD: No types, no logging, no error handling
async processMessage(message, callback) {
    await this.handleMessage(message, callback);
}
```

### Naming Conventions

```typescript
// ✅ GOOD: Clear, descriptive names
const messageQueue = new Queue("pulse-messages");
const enabledTools = await getEnabledTools(tenantId);
const costUsd = calculateCost(inputTokens, outputTokens);

// ❌ BAD: Unclear, abbreviated
const q = new Queue("msgs");
const tools = await getTools(id);
const cost = calc(in, out);
```

### Error Handling

```typescript
// ✅ GOOD: Structured logging, specific errors
try {
    const result = await externalAPI.call();
} catch (err: any) {
    logger.error(
        {
            err: {
                message: err.message,
                status: err.status,
                code: err.code
            },
            context: { userId, requestId }
        },
        "External API call failed"
    );

    if (err.status === 429) {
        throw new RateLimitError("API rate limit exceeded");
    }

    throw new Error("External service unavailable");
}

// ❌ BAD: Swallowed errors, no logging
try {
    await externalAPI.call();
} catch (err) {
    console.log(err);
}
```

### Imports

```typescript
// ✅ GOOD: Organized imports
import { Queue, Worker } from "bullmq";
import { InboundMessage } from "../channels/types.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";

// ❌ BAD: Unorganized, missing .js extension
import { Queue } from "bullmq";
import { config } from "../config";
import { logger } from "../utils/logger";
import { InboundMessage } from "../channels/types";
```

---

## ✅ Pre-Commit Checklist

Before EVERY commit, verify:

- [ ] Code compiles: `npm run build` ✅
- [ ] No TypeScript errors
- [ ] No console.log() statements (use logger)
- [ ] Error handling added where needed
- [ ] Logging added for important operations
- [ ] Feature manually tested
- [ ] No unrelated changes included
- [ ] Commit message is descriptive
- [ ] Co-Authored-By line included
- [ ] Task status updated

---

## 🧪 Testing Requirements

### When to Write Tests

**Always write tests for:**
- Billing calculations (money involved!)
- Authentication/authorization
- Data transformations
- Business logic
- API endpoints

**Tests recommended for:**
- Tool implementations
- Provider integrations
- Queue processing
- Rate limiting

**Tests optional for:**
- Simple getters/setters
- Configuration loading
- Logging statements

### Test Structure

```typescript
// test/unit/billing/calculate-cost.test.ts
import { describe, it, expect } from "vitest";
import { calculateCost } from "../../../src/billing/calculate-cost.js";

describe("calculateCost", () => {
    it("should calculate cost for Claude 3.7 Sonnet correctly", () => {
        const inputTokens = 1000;
        const outputTokens = 500;
        const pricing = { input: 3.0, output: 15.0 };

        const cost = calculateCost(inputTokens, outputTokens, pricing);

        // 1000 * $3.00 / 1M + 500 * $15.00 / 1M = $0.0105
        expect(cost).toBe(0.0105);
    });

    it("should handle zero tokens", () => {
        const cost = calculateCost(0, 0, { input: 3.0, output: 15.0 });
        expect(cost).toBe(0);
    });

    it("should throw on negative tokens", () => {
        expect(() => {
            calculateCost(-100, 500, { input: 3.0, output: 15.0 });
        }).toThrow("Tokens cannot be negative");
    });
});
```

---

## 📚 Documentation Requirements

### When to Update Docs

Update docs when you:
1. Add new environment variables → Update `.env.example` and `docs/DEPLOYMENT.md`
2. Add new API endpoints → Update `docs/API.md`
3. Change configuration → Update `docs/DEPLOYMENT.md`
4. Add new features → Update `README.md`
5. Change monitoring → Update `docs/MONITORING.md`

### Documentation Template

```markdown
## Feature Name

**Purpose:** What problem does this solve?

**Configuration:**
```bash
# .env
NEW_SETTING=value
```

**Usage:**
```bash
# How to use this feature
npm run command
```

**Testing:**
```bash
# How to verify it works
curl http://localhost:3000/endpoint
```

**Troubleshooting:**
- **Issue:** Common problem
- **Fix:** How to resolve it
```

---

## 🔄 Handoff Protocol

When passing work to another agent:

1. **Commit all work:**
   ```bash
   git status  # Should show "nothing to commit"
   ```

2. **Update IMPLEMENTATION_PROGRESS.md:**
   ```markdown
   ## Priority X: Feature Name (75%)
   **Status:** IN PROGRESS
   **Last Updated:** 2026-02-24

   **Completed:**
   - [x] Subtask A
   - [x] Subtask B

   **Remaining:**
   - [ ] Subtask C
   - [ ] Subtask D

   **Next Steps:**
   1. Implement subtask C in src/file.ts
   2. Test by doing X
   3. Commit with message "feat: complete subtask C"
   ```

3. **Update task status:**
   ```typescript
   TaskUpdate({
     taskId: "X",
     status: "in_progress",
     metadata: {
       progress: 75,
       nextSteps: "Implement subtask C"
     }
   })
   ```

4. **Document blockers:**
   ```markdown
   ## Blockers
   - Waiting for X API access
   - Need clarification on Y requirement
   ```

---

## 🚨 Common Mistakes to Avoid

### 1. Forgetting to Commit
```bash
# ❌ BAD: Implement 3 features, commit once
# Implement feature A
# Implement feature B
# Implement feature C
git add .
git commit -m "add features"

# ✅ GOOD: Commit after each feature
# Implement feature A
git add src/featureA.ts
git commit -m "feat: implement feature A"

# Implement feature B
git add src/featureB.ts
git commit -m "feat: implement feature B"
```

### 2. Not Building Before Commit
```bash
# ❌ BAD: Commit without building
git add src/file.ts
git commit -m "feat: add feature"
# Later: Build fails!

# ✅ GOOD: Build first
npm run build  # Fix any errors
git add src/file.ts
git commit -m "feat: add feature"
```

### 3. Vague Commit Messages
```bash
# ❌ BAD
git commit -m "update"
git commit -m "fix"
git commit -m "changes"

# ✅ GOOD
git commit -m "feat: add rate limiting to prevent API abuse"
git commit -m "fix: resolve race condition in message queue"
git commit -m "refactor: extract billing logic into service class"
```

### 4. Committing Broken Code
```bash
# ❌ BAD: Commit with TypeScript errors
# Error: Type 'string' is not assignable to type 'number'
git commit -m "feat: add feature"  # Don't do this!

# ✅ GOOD: Fix errors first
npm run build  # See errors
# Fix all errors
npm run build  # Success!
git commit -m "feat: add feature"
```

### 5. Not Testing
```bash
# ❌ BAD: Commit without testing
# Write code
git commit -m "feat: add endpoint"
# Later: Endpoint returns 500 error!

# ✅ GOOD: Test first
# Write code
npm run build
docker-compose up -d
curl http://localhost:3000/endpoint  # Verify it works
git commit -m "feat: add endpoint"
```

---

## 📊 Success Metrics

A well-implemented feature has:

- ✅ Compiles without errors
- ✅ Passes all tests (when tests exist)
- ✅ Works as demonstrated manually
- ✅ Committed with descriptive message
- ✅ Documentation updated (if needed)
- ✅ No unrelated changes
- ✅ Error handling added
- ✅ Logging added
- ✅ Follows existing patterns
- ✅ Task marked as complete

---

## 🎓 Quick Reference

### Every Implementation Must:
1. ✅ Read existing code first
2. ✅ Plan before coding
3. ✅ Make minimal changes
4. ✅ Build before commit (`npm run build`)
5. ✅ Test manually
6. ✅ Commit with good message
7. ✅ Include Co-Authored-By line
8. ✅ Update task status

### Commit Command Template:
```bash
npm run build && git add <files> && git commit -m "$(cat <<'EOF'
<type>: <subject>

<body explaining what and why>

Testing:
- <how to test>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

### When in Doubt:
1. Read existing code
2. Follow existing patterns
3. Keep changes minimal
4. Test thoroughly
5. Commit early and often

---

## 📞 Support

**Questions about standards?**
- Read this document first
- Check existing code for examples
- Review recent commits: `git log --oneline -20`

**Found an issue with these standards?**
- Update this document
- Commit with: `docs: improve coding standards`

**Not sure how to implement something?**
- Ask for clarification before coding
- Document your approach in commit message
- Add comments explaining complex logic

---

**Remember:** Good code is code that:
- Works correctly
- Is easy to understand
- Follows team standards
- Has clear commit history
- Can be maintained by others

**Follow this plan, and every agent will produce consistent, high-quality code!**
