#!/usr/bin/env bun
import { runSwarm } from "../lib/loop/engine.js";
import { getSwarm, listSwarms, listAgentsBySwarm, listEvents, deleteSwarm } from "../db/index.js";
import { listAdapters } from "../lib/adapters/index.js";
import type { SwarmConfig, AgentSlot, AgentBackend } from "../types/index.js";

const PORT = parseInt(process.env.SWARM_PORT || "19440");

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // CORS
    if (method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });

    try {
      // GET /api/swarms
      if (method === "GET" && path === "/api/swarms") {
        const limit = parseInt(url.searchParams.get("limit") || "20");
        return json(listSwarms(limit));
      }

      // POST /api/swarms (run a new swarm)
      if (method === "POST" && path === "/api/swarms") {
        const body = await req.json() as Record<string, unknown>;
        const agents = parseAgentSpec(String(body.agents || "claude:1"));
        const config: SwarmConfig = {
          goal: String(body.goal),
          topology: (body.topology as SwarmConfig["topology"]) || "auto",
          agents,
          maxAgents: Number(body.max_agents) || 5,
          maxBudgetUsd: Number(body.max_budget_usd) || 10,
          maxDurationMs: Number(body.max_duration_ms) || 600000,
          workdir: String(body.workdir || process.cwd()),
          systemPrompt: body.system_prompt ? String(body.system_prompt) : undefined,
        };
        const result = await runSwarm(config);
        return json(result, 201);
      }

      // GET /api/swarms/:id
      if (method === "GET" && path.match(/^\/api\/swarms\/[^/]+$/)) {
        const id = path.split("/").pop()!;
        const swarm = getSwarm(id);
        if (!swarm) return json({ error: "Not found" }, 404);
        const agents = listAgentsBySwarm(id);
        return json({ swarm, agents });
      }

      // DELETE /api/swarms/:id
      if (method === "DELETE" && path.match(/^\/api\/swarms\/[^/]+$/)) {
        const id = path.split("/").pop()!;
        deleteSwarm(id);
        return json({ ok: true });
      }

      // GET /api/swarms/:id/agents
      if (method === "GET" && path.match(/^\/api\/swarms\/[^/]+\/agents$/)) {
        const id = path.split("/")[3]!;
        return json(listAgentsBySwarm(id));
      }

      // GET /api/swarms/:id/events
      if (method === "GET" && path.match(/^\/api\/swarms\/[^/]+\/events$/)) {
        const id = path.split("/")[3]!;
        const limit = parseInt(url.searchParams.get("limit") || "50");
        return json(listEvents(id, limit));
      }

      // GET /api/adapters
      if (method === "GET" && path === "/api/adapters") {
        return json(listAdapters());
      }

      // GET /api/stats
      if (method === "GET" && path === "/api/stats") {
        const swarms = listSwarms(1000);
        const totalCost = swarms.reduce((s, r) => s + r.total_cost_usd, 0);
        const totalTokens = swarms.reduce((s, r) => s + r.total_tokens, 0);
        return json({
          total_swarms: swarms.length,
          running: swarms.filter(s => s.status === "running").length,
          completed: swarms.filter(s => s.status === "completed").length,
          failed: swarms.filter(s => s.status === "failed").length,
          total_cost_usd: totalCost,
          total_tokens: totalTokens,
        });
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json({ error: msg }, 500);
    }
  },
});

function parseAgentSpec(spec: string): AgentSlot[] {
  return spec.split(",").map((s) => {
    const [backend, count] = s.split(":");
    return { backend: (backend || "claude") as AgentBackend, count: parseInt(count || "1") };
  });
}

console.log(`swarm-serve running on http://localhost:${PORT}`);
