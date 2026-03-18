import { BaseAdapter } from "./base.js";
import type { AgentAdapterConfig, AgentEvent, AgentBackend } from "../../types/index.js";

export class GeminiAdapter extends BaseAdapter {
  backend: AgentBackend = "gemini";

  buildCommand(config: AgentAdapterConfig): { cmd: string[]; env?: Record<string, string> } {
    const cmd = [
      "gemini",
      "-p", config.args[0] || config.command,
    ];

    return { cmd };
  }

  parseEvent(line: string, agentId: string): AgentEvent | null {
    const now = Date.now();
    try {
      const raw = JSON.parse(line);
      switch (raw.type) {
        case "system":
          return { type: "start", timestamp: now, agentId, data: raw };
        case "text":
          return { type: "delta", timestamp: now, agentId, data: { text: raw.text, ...raw } };
        case "tool_call":
          return { type: "tool_call", timestamp: now, agentId, data: raw };
        case "tool_result":
          return { type: "tool_result", timestamp: now, agentId, data: raw };
        case "done":
          return { type: "done", timestamp: now, agentId, data: raw };
        default:
          return { type: "unknown", timestamp: now, agentId, data: raw };
      }
    } catch {
      return { type: "delta", timestamp: now, agentId, data: { text: line } };
    }
  }
}
