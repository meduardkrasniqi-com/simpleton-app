import { isAbsolute, relative } from "node:path";
import type { DiffLine, Detail, Entry, Question, Reply } from "@shared/types";
import { command, instructions, list, record, shorten, text, type Answer, type Driver, type Json, type Pending, type Update } from "./driver";

type Tool = Extract<Entry, { kind: "tool" }>;

const hidden = new Set(["AskUserQuestion", "ExitPlanMode", "ToolSearch"]);

const maxLines = 40;

function lines(value: string, kind: DiffLine["kind"]): DiffLine[] {
  const rows = value.replace(/\n$/, "").split("\n");
  return rows.map((row) => ({ kind, text: row }));
}

function cap(rows: DiffLine[]): DiffLine[] {
  if (rows.length <= maxLines) return rows;
  return [...rows.slice(0, maxLines), { kind: "gap", text: `${rows.length - maxLines} more lines` }];
}

function detail(name: string, input: Json): Detail | undefined {
  switch (name) {
    case "Bash":
      return text(input.command) ? { kind: "command", text: text(input.command).trim() } : undefined;
    case "Edit":
      return { kind: "diff", lines: cap([...lines(text(input.old_string), "del"), ...lines(text(input.new_string), "add")]) };
    case "MultiEdit":
      return { kind: "diff", lines: cap(list(input.edits).map(record).flatMap((edit, i) => [...(i ? [{ kind: "gap" as const, text: "" }] : []), ...lines(text(edit.old_string), "del"), ...lines(text(edit.new_string), "add")])) };
    case "Write":
      return { kind: "diff", lines: cap(lines(text(input.content), "add")) };
    case "NotebookEdit":
      return { kind: "diff", lines: cap(lines(text(input.new_source), "add")) };
    case "WebFetch":
      return text(input.prompt) ? { kind: "text", text: text(input.prompt) } : undefined;
    default: {
      const json = JSON.stringify(input, null, 2);
      if (!json || json === "{}") return undefined;
      return { kind: "text", text: json.length > 1200 ? `${json.slice(0, 1199)}…` : json };
    }
  }
}

function always(suggestions: Json[]) {
  for (const suggestion of suggestions) {
    if (suggestion.type === "setMode" && suggestion.mode === "acceptEdits") return "Allow all edits";
    if (suggestion.type === "addRules" && suggestion.behavior === "allow") {
      const rule = record(list(suggestion.rules)[0]);
      const content = text(rule.ruleContent);
      if (content) return `Always allow ${shorten(content, 40)}`;
      if (text(rule.toolName)) return `Always allow ${text(rule.toolName)}`;
    }
  }
  return undefined;
}

function questions(input: Json): Question[] {
  return list(input.questions)
    .map(record)
    .map((q) => ({
      question: text(q.question),
      header: text(q.header) || undefined,
      multiSelect: q.multiSelect === true,
      options: list(q.options)
        .map(record)
        .map((o) => ({ label: text(o.label), description: text(o.description) || undefined }))
        .filter((o) => o.label),
    }))
    .filter((q) => q.question);
}

const free = new Set(["auto", "bypassPermissions"]);

function prepare(pending: Pending, mode: string): Pending {
  const entry = pending.entry;
  if (!free.has(mode) || entry.kind !== "tool" || !entry.approval) return pending;
  const suggestions = pending.suggestions.filter((s) => s.type !== "setMode");
  return { ...pending, suggestions, entry: { ...entry, approval: { ...entry.approval, always: always(suggestions) } } };
}

function rules(suggestions: Json[]) {
  return suggestions
    .filter((s) => s.type === "addRules" && s.behavior === "allow")
    .flatMap((s) => list(s.rules).map(record))
    .map((rule) => (text(rule.ruleContent) ? `${text(rule.toolName)}(${text(rule.ruleContent)})` : text(rule.toolName)))
    .filter(Boolean);
}

function answer(pending: Pending, reply: Reply): Answer {
  const entry = pending.entry;
  const allow = (extra: Json = {}) => ({ behavior: "allow", updatedInput: pending.input, ...extra });
  const deny = (message: string) => ({ behavior: "deny", message });

  if (reply.kind === "deny") {
    const said = reply.message?.trim();
    if (entry.kind === "question") return { response: deny(said ? `The user answered in their own words: ${said}` : "The user declined to answer."), entry: { ...entry, state: "declined" } };
    if (entry.kind === "plan") return { response: deny(said ? `The user wants changes to the plan: ${said}` : "The user wants to keep planning. Ask what they would like to change."), entry: { ...entry, state: "rejected" } };
    const approval = entry.kind === "tool" && entry.approval ? { ...entry.approval, state: "denied" as const } : undefined;
    return { response: deny(said ? `The user denied this action and said: ${said}` : "The user denied this action."), entry: entry.kind === "tool" ? { ...entry, approval } : entry };
  }

  if (reply.kind === "answer" && entry.kind === "question") {
    return { response: allow({ updatedInput: { ...pending.input, answers: reply.answers } }), entry: { ...entry, answers: reply.answers, state: "answered" } };
  }

  if (reply.kind === "plan" && entry.kind === "plan") {
    return { response: allow({ updatedPermissions: [{ type: "setMode", mode: reply.mode, destination: "session" }] }), entry: { ...entry, mode: reply.mode, state: "approved" }, mode: reply.mode };
  }

  if (entry.kind !== "tool" || !entry.approval) return { response: deny("This request could not be answered."), entry };

  if (reply.kind === "allow" && reply.always) {
    const updates = pending.suggestions.filter((s) => s.type === "setMode" || s.type === "addDirectories" || (s.type === "addRules" && s.behavior === "allow")).map((s) => ({ ...s, destination: "session" }));
    const mode = pending.suggestions.find((s) => s.type === "setMode");
    return { response: allow({ updatedPermissions: updates }), entry: { ...entry, approval: { ...entry.approval, state: "always" } }, mode: mode ? text(mode.mode) : undefined, rules: rules(pending.suggestions) };
  }

  return { response: allow(), entry: { ...entry, approval: { ...entry.approval, state: "allowed" } } };
}

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
  args: (_cwd, sessionId, { model, effort, mode, allow }) => [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-prompt-tool",
    "stdio",
    "--permission-mode",
    mode || "auto",
    "--append-system-prompt",
    instructions,
    ...(allow?.length ? ["--settings", JSON.stringify({ permissions: { allow } })] : []),
    ...(model ? ["--model", model] : []),
    ...(effort ? ["--effort", effort] : []),
    ...(sessionId ? ["--resume", sessionId] : []),
  ],

  streaming: {
    open: (message) => [
      { type: "control_request", request_id: "init", request: { subtype: "initialize" } },
      { type: "user", message: { role: "user", content: message }, parent_tool_use_id: null, session_id: "" },
    ],
    answer,
    prepare,
    setMode: (mode) => ({ type: "control_request", request_id: `mode-${Date.now()}`, request: { subtype: "set_permission_mode", mode } }),
  },

  parser: (cwd, runId) => {
    const tools = new Map<string, Tool>();
    let seq = 0;

    const request = (event: Json): Update[] => {
      const requestId = text(event.request_id);
      const body = record(event.request);
      if (body.subtype !== "can_use_tool") {
        return [{ send: { type: "control_response", response: { subtype: "error", request_id: requestId, error: `Unsupported request ${text(body.subtype)}` } } }];
      }
      const name = text(body.tool_name);
      const input = record(body.input);
      const suggestions = body.suppress_always_allow_rule === true ? [] : list(body.permission_suggestions).map(record);
      const reason = text(body.decision_reason).trim() || undefined;
      const id = text(body.tool_use_id) || `${runId}:${seq++}`;
      let entry: Entry;
      if (name === "AskUserQuestion") entry = { id: `${id}:ask`, kind: "question", questions: questions(input), state: "pending" };
      else if (name === "ExitPlanMode") entry = { id: `${id}:plan`, kind: "plan", plan: text(input.plan).trim(), state: "pending" };
      else {
        const tool: Tool = tools.get(id) ?? { id, kind: "tool", ...describe(name, input, cwd), state: "running" };
        entry = { ...tool, approval: { detail: detail(name, input), reason, always: always(suggestions), state: "pending" } };
      }
      return [{ request: { requestId, tool: name, input, suggestions, entry } }];
    };

    return (event) => {
      const updates: Update[] = [];

      if (event.type === "control_request") return request(event);
      if (event.type === "control_cancel_request") return [{ cancel: text(event.request_id) || text(record(event.request).request_id) }];

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
          if (block.type === "tool_use" && !hidden.has(text(block.name))) {
            const tool: Tool = { id: text(block.id) || `${runId}:${seq++}`, kind: "tool", ...describe(text(block.name), record(block.input), cwd), state: "running" };
            tools.set(tool.id, tool);
            updates.push({ entry: tool });
          }
        }
      }

      if (event.type === "user") {
        for (const block of list(record(event.message).content).map(record)) {
          if (block.type === "tool_result" && text(block.tool_use_id)) updates.push({ settled: text(block.tool_use_id) });
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
