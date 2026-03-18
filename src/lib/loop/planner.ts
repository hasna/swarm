import type { LoopContext, TaskRef, Topology } from "../../types/index.js";

/**
 * The planner takes a goal and produces a task DAG.
 * In v1, this uses a simple heuristic decomposition.
 * In v2, this will call an LLM to plan.
 */

export interface PlanResult {
  tasks: PlanTask[];
  topology: Topology;
  reasoning: string;
}

export interface PlanTask {
  title: string;
  description: string;
  role: string; // e.g. "developer", "reviewer", "qa", "researcher"
  dependsOn?: string[]; // titles of tasks this depends on
  backend?: string; // preferred backend
  priority: "low" | "medium" | "high" | "critical";
}

export function planFromGoal(ctx: LoopContext): PlanResult {
  const goal = ctx.goal.toLowerCase();

  // Detect topology from goal keywords
  let topology: Topology = "auto";
  if (goal.includes("review") || goal.includes("ship") || goal.includes("deploy")) {
    topology = "pipeline";
  } else if (goal.includes("research") || goal.includes("search") || goal.includes("find")) {
    topology = "fanout";
  } else if (goal.includes("test") || goal.includes("qa")) {
    topology = "fanout";
  } else if (goal.includes("build") || goal.includes("implement") || goal.includes("create")) {
    topology = "pipeline";
  }

  // Generate default task decomposition
  const tasks: PlanTask[] = [];

  if (topology === "pipeline") {
    tasks.push(
      { title: "Plan implementation", description: `Analyze the goal and create a detailed plan: ${ctx.goal}`, role: "planner", priority: "high" },
      { title: "Implement changes", description: `Execute the plan for: ${ctx.goal}`, role: "developer", dependsOn: ["Plan implementation"], priority: "high" },
      { title: "Review changes", description: `Review all changes made for: ${ctx.goal}`, role: "reviewer", dependsOn: ["Implement changes"], priority: "medium" },
      { title: "Run tests", description: `Run tests and QA for: ${ctx.goal}`, role: "qa", dependsOn: ["Implement changes"], priority: "medium" },
    );
  } else if (topology === "fanout") {
    tasks.push(
      { title: "Execute goal", description: ctx.goal, role: "worker", priority: "high" },
    );
  } else {
    tasks.push(
      { title: "Execute goal", description: ctx.goal, role: "worker", priority: "high" },
    );
  }

  return {
    tasks,
    topology,
    reasoning: `Auto-detected topology '${topology}' from goal keywords. Generated ${tasks.length} tasks.`,
  };
}

/**
 * Convert PlanResult tasks to TaskRef array (after creating in todos MCP)
 */
export function planTasksToRefs(tasks: PlanTask[], idPrefix: string): TaskRef[] {
  return tasks.map((t, i) => ({
    id: `${idPrefix}-${i}`,
    title: t.title,
    status: "pending",
    dependsOn: t.dependsOn,
  }));
}
