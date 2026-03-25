/**
 * PostgreSQL migrations for open-swarm cloud sync.
 *
 * Equivalent of the SQLite schema in db/index.ts, translated for PostgreSQL.
 */
export const PG_MIGRATIONS: string[] = [
  // Migration 1: Full schema
  `
  CREATE TABLE IF NOT EXISTS swarms (
    id TEXT PRIMARY KEY,
    config TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    phase TEXT NOT NULL DEFAULT 'goal',
    started_at BIGINT,
    completed_at BIGINT,
    total_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_tokens BIGINT NOT NULL DEFAULT 0,
    iterations INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    backend TEXT NOT NULL,
    pid INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'spawning',
    task_id TEXT,
    started_at BIGINT,
    last_heartbeat BIGINT,
    tokens_used BIGINT NOT NULL DEFAULT 0,
    cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    workdir TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS swarm_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    swarm_id TEXT NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_agents_swarm ON agents(swarm_id);
  CREATE INDEX IF NOT EXISTS idx_events_swarm ON swarm_events(swarm_id);
  CREATE INDEX IF NOT EXISTS idx_events_type ON swarm_events(type);

  CREATE TABLE IF NOT EXISTS agent_presence (
    id TEXT NOT NULL DEFAULT '',
    agent TEXT PRIMARY KEY,
    session_id TEXT,
    role TEXT NOT NULL DEFAULT 'agent',
    project_id TEXT,
    status TEXT NOT NULL DEFAULT 'online',
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata TEXT
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    message TEXT NOT NULL,
    email TEXT,
    category TEXT DEFAULT 'general',
    version TEXT,
    machine_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  INSERT INTO _migrations (id) VALUES (1) ON CONFLICT DO NOTHING;
  `,
];
