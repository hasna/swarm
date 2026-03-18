import type { LoopContext, LoopPhase, TaskRef, AgentResult, BudgetState } from "../../types/index.js";

export function createLoopContext(swarmId: string, goal: string, maxBudgetUsd: number, maxDurationMs: number): LoopContext {
  return {
    swarmId,
    goal,
    phase: "goal",
    iteration: 0,
    tasks: [],
    results: [],
    memories: [],
    budget: {
      maxUsd: maxBudgetUsd,
      spentUsd: 0,
      remainingUsd: maxBudgetUsd,
      maxDurationMs,
      elapsedMs: 0,
      remainingMs: maxDurationMs,
    },
  };
}

export function updateBudget(ctx: LoopContext, costUsd: number, elapsedMs: number): void {
  ctx.budget.spentUsd += costUsd;
  ctx.budget.remainingUsd = ctx.budget.maxUsd - ctx.budget.spentUsd;
  ctx.budget.elapsedMs += elapsedMs;
  ctx.budget.remainingMs = ctx.budget.maxDurationMs - ctx.budget.elapsedMs;
}

export function isBudgetExhausted(ctx: LoopContext): boolean {
  return ctx.budget.remainingUsd <= 0 || ctx.budget.remainingMs <= 0;
}

export function advancePhase(ctx: LoopContext, phase: LoopPhase): void {
  ctx.phase = phase;
}

export function allTasksComplete(ctx: LoopContext): boolean {
  return ctx.tasks.length > 0 && ctx.tasks.every(t => t.status === "completed" || t.status === "failed" || t.status === "cancelled");
}
