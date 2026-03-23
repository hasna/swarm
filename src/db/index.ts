import { SqliteAdapter as Database } from "@hasna/cloud";
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import type { SwarmRow, AgentRow, SwarmEventRow, SwarmStatus, LoopPhase, AgentStatus } from "../types/index.js";

function getDataDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  const newDir = join(home, ".hasna", "swarm");
  const oldDir = join(home, ".swarm");

  // Auto-migrate old dir to new location
  if (existsSync(oldDir) && !existsSync(newDir)) {
    mkdirSync(newDir, { recursive: true });
    for (const file of readdirSync(oldDir)) {
      const oldPath = join(oldDir, file);
      if (statSync(oldPath).isFile()) {
        copyFileSync(oldPath, join(newDir, file));
      }
    }
  }

  mkdirSync(newDir, { recursive: true });
  return newDir;
}

const DEFAULT_DB_PATH = join(getDataDir(), "swarm.db");

let _db: Database | null = null;

export function getDbPath(): string {
  return process.env.SWARM_DB_PATH || DEFAULT_DB_PATH;
}

export function getDb(): Database {
  if (_db) return _db;
  const dbPath = getDbPath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  _db = new Database(dbPath);
  migrate(_db);
  return _db;
}

export function closeDb(): void {
  if (_db) { _db.close(); _db = null; }
}

function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS swarms (
      id TEXT PRIMARY KEY,
      config TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      phase TEXT NOT NULL DEFAULT 'goal',
      started_at INTEGER,
      completed_at INTEGER,
      total_cost_usd REAL NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      iterations INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      swarm_id TEXT NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      backend TEXT NOT NULL,
      pid INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'spawning',
      task_id TEXT,
      started_at INTEGER,
      last_heartbeat INTEGER,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      workdir TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS swarm_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      swarm_id TEXT NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now')),
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      message TEXT NOT NULL,
      email TEXT,
      category TEXT DEFAULT 'general',
      version TEXT,
      machine_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// === Swarm CRUD ===

export function createSwarm(row: Omit<SwarmRow, "created_at" | "updated_at">): SwarmRow {
  const db = getDb();
  db.run(
    `INSERT INTO swarms (id, config, status, phase, started_at, completed_at, total_cost_usd, total_tokens, iterations, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id, row.config, row.status, row.phase, row.started_at, row.completed_at, row.total_cost_usd, row.total_tokens, row.iterations, row.error
  );
  return getSwarm(row.id)!;
}

export function getSwarm(id: string): SwarmRow | null {
  return getDb().prepare("SELECT * FROM swarms WHERE id = ?").get(id) as SwarmRow | null;
}

export function listSwarms(limit = 20): SwarmRow[] {
  return getDb().prepare("SELECT * FROM swarms ORDER BY created_at DESC LIMIT ?").all(limit) as SwarmRow[];
}

export function updateSwarm(id: string, updates: Partial<Pick<SwarmRow, "status" | "phase" | "completed_at" | "total_cost_usd" | "total_tokens" | "iterations" | "error">>): void {
  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  vals.push(id);
  getDb().run(`UPDATE swarms SET ${sets.join(", ")} WHERE id = ?`, ...(vals as (string | number | null)[]));
}

export function deleteSwarm(id: string): void {
  getDb().run("DELETE FROM swarms WHERE id = ?", id);
}

// === Agent CRUD ===

export function createAgent(row: Omit<AgentRow, "created_at" | "updated_at">): AgentRow {
  const db = getDb();
  db.run(
    `INSERT INTO agents (id, swarm_id, name, backend, pid, status, task_id, started_at, last_heartbeat, tokens_used, cost_usd, workdir)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id, row.swarm_id, row.name, row.backend, row.pid, row.status, row.task_id, row.started_at, row.last_heartbeat, row.tokens_used, row.cost_usd, row.workdir
  );
  return getAgent(row.id)!;
}

export function getAgent(id: string): AgentRow | null {
  return getDb().prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRow | null;
}

export function listAgentsBySwarm(swarmId: string): AgentRow[] {
  return getDb().prepare("SELECT * FROM agents WHERE swarm_id = ? ORDER BY created_at").all(swarmId) as AgentRow[];
}

export function updateAgent(id: string, updates: Partial<Pick<AgentRow, "status" | "pid" | "task_id" | "last_heartbeat" | "tokens_used" | "cost_usd">>): void {
  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  vals.push(id);
  getDb().run(`UPDATE agents SET ${sets.join(", ")} WHERE id = ?`, ...(vals as (string | number | null)[]));
}

// === Events ===

export function insertEvent(swarmId: string, type: string, data: Record<string, unknown> = {}): void {
  getDb().run(
    "INSERT INTO swarm_events (swarm_id, type, data) VALUES (?, ?, ?)",
    swarmId, type, JSON.stringify(data)
  );
}

export function listEvents(swarmId: string, limit = 50): SwarmEventRow[] {
  return getDb().prepare("SELECT * FROM swarm_events WHERE swarm_id = ? ORDER BY id DESC LIMIT ?").all(swarmId, limit) as SwarmEventRow[];
}
