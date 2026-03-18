import { BaseAdapter } from "./base.js";
import type { AgentAdapterConfig, AgentEvent, AgentBackend } from "../../types/index.js";

export class CodexAdapter extends BaseAdapter {
  backend: AgentBackend = "codex";

  buildCommand(config: AgentAdapterConfig): { cmd: string[]; env?: Record<string, string> } {
    const cmd = [
      "codex",
      "exec",
      config.args[0] || config.command, // prompt
      "--full-auto",
    ];

    return { cmd };
  }

  parseEvent(line: string, agentId: string): AgentEvent | null {
    const now = Date.now();

    // Codex outputs plain text, not JSON streams
    // Detect patterns in output
    if (line.startsWith("Running:") || line.startsWith("Executing:")) {
      return {
        type: "tool_call",
        timestamp: now,
        agentId,
        data: { tool: "bash", command: line },
      };
    }

    if (line.includes("Error:") || line.includes("FAIL")) {
      return { type: "error", timestamp: now, agentId, data: { text: line } };
    }

    // Try JSON parse in case codex adds structured output
    try {
      const raw = JSON.parse(line);
      return { type: raw.type || "unknown", timestamp: now, agentId, data: raw };
    } catch {
      return { type: "delta", timestamp: now, agentId, data: { text: line } };
    }
  }
}
