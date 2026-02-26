-- Phase 5: Memory & Vector Search
-- Enable pgvector extension (requires superuser or the extension to be pre-installed)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memory_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  agent_id UUID NOT NULL REFERENCES agent_profiles(id),
  content TEXT NOT NULL,
  embedding vector(1536),
  category VARCHAR(50) DEFAULT 'general',
  importance DECIMAL(3,2) DEFAULT 0.5,
  metadata JSONB DEFAULT '{}',
  access_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector similarity index (IVFFlat for cosine distance)
CREATE INDEX IF NOT EXISTS idx_memory_embedding ON memory_entries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_memory_fts ON memory_entries USING gin (to_tsvector('english', content));
-- Agent lookup index
CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory_entries(agent_id, created_at DESC);
