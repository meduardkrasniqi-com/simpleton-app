import type { AgentSettings, Entry, Reply } from "@shared/types";

export type Json = Record<string, unknown>;

export type Pending = { requestId: string; tool: string; input: Json; suggestions: Json[]; entry: Entry };

export type Answer = { response: Json; entry: Entry; mode?: string; rules?: string[] };

export type Update = { session: string } | { model: string } | { mode: string } | { entry: Entry } | { request: Pending } | { cancel: string } | { send: Json } | { error: string } | { done: true };

export type Launch = AgentSettings & { allow?: string[] };

export type Driver = {
  args: (cwd: string, sessionId: string | undefined, settings: Launch) => string[];
  parser: (cwd: string, runId: string) => (event: Json) => Update[];
  streaming?: {
    open: (text: string) => Json[];
    answer: (pending: Pending, reply: Reply) => Answer;
    setMode: (mode: string) => Json;
  };
};

export const text = (value: unknown) => (typeof value === "string" ? value : "");

export const record = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});

export const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export function command(value: string, cwd: string) {
  const lines = value
    .trim()
    .replace(/^cd\s+("[^"]*"|'[^']*'|\S+)\s*&&\s*/, (match, target: string) => {
      const dir = target.replace(/^["']|["']$/g, "").replace(/\/+$/, "");
      if (dir === cwd) return "";
      if (dir.startsWith(`${cwd}/`)) return `cd ${dir.slice(cwd.length + 1)} && `;
      return match;
    })
    .split("\n");
  return shorten(lines.length > 1 ? `${lines[0]} …` : lines[0]);
}

export function shorten(value: string, max = 160) {
  const line = value.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
