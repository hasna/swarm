#!/usr/bin/env bun
import { Command } from "commander";
import chalk from "chalk";
import { runSwarm } from "../lib/loop/engine.js";
import { getSwarm, listSwarms, listAgentsBySwarm, listEvents, deleteSwarm } from "../db/index.js";
import { listAdapters } from "../lib/adapters/index.js";
import type { SwarmConfig, AgentSlot, AgentBackend, LoopPhase } from "../types/index.js";

const program = new Command()
  .name("swarm")
  .description("Autonomous swarm orchestrator for headless AI agent CLIs")
  .version("0.0.1");

// === swarm run ===
program
  .command("run")
  .description("Start a swarm with a goal")
  .argument("<goal>", "The goal for the swarm to achieve")
  .option("-a, --agents <spec>", "Agent spec: claude:3,codex:1,gemini:1", "claude:1")
  .option("-t, --topology <type>", "Topology: pipeline, fanout, hierarchical, mesh, auto", "auto")
  .option("-b, --budget <usd>", "Max budget in USD", "10")
  .option("-d, --duration <ms>", "Max duration in ms", "600000")
  .option("-m, --max-agents <n>", "Max concurrent agents", "5")
  .option("-w, --workdir <path>", "Working directory", process.cwd())
  .option("--system-prompt <prompt>", "System prompt for all agents")
  .option("--json", "Output JSON")
  .action(async (goal, opts) => {
    const agents = parseAgentSpec(opts.agents);

    const config: SwarmConfig = {
      goal,
      topology: opts.topology as SwarmConfig["topology"],
      agents,
      maxAgents: parseInt(opts.maxAgents),
      maxBudgetUsd: parseFloat(opts.budget),
      maxDurationMs: parseInt(opts.duration),
      workdir: opts.workdir,
      systemPrompt: opts.systemPrompt,
    };

    if (!opts.json) {
      console.log(chalk.bold.cyan("\n  swarm") + " starting...");
      console.log(chalk.dim(`  Goal: ${goal}`));
      console.log(chalk.dim(`  Agents: ${opts.agents}`));
      console.log(chalk.dim(`  Topology: ${config.topology}`));
      console.log(chalk.dim(`  Budget: $${config.maxBudgetUsd}`));
      console.log();
    }

    const result = await runSwarm(config, {
      onPhaseChange: (phase) => {
        if (!opts.json) {
          const icon = phaseIcon(phase);
          console.log(chalk.yellow(`  ${icon} ${phase}`));
        }
      },
      onEvent: async (event) => {
        if (opts.json) {
          console.log(JSON.stringify(event));
        } else if (event.type === "agent:spawned") {
          console.log(chalk.green(`    + agent ${event.data.name} (${event.data.backend}) -> ${event.data.task}`));
        } else if (event.type === "task:completed") {
          console.log(chalk.green(`    ✓ ${event.data.task} (${event.data.agent})`));
        } else if (event.type === "task:failed") {
          console.log(chalk.red(`    ✗ ${event.data.task} (${event.data.agent})`));
        } else if (event.type === "budget:exceeded") {
          console.log(chalk.red(`    ! Budget exceeded`));
        }
      },
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log();
      const statusColor = result.status === "completed" ? chalk.green : chalk.red;
      console.log(statusColor(`  ${result.status === "completed" ? "✓" : "✗"} ${result.status}`));
      console.log(chalk.dim(`  Iterations: ${result.iterations} | Cost: $${result.totalCostUsd.toFixed(4)} | Tokens: ${result.totalTokens}`));
      console.log();
    }
  });

// === swarm status ===
program
  .command("status")
  .description("Show swarm status")
  .argument("[id]", "Swarm ID (default: latest)")
  .option("--json", "Output JSON")
  .action((id, opts) => {
    let swarm;
    if (id) {
      swarm = getSwarm(id);
    } else {
      const all = listSwarms(1);
      swarm = all[0];
    }

    if (!swarm) {
      console.log(chalk.red("No swarm found."));
      process.exit(1);
    }

    if (opts.json) {
      const agents = listAgentsBySwarm(swarm.id);
      console.log(JSON.stringify({ swarm, agents }, null, 2));
      return;
    }

    const config = JSON.parse(swarm.config);
    const agents = listAgentsBySwarm(swarm.id);
    const statusColor = swarm.status === "completed" ? chalk.green
      : swarm.status === "running" ? chalk.cyan
      : swarm.status === "failed" ? chalk.red
      : chalk.yellow;

    console.log();
    console.log(chalk.bold(`  Swarm: ${swarm.id}`) + `  ${statusColor(swarm.status)}  ${chalk.dim(`phase: ${swarm.phase}`)}`);
    console.log(chalk.dim(`  Goal: ${config.goal}`));
    console.log();

    if (agents.length > 0) {
      console.log(chalk.bold("  Agents:"));
      for (const a of agents) {
        const icon = a.status === "completed" ? chalk.green("●")
          : a.status === "running" ? chalk.cyan("●")
          : a.status === "failed" ? chalk.red("●")
          : chalk.dim("○");
        console.log(`  ${icon} ${a.name} (${a.backend})  ${chalk.dim(a.status)}  ${a.task_id ? chalk.dim(`task: ${a.task_id}`) : ""}`);
      }
      console.log();
    }

    console.log(chalk.dim(`  Cost: $${swarm.total_cost_usd.toFixed(4)} | Tokens: ${swarm.total_tokens} | Iterations: ${swarm.iterations}`));
    console.log();
  });

// === swarm list ===
program
  .command("list")
  .description("List recent swarms")
  .option("-n, --limit <n>", "Max results", "20")
  .option("--json", "Output JSON")
  .action((opts) => {
    const swarms = listSwarms(parseInt(opts.limit));

    if (opts.json) {
      console.log(JSON.stringify(swarms, null, 2));
      return;
    }

    if (swarms.length === 0) {
      console.log(chalk.dim("  No swarms found."));
      return;
    }

    console.log();
    for (const s of swarms) {
      const config = JSON.parse(s.config);
      const statusColor = s.status === "completed" ? chalk.green : s.status === "failed" ? chalk.red : chalk.yellow;
      console.log(`  ${chalk.bold(s.id)}  ${statusColor(s.status)}  ${chalk.dim(config.goal.slice(0, 60))}  $${s.total_cost_usd.toFixed(4)}`);
    }
    console.log();
  });

// === swarm agents ===
program
  .command("agents")
  .description("List agents for a swarm")
  .argument("[swarm-id]", "Swarm ID (default: latest)")
  .option("--json", "Output JSON")
  .action((swarmId, opts) => {
    if (!swarmId) {
      const all = listSwarms(1);
      swarmId = all[0]?.id;
    }
    if (!swarmId) {
      console.log(chalk.red("No swarm found."));
      process.exit(1);
    }

    const agents = listAgentsBySwarm(swarmId);
    if (opts.json) {
      console.log(JSON.stringify(agents, null, 2));
      return;
    }

    console.log();
    for (const a of agents) {
      console.log(`  ${a.name}  ${a.backend}  ${a.status}  pid:${a.pid}  $${a.cost_usd.toFixed(4)}  ${a.tokens_used} tokens`);
    }
    console.log();
  });

// === swarm events ===
program
  .command("events")
  .description("Show swarm events")
  .argument("[swarm-id]", "Swarm ID (default: latest)")
  .option("-n, --limit <n>", "Max events", "50")
  .option("--json", "Output JSON")
  .action((swarmId, opts) => {
    if (!swarmId) {
      const all = listSwarms(1);
      swarmId = all[0]?.id;
    }
    if (!swarmId) {
      console.log(chalk.red("No swarm found."));
      process.exit(1);
    }

    const events = listEvents(swarmId, parseInt(opts.limit));
    if (opts.json) {
      console.log(JSON.stringify(events, null, 2));
      return;
    }

    for (const e of events.reverse()) {
      console.log(`  ${chalk.dim(e.created_at)}  ${chalk.yellow(e.type)}  ${chalk.dim(e.data)}`);
    }
  });

// === swarm adapters ===
program
  .command("adapters")
  .description("List available agent backends")
  .action(() => {
    console.log();
    for (const name of listAdapters()) {
      console.log(`  ${chalk.bold(name)}`);
    }
    console.log();
  });

// === swarm delete ===
program
  .command("delete")
  .description("Delete a swarm")
  .argument("<id>", "Swarm ID")
  .action((id) => {
    deleteSwarm(id);
    console.log(chalk.green(`  Deleted swarm ${id}`));
  });

// === Helpers ===

function parseAgentSpec(spec: string): AgentSlot[] {
  return spec.split(",").map((s) => {
    const [backend, count] = s.split(":");
    return {
      backend: (backend || "claude") as AgentBackend,
      count: parseInt(count || "1"),
    };
  });
}

function phaseIcon(phase: LoopPhase): string {
  const icons: Record<LoopPhase, string> = {
    goal: "◎",
    plan: "◈",
    decompose: "◇",
    dispatch: "▶",
    monitor: "◉",
    aggregate: "◆",
    reflect: "◑",
    repeat: "↻",
  };
  return icons[phase] || "·";
}

program.parse();
