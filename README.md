# @hasna/swarm

Autonomous swarm orchestrator that spawns and coordinates headless AI agent CLIs (Claude Code, Codex, Gemini) as subprocesses, connected through the open-source hasna stack.

```bash
bun install -g @hasna/swarm
```

---

## Quick Start

```bash
# Run a swarm with a goal
swarm run "Build user authentication with OAuth"

# Mix agent backends
swarm run "Research AI dev tools" --agents claude:3,codex:1,gemini:1

# Set budget and topology
swarm run "QA test all flows" --budget 50 --topology fanout --max-agents 10

# Check status
swarm status

# List recent swarms
swarm list

# View agents
swarm agents

# View events
swarm events
```

---

## How It Works

open-swarm doesn't DO the work. It CONDUCTS. Like a conductor doesn't play instruments — it coordinates the orchestra.

### The Deep Loop

```
GOAL → PLAN → DECOMPOSE → DISPATCH → MONITOR → AGGREGATE → REFLECT → REPEAT
```

| Phase | What Happens |
|---|---|
| **Goal** | User states intent via CLI |
| **Plan** | Orchestrator designs strategy |
| **Decompose** | Break goal into task DAG with dependencies |
| **Dispatch** | Spawn headless agents, each gets a task |
| **Monitor** | Stream JSON from all agents, track health & cost |
| **Aggregate** | Collect outputs, merge results |
| **Reflect** | Evaluate what worked/failed, save learnings |
| **Repeat** | New tasks emerge, loop continues |

### Agent Backends

| Backend | Headless Command | Output Format |
|---|---|---|
| **Claude Code** | `claude -p "..." --output-format stream-json` | NDJSON stream |
| **Codex** | `codex exec "..." --full-auto` | Plain text |
| **Gemini** | `gemini -p "..."` | NDJSON stream |

### Swarm Topologies

| Topology | Use Case |
|---|---|
| `pipeline` | Plan → Build → Review → QA → Ship |
| `fanout` | Parallel workers on independent tasks |
| `hierarchical` | Lead agent delegates to workers |
| `mesh` | All agents peer-to-peer |
| `self-expanding` | Agents create new tasks as they discover work |
| `watchdog` | Monitor agent respawns on failure |
| `auto` | Auto-detected from goal keywords |

---

## MCP Server

```json
{
  "mcpServers": {
    "swarm": {
      "command": "swarm-mcp"
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|---|---|
| `swarm_run` | Start an autonomous swarm with a goal |
| `swarm_status` | Get status of a swarm |
| `swarm_list` | List recent swarms |
| `swarm_agents` | List agents for a swarm |
| `swarm_events` | Show swarm events |
| `swarm_adapters` | List available agent backends |
| `swarm_delete` | Delete a swarm |

---

## REST API

```bash
swarm-serve   # starts on port 19440
```

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/swarms` | List swarms |
| POST | `/api/swarms` | Start a new swarm |
| GET | `/api/swarms/:id` | Get swarm with agents |
| DELETE | `/api/swarms/:id` | Delete swarm |
| GET | `/api/swarms/:id/agents` | List agents |
| GET | `/api/swarms/:id/events` | List events |
| GET | `/api/adapters` | List backends |
| GET | `/api/stats` | Aggregate stats |

---

## SDK

```typescript
import { runSwarm } from "@hasna/swarm"

const result = await runSwarm({
  goal: "Build user auth",
  topology: "pipeline",
  agents: [{ backend: "claude", count: 2 }],
  maxAgents: 5,
  maxBudgetUsd: 10,
  maxDurationMs: 600000,
  workdir: process.cwd(),
})

console.log(result.status)       // "completed"
console.log(result.totalCostUsd) // 2.14
console.log(result.iterations)   // 3
```

---

## Connected Stack

open-swarm orchestrates agents through these existing tools:

| Tool | Role |
|---|---|
| open-todos | Task queue & dependencies |
| open-mementos | Shared memory & knowledge graph |
| open-conversations | Inter-agent messaging |
| open-prompts | Reusable prompt templates |
| open-skills | 202 capability templates |
| open-connectors | 126 external APIs |
| open-testers | Autonomous QA |
| open-economy | Cost tracking & budgets |
| open-sessions | Session search & history |
| open-configs | Agent configuration profiles |
| open-sandboxes | Isolated execution |
| open-terminal | Token-efficient command execution |

---

## Database

SQLite at `~/.swarm/swarm.db` (override with `SWARM_DB_PATH`).

---

## License

Apache-2.0
