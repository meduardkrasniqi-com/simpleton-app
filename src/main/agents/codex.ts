import { isAbsolute, relative } from "node:path";
import type { Entry, ToolState } from "@shared/types";
import { command, instructions, list, output, record, shorten, text, type Driver, type Json, type Update } from "./driver";

const sandboxes = new Set(["read-only", "workspace-write", "danger-full-access"]);

function unwrap(raw: string) {
  const match = /^\S*(?:sh|zsh|bash)\s+-l?c\s+(["'])([\s\S]*)\1$/.exec(raw.trim());
  if (!match) return raw;
  return match[1] === '"' ? match[2].replace(/\\(["\\$`])/g, "$1") : match[2];
}

function state(item: Json): ToolState {
  if (item.status === "failed" || item.status === "declined") return "failed";
  if (typeof item.exit_code === "number" && item.exit_code !== 0) return "failed";
  if (item.status === "in_progress") return "running";
  return "done";
}

function entry(item: Json, id: string, cwd: string): Entry | null {
  const tool = (verb: string, target: string): Entry => ({ id, kind: "tool", verb, target, state: state(item) });
  switch (item.type) {
    case "agent_message":
      return text(item.text).trim() ? { id, kind: "assistant", text: text(item.text).trim() } : null;
    case "reasoning":
      return text(item.text).trim() ? { id, kind: "thinking", text: text(item.text).trim() } : null;
    case "command_execution": {
      const full = unwrap(text(item.command)).trim();
      return { ...tool("Run", command(full, cwd)), command: full, output: output(item.aggregated_output) } as Entry;
    }
    case "file_change": {
      const paths = list(item.changes).map((change) => {
        const path = text(record(change).path);
        return isAbsolute(path) ? relative(cwd, path) : path;
      });
      return tool("Edit", shorten(paths.join(", ")));
    }
    case "mcp_tool_call":
      return tool([text(item.server), text(item.tool)].filter(Boolean).join(" "), shorten(JSON.stringify(item.arguments ?? {})));
    case "web_search":
      return tool("Search web", shorten(text(item.query)));
    case "todo_list":
      return tool("Plan", `${list(item.items).length} steps`);
    case "error":
      return { id, kind: "notice", text: text(item.message) || "Codex reported a warning" };
    default:
      return null;
  }
}

export const codex: Driver = {
  args: (cwd, sessionId, { model, effort, mode }) => [
    "exec",
    "--json",
    "--sandbox",
    sandboxes.has(mode ?? "") ? mode! : "workspace-write",
    ...(mode === "read-only" || mode === "danger-full-access" ? [] : ["-c", "sandbox_workspace_write.network_access=true"]),
    ...(model ? ["--model", model] : []),
    ...(effort ? ["-c", `model_reasoning_effort="${effort}"`] : []),
    "-c",
    `developer_instructions=${JSON.stringify(instructions)}`,
    "--cd",
    cwd,
    ...(sessionId ? ["resume", sessionId] : []),
    "-",
  ],

  parser: (cwd, runId) => (event) => {
    const updates: Update[] = [];
    switch (event.type) {
      case "thread.started":
        if (text(event.thread_id)) updates.push({ session: text(event.thread_id) });
        break;
      case "item.started":
      case "item.updated":
      case "item.completed": {
        const item = record(event.item);
        const result = entry(item, `${runId}:${text(item.id)}`, cwd);
        if (result) updates.push({ entry: result });
        break;
      }
      case "turn.completed":
        updates.push({ done: true });
        break;
      case "turn.failed":
        updates.push({ error: text(record(event.error).message) || "Codex stopped with an error" });
        break;
      case "error":
        updates.push({ error: text(event.message) || "Codex reported an error" });
        break;
    }
    return updates;
  },
};
