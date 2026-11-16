import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { Agent, Command } from "@shared/types";
import { list, record, text } from "./agents/driver";
import { binary, env } from "./env";

const hidden = new Set(["color", "focus", "heapdump", "rename", "exit", "vim", "theme", "terminal-setup", "statusline", "workflow-launch-exec", "extra-usage", "agents"]);
const ttl = 2 * 60 * 1000;
const cache = new Map<string, { at: number; result: Promise<Command[]> }>();

function parse(raw: unknown): Command | null {
  const item = record(raw);
  const name = text(item.name);
  let description = text(item.description).trim();
  if (!name || name.startsWith("_") || hidden.has(name) || /^\(removed\)|^Renamed to/i.test(description)) return null;
  const source = /\((user|project|plugin[^)]*|managed)\)$/.exec(description);
  if (source) description = description.slice(0, source.index).trim();
  const origin = item.builtin === true ? "builtin" : source?.[1].startsWith("plugin") ? "plugin" : source?.[1] === "project" ? "project" : "user";
  return { name, description, hint: text(item.argumentHint).trim(), origin };
}

async function query(cwd: string) {
  const bin = await binary("claude-code");
  if (!bin) return [];
  const child = spawn(bin, ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"], { cwd, env: await env(), stdio: ["pipe", "pipe", "ignore"] });
  return new Promise<Command[]>((resolve) => {
    const finish = (commands: Command[]) => {
      clearTimeout(timer);
      resolve(commands);
      child.stdin.end();
      setTimeout(() => child.kill("SIGTERM"), 500);
    };
    const timer = setTimeout(() => finish([]), 20000);
    child.on("error", () => finish([]));
    child.on("close", () => finish([]));
    child.stdin.on("error", () => undefined);
    createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const event = record(JSON.parse(line));
        const response = record(event.response);
        if (event.type !== "control_response" || response.request_id !== "commands") return;
        finish(list(record(response.response).commands).map(parse).filter((c): c is Command => !!c));
      } catch {
        return;
      }
    });
    child.stdin.write(`${JSON.stringify({ type: "control_request", request_id: "commands", request: { subtype: "initialize" } })}\n`);
  });
}

export function commands(agent: Agent, cwd: string) {
  if (agent !== "claude-code") return Promise.resolve([]);
  const hit = cache.get(cwd);
  if (hit && Date.now() - hit.at < ttl) return hit.result;
  const result = query(cwd).then((found) => {
    if (!found.length) cache.delete(cwd);
    return found;
  });
  cache.set(cwd, { at: Date.now(), result });
  return result;
}
