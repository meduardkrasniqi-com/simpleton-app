import { CircleAlert, CircleCheck, CircleDashed, GitMerge, GitPullRequest, GitPullRequestClosed } from "lucide-react";
import type { ComponentType } from "react";
import type { Agent, FileChange, Status, Workspace } from "@shared/types";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function totals(files: FileChange[]) {
  return files.reduce((t, f) => ({ added: t.added + f.added, removed: t.removed + f.removed }), { added: 0, removed: 0 });
}

export const statuses: Record<Status, { label: string; dot: string }> = {
  setup: { label: "Setting up", dot: "bg-busy animate-pulse" },
  input: { label: "Needs you", dot: "bg-ask" },
  ready: { label: "Ready to ship", dot: "bg-ready" },
  working: { label: "Working", dot: "bg-busy" },
  idle: { label: "Not started", dot: "bg-idle" },
  merged: { label: "Merged", dot: "bg-done" },
};

export const homeGroups: Status[] = ["input", "ready", "working", "setup", "idle"];

export const agents: Record<Agent, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
};

export function humanize(slug: string) {
  const words = slug.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : slug;
}

export const displayName = (w: Workspace) => w.title || humanize(w.branch.split("/").pop() ?? w.branch);

export const subtitle = (w: Workspace) => w.summary || w.task.trim().split("\n")[0];

export function statusIcon(w: Workspace): { icon: ComponentType<{ className?: string; "aria-label"?: string }> | "loader"; className: string; label: string } {
  if (w.status === "setup") return { icon: "loader", className: "text-mute", label: statuses.setup.label };
  if (w.status === "working") return { icon: "loader", className: "text-busy", label: statuses.working.label };
  if (w.status === "input") return { icon: CircleAlert, className: "text-ask", label: statuses.input.label };
  if (w.status === "merged" || w.prState === "merged") return { icon: GitMerge, className: "text-merged", label: "Merged" };
  if (w.prUrl && w.prState === "closed") return { icon: GitPullRequestClosed, className: "text-minus", label: "Pull request closed" };
  if (w.prUrl) return { icon: GitPullRequest, className: "text-ready", label: "Pull request open" };
  if (w.status === "ready") return { icon: CircleCheck, className: "text-ready", label: statuses.ready.label };
  return { icon: CircleDashed, className: "text-mute", label: statuses.idle.label };
}

export function duration(ms: number) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function clock(at: number) {
  const date = new Date(at);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === new Date().toDateString()) return time;
  const day = date.toLocaleDateString(undefined, date.getFullYear() === new Date().getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
  return `${day}, ${time}`;
}
