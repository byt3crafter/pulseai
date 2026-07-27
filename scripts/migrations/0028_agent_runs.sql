-- Agent Runs: the operational task record that powers the AI Workforce OS
-- views (executive dashboard, task queue, replay, analytics, live profile
-- fields). One row per top-level agent invocation. Separate from usage_records
-- (billing) — this is the operations layer and snapshots its own cost/tokens.

CREATE TABLE IF NOT EXISTS agent_runs (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id),
    agent_profile_id   uuid REFERENCES agent_profiles(id),
    trigger            varchar(32) NOT NULL DEFAULT 'chat',
    trigger_ref        varchar(128),
    parent_run_id      uuid,
    status             varchar(16) NOT NULL DEFAULT 'running',
    title              text,
    model              varchar(100),
    input_tokens       integer NOT NULL DEFAULT 0,
    output_tokens      integer NOT NULL DEFAULT 0,
    cost_usd           numeric(10,6) NOT NULL DEFAULT 0,
    tool_call_count    integer NOT NULL DEFAULT 0,
    tool_calls         jsonb NOT NULL DEFAULT '[]'::jsonb,
    error              text,
    channel_type       varchar(50),
    channel_contact_id varchar(255),
    conversation_id    uuid,
    started_at         timestamptz NOT NULL DEFAULT now(),
    ended_at           timestamptz,
    duration_ms        integer,
    created_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant ON agent_runs (tenant_id, started_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent  ON agent_runs (agent_profile_id, started_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_parent ON agent_runs (parent_run_id);
