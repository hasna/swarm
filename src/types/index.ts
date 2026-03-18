// === Enums ===

export type AgentBackend = "claude" | "codex" | "gemini" | "pi" | "opencode" | "custom";

export type SwarmStatus = "pending" | "planning" | "running" | "paused" | "completed" | "failed" | "cancelled";

export type AgentStatus = "spawning" | "running" | "idle" | "completed" | "failed" | "killed" | "timeout";

export type LoopPhase = "goal" | "plan" | "decompose" | "dispatch" | "monitor" | "aggregate" | "reflect" | "repeat";

export type Topology = "pipeline" | "fanout" | "hierarchical" | "mesh" | "self-expanding" | "watchdog" | "auto";

export type TaskPriority = "low" | "medium" | "high" | "critical";

// === Agent Adapter ===

export interface AgentAdapterConfig {
  backend: AgentBackend;
  command: string;
  args: string[];
  env?: Record<string, string>;
  mcpConfigPath?: string;
  maxBudgetUsd?: number;
  maxTurns?: number;
  systemPrompt?: string;
  workdir?: string;
  timeout?: number;
}

export interface AgentEvent {
  type: "start" | "delta" | "tool_call" | "tool_result" | "error" | "done" | "heartbeat" | "unknown";
  timestamp: number;
  agentId: string;
  data: Record<string, unknown>;
}

export interface AgentProcess {
  id: string;
  name: string;
  backend: AgentBackend;
  pid: number;
  status: AgentStatus;
  taskId?: string;
  startedAt: number;
  lastHeartbeat: number;
  tokensUsed: number;
  costUsd: number;
  workdir: string;
}

// === Swarm ===

export interface SwarmConfig {
  id?: string;
  goal: string;
  topology: Topology;
  agents: AgentSlot[];
  maxAgents: number;
  maxBudgetUsd: number;
  maxDurationMs: number;
  workdir: string;
  mcpServers?: string[];
  systemPrompt?: string;
  promptSlug?: string;
  autoApprove?: boolean;
}

export interface AgentSlot {
  backend: AgentBackend;
  count: number;
  role?: string;
  skills?: string[];
  promptSlug?: string;
}

export interface Swarm {
  id: string;
  config: SwarmConfig;
  status: SwarmStatus;
  phase: LoopPhase;
  agents: AgentProcess[];
  taskListId?: string;
  startedAt: number;
  completedAt?: number;
  totalCostUsd: number;
  totalTokens: number;
  iterations: number;
  error?: string;
}

// === Deep Loop ===

export interface LoopContext {
  swarmId: string;
  goal: string;
  phase: LoopPhase;
  iteration: number;
  plan?: string;
  tasks: TaskRef[];
  results: AgentResult[];
  memories: string[];
  budget: BudgetState;
}

export interface TaskRef {
  id: string;
  title: string;
  status: string;
  assignedTo?: string;
  dependsOn?: string[];
}

export interface AgentResult {
  agentId: string;
  agentName: string;
  taskId: string;
  status: "success" | "failure" | "partial";
  output: string;
  filesChanged: string[];
  tokensUsed: number;
  costUsd: number;
  durationMs: number;
}

export interface BudgetState {
  maxUsd: number;
  spentUsd: number;
  remainingUsd: number;
  maxDurationMs: number;
  elapsedMs: number;
  remainingMs: number;
}

// === Events ===

export interface SwarmEvent {
  type: "swarm:started" | "swarm:phase_changed" | "swarm:completed" | "swarm:failed"
    | "agent:spawned" | "agent:completed" | "agent:failed" | "agent:killed"
    | "task:created" | "task:assigned" | "task:completed" | "task:failed"
    | "budget:warning" | "budget:exceeded"
    | "loop:iteration";
  timestamp: number;
  swarmId: string;
  data: Record<string, unknown>;
}

export type SwarmEventHandler = (event: SwarmEvent) => void | Promise<void>;

// === Database Row ===

export interface SwarmRow {
  id: string;
  config: string; // JSON
  status: SwarmStatus;
  phase: LoopPhase;
  started_at: number;
  completed_at: number | null;
  total_cost_usd: number;
  total_tokens: number;
  iterations: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentRow {
  id: string;
  swarm_id: string;
  name: string;
  backend: AgentBackend;
  pid: number;
  status: AgentStatus;
  task_id: string | null;
  started_at: number;
  last_heartbeat: number;
  tokens_used: number;
  cost_usd: number;
  workdir: string;
  created_at: string;
  updated_at: string;
}

export interface SwarmEventRow {
  id: number;
  swarm_id: string;
  type: string;
  data: string; // JSON
  created_at: string;
}
