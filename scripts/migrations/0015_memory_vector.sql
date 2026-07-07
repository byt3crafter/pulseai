-- 0015_memory_vector.sql
-- Ensure agent long-term memory can do semantic (cosine) search: enable the
-- pgvector extension and make memory_entries.embedding a real vector(1536)
-- column with a cosine index. Fully idempotent — a safe no-op on environments
-- where this was already applied by hand (e.g. production, done 2026-07-07).

CREATE EXTENSION IF NOT EXISTS vector;

-- Convert embedding text -> vector(1536) only if it isn't already a vector.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memory_entries'
      AND column_name = 'embedding'
      AND udt_name <> 'vector'
  ) THEN
    ALTER TABLE memory_entries
      ALTER COLUMN embedding TYPE vector(1536)
      USING (
        CASE
          WHEN embedding IS NULL OR btrim(embedding::text) = '' THEN NULL
          ELSE embedding::text::vector
        END
      );
  END IF;
END $$;

-- Cosine-distance index for similarity search (matches hybrid-search.ts `<=>`).
CREATE INDEX IF NOT EXISTS idx_memory_embedding
  ON memory_entries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
