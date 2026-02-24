-- Seed demo tenant skills
-- This script enables the built-in tools for demo/testing purposes
-- Run this after setting up a demo tenant

-- First, ensure we have a demo tenant (you may need to adjust the tenant_id)
-- You can find your tenant ID by running: SELECT id, slug FROM tenants;

-- Example: Insert skills for a tenant with slug 'demo'
-- Replace with your actual tenant ID
INSERT INTO tenant_skills (tenant_id, skill_name, enabled, config)
SELECT
    t.id,
    skill_name,
    true,
    '{}'::jsonb
FROM tenants t
CROSS JOIN (
    VALUES
        ('get_current_time'),
        ('calculator')
) AS skills(skill_name)
WHERE t.slug = 'demo'
ON CONFLICT (tenant_id, skill_name) DO UPDATE
SET enabled = true;

-- Verify the skills were inserted
SELECT
    t.slug as tenant,
    ts.skill_name,
    ts.enabled
FROM tenant_skills ts
JOIN tenants t ON t.id = ts.tenant_id
ORDER BY t.slug, ts.skill_name;
