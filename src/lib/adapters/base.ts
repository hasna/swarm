import type { AgentAdapterConfig, AgentEvent, AgentProcess, AgentBackend } from "../../types/index.js";
import type { Subprocess } from "bun";

export abstract class BaseAdapter {
  abstract backend: AgentBackend;

  abstract buildCommand(config: AgentAdapterConfig): { cmd: string[]; env?: Record<string, string> };

  abstract parseEvent(line: string, agentId: string): AgentEvent | null;

  spawn(config: AgentAdapterConfig, agentId: string, agentName: string): { proc: Subprocess; process: AgentProcess } {
    const { cmd, env } = this.buildCommand(config);
    const proc = Bun.spawn(cmd, {
      cwd: config.workdir || process.cwd(),
      env: { ...process.env, ...config.env, ...env },
      stdout: "pipe",
      stderr: "pipe",
    });

    const agentProcess: AgentProcess = {
      id: agentId,
      name: agentName,
      backend: this.backend,
      pid: proc.pid,
      status: "running",
      startedAt: Date.now(),
      lastHeartbeat: Date.now(),
      tokensUsed: 0,
      costUsd: 0,
      workdir: config.workdir || process.cwd(),
    };

    return { proc, process: agentProcess };
  }

  async *streamEvents(proc: Subprocess, agentId: string): AsyncGenerator<AgentEvent> {
    const stdout = proc.stdout;
    if (!stdout || typeof stdout === "number") return;
    const reader = (stdout as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const event = this.parseEvent(trimmed, agentId);
          if (event) yield event;
        }
      }

      // Remaining buffer
      if (buffer.trim()) {
        const event = this.parseEvent(buffer.trim(), agentId);
        if (event) yield event;
      }
    } finally {
      reader.releaseLock();
    }
  }

  kill(proc: Subprocess): void {
    try { proc.kill(); } catch {}
  }
}
