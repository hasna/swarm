import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import type { SwarmRow, AgentRow, SwarmEventRow, SwarmStatus, LoopPhase, AgentStatus } from "../types/index.js";

const DEFAULT_DB_DIR = join(process.env.HOME || "~", ".swarm");
const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, "swarm.db");

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
  _db.exec("PRAGMA journal_mode=WAL");
  _db.exec("PRAGMA foreign_keys=ON");
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
  `);
}

// === Swarm CRUD ===

export function createSwarm(row: Omit<SwarmRow, "created_at" | "updated_at">): SwarmRow {
  const db = getDb();
  db.run(
    `INSERT INTO swarms (id, config, status, phase, started_at, completed_at, total_cost_usd, total_tokens, iterations, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.config, row.status, row.phase, row.started_at, row.completed_at, row.total_cost_usd, row.total_tokens, row.iterations, row.error]
  );
  return getSwarm(row.id)!;
}

export function getSwarm(id: string): SwarmRow | null {
  return getDb().query("SELECT * FROM swarms WHERE id = ?").get(id) as SwarmRow | null;
}

export function listSwarms(limit = 20): SwarmRow[] {
  return getDb().query("SELECT * FROM swarms ORDER BY created_at DESC LIMIT ?").all(limit) as SwarmRow[];
}

export function updateSwarm(id: string, updates: Partial<Pick<SwarmRow, "status" | "phase" | "completed_at" | "total_cost_usd" | "total_tokens" | "iterations" | "error">>): void {
  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  vals.push(id);
  getDb().run(`UPDATE swarms SET ${sets.join(", ")} WHERE id = ?`, vals as (string | number | null)[]);
}

export function deleteSwarm(id: string): void {
  getDb().run("DELETE FROM swarms WHERE id = ?", [id]);
}

// === Agent CRUD ===

export function createAgent(row: Omit<AgentRow, "created_at" | "updated_at">): AgentRow {
  const db = getDb();
  db.run(
    `INSERT INTO agents (id, swarm_id, name, backend, pid, status, task_id, started_at, last_heartbeat, tokens_used, cost_usd, workdir)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.swarm_id, row.name, row.backend, row.pid, row.status, row.task_id, row.started_at, row.last_heartbeat, row.tokens_used, row.cost_usd, row.workdir]
  );
  return getAgent(row.id)!;
}

export function getAgent(id: string): AgentRow | null {
  return getDb().query("SELECT * FROM agents WHERE id = ?").get(id) as AgentRow | null;
}

export function listAgentsBySwarm(swarmId: string): AgentRow[] {
  return getDb().query("SELECT * FROM agents WHERE swarm_id = ? ORDER BY created_at").all(swarmId) as AgentRow[];
}

export function updateAgent(id: string, updates: Partial<Pick<AgentRow, "status" | "pid" | "task_id" | "last_heartbeat" | "tokens_used" | "cost_usd">>): void {
  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  vals.push(id);
  getDb().run(`UPDATE agents SET ${sets.join(", ")} WHERE id = ?`, vals as (string | number | null)[]);
}

// === Events ===

export function insertEvent(swarmId: string, type: string, data: Record<string, unknown> = {}): void {
  getDb().run(
    "INSERT INTO swarm_events (swarm_id, type, data) VALUES (?, ?, ?)",
    [swarmId, type, JSON.stringify(data)]
  );
}

export function listEvents(swarmId: string, limit = 50): SwarmEventRow[] {
  return getDb().query("SELECT * FROM swarm_events WHERE swarm_id = ? ORDER BY id DESC LIMIT ?").all(swarmId, limit) as SwarmEventRow[];
}
