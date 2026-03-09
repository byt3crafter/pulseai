---
name: email
description: Send and read emails via SMTP/IMAP. Use when asked to send emails, check inbox, or manage email communications.
---

# Email Communication

## When to Use
- User asks you to send an email
- User asks to check their inbox or read emails
- User asks to list recent messages
- User wants you to compose and send a message to someone
- Automated tasks that need to send reports or notifications via email

## Tools
- **email_send** — Send an email via SMTP
- **email_read** — Read recent emails from inbox (with details)
- **email_list** — List inbox messages (subject, sender, date only)

## How to Use

### Sending Emails
1. Compose a clear, professional email
2. Use `email_send` with `to`, `subject`, and `body`
3. Optionally provide `html` for rich formatting
4. Confirm to the user that the email was sent

Always confirm the recipient and subject with the user before sending, unless the context is unambiguous.

### Reading Emails
- Use `email_list` for a quick overview of recent messages
- Use `email_read` when you need full details or message content
- Default is 10 most recent — adjust `count` if the user needs more

### Composing Good Emails
- Use a clear, descriptive subject line
- Keep the body concise and professional
- Match the tone to the context (formal for business, casual for internal)
- Include a greeting and sign-off
- Don't include sensitive information unless the user explicitly requests it

## Patterns

### Sending Reports
1. Generate or gather the data
2. Format it clearly (tables, bullet points)
3. Compose email with the report as body
4. Send and confirm

### Checking for Specific Emails
1. Use `email_list` to scan subjects
2. If found, use `email_read` for full details
3. Summarize findings for the user

### Automated Notifications
For scheduled tasks that send emails:
- Keep subject lines consistent and identifiable
- Include the date/time in the subject
- Use plain text body for reliability
