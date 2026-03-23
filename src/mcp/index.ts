#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runSwarm } from "../lib/loop/engine.js";
import { getSwarm, listSwarms, listAgentsBySwarm, listEvents, deleteSwarm } from "../db/index.js";
import { listAdapters } from "../lib/adapters/index.js";
import { registerAgent, heartbeat, listAgentsPresence } from "../lib/presence.js";
import type { SwarmConfig, AgentSlot, AgentBackend } from "../types/index.js";

const server = new McpServer({
  name: "swarm",
  version: "0.0.1",
});

// === swarm_run ===
server.tool(
  "swarm_run",
  "Start an autonomous swarm with a goal. Spawns headless AI agents (Claude Code, Codex, Gemini) as subprocesses.",
  {
    goal: z.string().describe("The goal for the swarm to achieve"),
    agents: z.string().optional().describe("Agent spec: claude:3,codex:1 (default: claude:1)"),
    topology: z.enum(["pipeline", "fanout", "hierarchical", "mesh", "self-expanding", "watchdog", "auto"]).optional().describe("Swarm topology (default: auto)"),
    max_budget_usd: z.number().optional().describe("Max budget in USD (default: 10)"),
    max_agents: z.number().optional().describe("Max concurrent agents (default: 5)"),
    max_duration_ms: z.number().optional().describe("Max duration in ms (default: 600000)"),
    workdir: z.string().optional().describe("Working directory (default: cwd)"),
    system_prompt: z.string().optional().describe("System prompt for all agents"),
  },
  async (params) => {
    const agents = parseAgentSpec(params.agents || "claude:1");
    const config: SwarmConfig = {
      goal: params.goal,
      topology: params.topology || "auto",
      agents,
      maxAgents: params.max_agents || 5,
      maxBudgetUsd: params.max_budget_usd || 10,
      maxDurationMs: params.max_duration_ms || 600000,
      workdir: params.workdir || process.cwd(),
      systemPrompt: params.system_prompt,
    };

    const result = await runSwarm(config);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// === swarm_status ===
server.tool(
  "swarm_status",
  "Get status of a swarm (or latest if no ID given)",
  {
    id: z.string().optional().describe("Swarm ID (default: latest)"),
  },
  async (params) => {
    let swarm;
    if (params.id) {
      swarm = getSwarm(params.id);
    } else {
      swarm = listSwarms(1)[0];
    }
    if (!swarm) return { content: [{ type: "text" as const, text: "No swarm found" }] };

    const agents = listAgentsBySwarm(swarm.id);
    return { content: [{ type: "text" as const, text: JSON.stringify({ swarm, agents }, null, 2) }] };
  }
);

// === swarm_list ===
server.tool(
  "swarm_list",
  "List recent swarms",
  {
    limit: z.number().optional().describe("Max results (default: 20)"),
  },
  async (params) => {
    const swarms = listSwarms(params.limit || 20);
    return { content: [{ type: "text" as const, text: JSON.stringify(swarms, null, 2) }] };
  }
);

// === swarm_agents ===
server.tool(
  "swarm_agents",
  "List agents for a swarm",
  {
    swarm_id: z.string().optional().describe("Swarm ID (default: latest)"),
  },
  async (params) => {
    const swarmId = params.swarm_id || listSwarms(1)[0]?.id;
    if (!swarmId) return { content: [{ type: "text" as const, text: "No swarm found" }] };
    const agents = listAgentsBySwarm(swarmId);
    return { content: [{ type: "text" as const, text: JSON.stringify(agents, null, 2) }] };
  }
);

// === swarm_events ===
server.tool(
  "swarm_events",
  "Show events for a swarm",
  {
    swarm_id: z.string().optional().describe("Swarm ID (default: latest)"),
    limit: z.number().optional().describe("Max events (default: 50)"),
  },
  async (params) => {
    const swarmId = params.swarm_id || listSwarms(1)[0]?.id;
    if (!swarmId) return { content: [{ type: "text" as const, text: "No swarm found" }] };
    const events = listEvents(swarmId, params.limit || 50);
    return { content: [{ type: "text" as const, text: JSON.stringify(events, null, 2) }] };
  }
);

// === swarm_adapters ===
server.tool(
  "swarm_adapters",
  "List available agent backends",
  {},
  async () => {
    return { content: [{ type: "text" as const, text: JSON.stringify(listAdapters()) }] };
  }
);

// === swarm_delete ===
server.tool(
  "swarm_delete",
  "Delete a swarm and all its agents/events",
  {
    id: z.string().describe("Swarm ID to delete"),
  },
  async (params) => {
    deleteSwarm(params.id);
    return { content: [{ type: "text" as const, text: `Deleted swarm ${params.id}` }] };
  }
);

// === Agent presence tools ===

server.tool(
  "register_agent",
  "Register an agent with presence tracking.",
  {
    name: z.string(),
    session_id: z.string(),
    role: z.string().optional(),
    project_id: z.string().optional(),
  },
  async (params) => {
    try {
      const result = registerAgent(params.name, params.session_id, params.role, params.project_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: e.message ?? String(e) }], isError: true };
    }
  }
);

server.tool(
  "heartbeat",
  "Send presence heartbeat.",
  {
    from: z.string().optional(),
    status: z.string().optional(),
  },
  async (params) => {
    const agent = params.from || "unknown";
    heartbeat(agent, params.status);
    return { content: [{ type: "text" as const, text: JSON.stringify({ agent, status: params.status || "online", heartbeat: true }) }] };
  }
);

server.tool(
  "list_agents",
  "List agents with presence status.",
  {
    online_only: z.boolean().optional(),
  },
  async (params) => {
    const agents = listAgentsPresence({ online_only: params.online_only });
    return { content: [{ type: "text" as const, text: JSON.stringify(agents) }] };
  }
);

server.tool(
  "set_focus",
  "Set agent focus to a project.",
  {
    project_id: z.string(),
    from: z.string().optional(),
  },
  async (params) => {
    const agent = params.from || "unknown";
    const db = (await import("../db/index.js")).getDb();
    db.prepare("UPDATE agent_presence SET project_id = ? WHERE agent = ?").run(params.project_id, agent);
    return { content: [{ type: "text" as const, text: JSON.stringify({ agent, focused: true, project_id: params.project_id }) }] };
  }
);

server.tool(
  "send_feedback",
  "Send feedback about this service",
  {
    message: z.string(),
    email: z.string().optional(),
    category: z.enum(["bug", "feature", "general"]).optional(),
  },
  async (params) => {
    try {
      const db = (await import("../db/index.js")).getDb();
      db.prepare("INSERT INTO feedback (message, email, category, version) VALUES (?, ?, ?, ?)").run(params.message, params.email || null, params.category || "general", "0.0.1");
      return { content: [{ type: "text" as const, text: "Feedback saved. Thank you!" }] };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: String(e) }], isError: true };
    }
  }
);

// === Helpers ===
function parseAgentSpec(spec: string): AgentSlot[] {
  return spec.split(",").map((s) => {
    const [backend, count] = s.split(":");
    return { backend: (backend || "claude") as AgentBackend, count: parseInt(count || "1") };
  });
}

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
