-- Phase 6: Cron / Scheduled Jobs
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  agent_id UUID NOT NULL REFERENCES agent_profiles(id),
  name VARCHAR(255) NOT NULL,
  schedule_type VARCHAR(10) NOT NULL,
  cron_expression VARCHAR(100),
  interval_seconds INTEGER,
  run_at TIMESTAMPTZ,
  message TEXT NOT NULL,
  timezone VARCHAR(50) DEFAULT 'UTC',
  enabled BOOLEAN DEFAULT true,
  max_retries INTEGER DEFAULT 3,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  webhook_token VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jobs_next_run ON scheduled_jobs(next_run_at) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON scheduled_jobs(tenant_id);

CREATE TABLE IF NOT EXISTS job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  status VARCHAR(20) NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  result TEXT,
  error TEXT,
  tokens_used INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_job_runs_job ON job_runs(job_id, started_at DESC);
