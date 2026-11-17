import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import type { Activity, Entry, Workspace } from "@shared/types";
import * as store from "./store";

const file = () => join(app.getPath("userData"), "activity.json");

let events: Activity[] = [];
let loaded: Promise<void> | null = null;
let writing: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

export function dayKey(at: number | Date) {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function clip(text: string, max: number) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

async function persist() {
  const target = file();
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(`${target}.tmp`, JSON.stringify(events));
  await rename(`${target}.tmp`, target);
}

function save() {
  writing = writing.catch(() => undefined).then(persist);
  listeners.forEach((listener) => listener());
}

async function backfill() {
  const dir = join(app.getPath("userData"), "transcripts");
  const repos = new Map(store.get().repos.map((r) => [r.id, r.name]));
  for (const w of store.get().workspaces) {
    let entries: Entry[] = [];
    try {
      entries = JSON.parse(await readFile(join(dir, `${w.id}.json`), "utf8")) as Entry[];
    } catch {
      entries = [];
    }
    const reply = entries.findLast((e): e is Extract<Entry, { kind: "assistant" }> => e.kind === "assistant" && !e.parent)?.text;
    const files = new Set(entries.flatMap((e) => (e.kind === "turn" ? e.files.map((f) => f.path) : [])));
    events.push({
      id: randomUUID(),
      at: w.createdAt,
      kind: "task",
      workspaceId: w.id,
      repo: repos.get(w.repoId) ?? "",
      title: w.title || w.branch,
      text: clip(w.task, 600),
      reply: reply ? clip(reply, 600) : undefined,
      files: files.size || undefined,
    });
  }
  events.sort((a, b) => a.at - b.at);
}

export function load() {
  loaded ??= (async () => {
    try {
      events = JSON.parse(await readFile(file(), "utf8")) as Activity[];
    } catch {
      events = [];
      await backfill();
      await persist().catch(() => undefined);
    }
  })();
  return loaded;
}

export function all() {
  return events;
}

export function between(start: number, end: number) {
  return events.filter((e) => e.at >= start && e.at < end);
}

export function days() {
  const counts: Record<string, number> = {};
  const ran = new Set(events.flatMap((e) => (e.kind === "turn" ? [e.workspaceId] : [])));
  for (const e of events) {
    if (e.kind !== "turn" && !(e.kind === "task" && !ran.has(e.workspaceId))) continue;
    const key = dayKey(e.at);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function onChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function record(workspace: Workspace, change: Omit<Activity, "id" | "at" | "workspaceId" | "repo" | "title">) {
  await load();
  const repo = store.get().repos.find((r) => r.id === workspace.repoId)?.name ?? "";
  events.push({ id: randomUUID(), at: Date.now(), workspaceId: workspace.id, repo, title: workspace.title || workspace.branch, ...change });
  save();
}
