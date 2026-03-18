import { BaseAdapter } from "./base.js";
import { ClaudeAdapter } from "./claude.js";
import { CodexAdapter } from "./codex.js";
import { GeminiAdapter } from "./gemini.js";
import type { AgentBackend } from "../../types/index.js";

const adapters: Record<string, BaseAdapter> = {
  claude: new ClaudeAdapter(),
  codex: new CodexAdapter(),
  gemini: new GeminiAdapter(),
};

export function getAdapter(backend: AgentBackend): BaseAdapter {
  const adapter = adapters[backend];
  if (!adapter) throw new Error(`Unknown agent backend: ${backend}. Available: ${Object.keys(adapters).join(", ")}`);
  return adapter;
}

export function listAdapters(): string[] {
  return Object.keys(adapters);
}

export { BaseAdapter, ClaudeAdapter, CodexAdapter, GeminiAdapter };
