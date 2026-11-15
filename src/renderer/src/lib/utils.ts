import type { Agent, FileChange, Status } from "@shared/types";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function totals(files: FileChange[]) {
  return files.reduce((t, f) => ({ added: t.added + f.added, removed: t.removed + f.removed }), { added: 0, removed: 0 });
}

export const statuses: Record<Status, { label: string; dot: string }> = {
  input: { label: "Needs you", dot: "bg-ask" },
  ready: { label: "Ready to ship", dot: "bg-ready" },
  working: { label: "Working", dot: "bg-busy" },
  idle: { label: "Not started", dot: "bg-idle" },
  merged: { label: "Merged", dot: "bg-done" },
};

export const homeGroups: Status[] = ["input", "ready", "working", "idle"];

export const agents: Record<Agent, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
};
