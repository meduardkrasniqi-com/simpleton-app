import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { app } from "electron";
import type { PrState, Workspace } from "@shared/types";
import { shellEnv, which } from "./env";
import * as store from "./store";

const exec = promisify(execFile);

const pullUrl = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g;

const states: Record<string, PrState> = { OPEN: "open", MERGED: "merged", CLOSED: "closed" };

const syncing = new Map<string, Promise<void>>();
let timer: NodeJS.Timeout | null = null;
let lastFocus = 0;

export function findUrl(text: string) {
  return text.match(pullUrl)?.pop();
}

async function patch(id: string, change: Partial<Workspace>) {
  await store.update((s) => ({ ...s, workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, ...change } : w)) }));
}

async function lookup(workspace: Workspace) {
  const gh = await which("gh");
  if (!gh) return undefined;
  try {
    const { stdout } = await exec(gh, ["pr", "view", workspace.branch, "--json", "url,state"], { cwd: workspace.path, env: await shellEnv(), timeout: 20000 });
    const result = JSON.parse(stdout) as { url?: string; state?: string };
    return result.url ? { url: result.url, state: states[result.state ?? ""] ?? "open" } : null;
  } catch {
    return null;
  }
}

async function run(id: string, hint?: string) {
  const workspace = store.get().workspaces.find((w) => w.id === id);
  if (!workspace) return;
  const found = await lookup(workspace);
  const url = found?.url ?? workspace.prUrl ?? hint;
  const prState = found?.state ?? workspace.prState ?? (url ? "open" : undefined);
  const current = store.get().workspaces.find((w) => w.id === id);
  if (!current) return;
  const change: Partial<Workspace> = {};
  if (url && url !== current.prUrl) change.prUrl = url;
  if (prState && prState !== current.prState) change.prState = prState;
  const settled = current.status === "ready" || current.status === "idle" || current.status === "merged";
  if (prState === "merged" && settled && current.status !== "merged") change.status = "merged";
  if (prState && prState !== "merged" && current.status === "merged") change.status = "ready";
  if (Object.keys(change).length) await patch(id, change);
}

export function sync(id: string, hint?: string) {
  const pending = syncing.get(id);
  if (pending) return pending;
  const next = run(id, hint).finally(() => syncing.delete(id));
  syncing.set(id, next);
  return next;
}

async function syncAll() {
  const active = store.get().workspaces.filter((w) => w.prState !== "merged" && w.prState !== "closed");
  for (const w of active) await sync(w.id);
}

export function watch() {
  syncAll().catch(() => undefined);
  timer ??= setInterval(() => syncAll().catch(() => undefined), 60_000);
  app.on("browser-window-focus", () => {
    if (Date.now() - lastFocus < 10_000) return;
    lastFocus = Date.now();
    syncAll().catch(() => undefined);
  });
}
