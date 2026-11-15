import { isAbsolute, relative } from "node:path";
import type { Entry } from "@shared/types";
import { command, list, record, shorten, text, type Driver, type Json, type Update } from "./driver";

type Tool = Extract<Entry, { kind: "tool" }>;

function describe(name: string, input: Json, cwd: string): { verb: string; target: string } {
  const file = (key = "file_path") => {
    const path = text(input[key]);
    if (!path) return "";
    const rel = isAbsolute(path) ? relative(cwd, path) : path;
    return rel.startsWith("..") ? path : rel;
  };
  switch (name) {
    case "Bash":
      return { verb: "Run", target: command(text(input.command), cwd) };
    case "Read":
      return { verb: "Read", target: file() };
    case "Edit":
    case "MultiEdit":
      return { verb: "Edit", target: file() };
    case "Write":
      return { verb: "Write", target: file() };
    case "NotebookEdit":
      return { verb: "Edit", target: file("notebook_path") };
    case "Grep":
      return { verb: "Search", target: shorten(text(input.pattern)) };
    case "Glob":
      return { verb: "Find", target: shorten(text(input.pattern)) };
    case "WebFetch":
      return { verb: "Fetch", target: shorten(text(input.url)) };
    case "WebSearch":
      return { verb: "Search web", target: shorten(text(input.query)) };
    case "TodoWrite":
      return { verb: "Plan", target: `${list(input.todos).length} steps` };
    case "Task":
    case "Agent":
      return { verb: "Delegate", target: shorten(text(input.description) || text(input.prompt)) };
    default:
      return { verb: name.replace(/^mcp__/, "").replace(/__/g, " "), target: shorten(JSON.stringify(input)) };
  }
}

export const claude: Driver = {
  args: (_cwd, sessionId, { model, effort }) => [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "auto",
    ...(model ? ["--model", model] : []),
    ...(effort ? ["--effort", effort] : []),
    ...(sessionId ? ["--resume", sessionId] : []),
  ],

  parser: (cwd, runId) => {
    const tools = new Map<string, Tool>();
    let seq = 0;

    return (event) => {
      const updates: Update[] = [];
      if (event.parent_tool_use_id) return updates;

      if (event.type === "system" && event.subtype === "init" && text(event.session_id)) {
        updates.push({ session: text(event.session_id) });
        if (text(event.model)) updates.push({ model: text(event.model) });
      }

      if (event.type === "assistant") {
        for (const block of list(record(event.message).content).map(record)) {
          if (block.type === "text" && text(block.text).trim()) {
            updates.push({ entry: { id: `${runId}:${seq++}`, kind: "assistant", text: text(block.text).trim() } });
          }
          if (block.type === "tool_use") {
            const tool: Tool = { id: text(block.id) || `${runId}:${seq++}`, kind: "tool", ...describe(text(block.name), record(block.input), cwd), state: "running" };
            tools.set(tool.id, tool);
            updates.push({ entry: tool });
          }
        }
      }

      if (event.type === "user") {
        for (const block of list(record(event.message).content).map(record)) {
          const tool = block.type === "tool_result" ? tools.get(text(block.tool_use_id)) : undefined;
          if (!tool) continue;
          const done: Tool = { ...tool, state: block.is_error ? "failed" : "done" };
          tools.set(done.id, done);
          updates.push({ entry: done });
        }
      }

      if (event.type === "result") {
        if (event.subtype === "success" && !event.is_error) {
          updates.push({ done: true });
        } else {
          const reason = text(event.result) || list(event.errors).map(text).filter(Boolean).join("\n") || "Claude Code stopped with an error";
          updates.push({ error: reason });
        }
      }

      return updates;
    };
  },
};
