-- Enable the new native email tools for any tenant that already uses email.
-- tenant_skills gates which built-in tools an agent can call (by tool name).
-- The Himalaya-grade email tools (reply/search/flag/move/delete/folders/fetch_unread)
-- are new tool names, so existing tenants need rows or they'd be gated off.
-- Idempotent: ON CONFLICT on the (tenant_id, skill_name) unique index.
INSERT INTO tenant_skills (tenant_id, skill_name, enabled)
SELECT DISTINCT e.tenant_id, s.name, true
FROM tenant_skills e
CROSS JOIN (VALUES
    ('email_reply'),
    ('email_search'),
    ('email_flag'),
    ('email_move'),
    ('email_delete'),
    ('email_folders'),
    ('email_fetch_unread')
) AS s(name)
WHERE e.skill_name = 'email_send' AND e.enabled = true
ON CONFLICT (tenant_id, skill_name) DO NOTHING;
