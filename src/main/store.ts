import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { AppState, Share } from "@shared/types";

type Listener = (state: AppState) => void;

const file = () => join(app.getPath("userData"), "state.json");

const empty = (): AppState => ({ repos: [], workspaces: [], previews: {}, shares: {}, theme: "system", agent: "claude-code", defaults: { "claude-code": {}, codex: {} } });

let state: AppState = empty();
const listeners = new Set<Listener>();

export async function load() {
  try {
    const parsed = JSON.parse(await readFile(file(), "utf8")) as Partial<AppState>;
    const shares: Record<string, Share> = {};
    for (const [id, share] of Object.entries(parsed.shares ?? {})) shares[id] = { name: share.name, url: share.url, status: "connecting" };
    const base = empty();
    state = { ...base, repos: parsed.repos ?? [], workspaces: parsed.workspaces ?? [], shares, theme: parsed.theme ?? base.theme, agent: parsed.agent ?? base.agent, defaults: { ...base.defaults, ...parsed.defaults } };
  } catch {
    state = empty();
  }
  return state;
}

export function get() {
  return state;
}

let writing: Promise<void> = Promise.resolve();

async function persist(snapshot: AppState) {
  const target = file();
  await mkdir(dirname(target), { recursive: true });
  const { previews: _, ...saved } = snapshot;
  await writeFile(`${target}.tmp`, JSON.stringify(saved, null, 2));
  await rename(`${target}.tmp`, target);
}

export async function update(change: (current: AppState) => AppState) {
  state = change(state);
  const snapshot = state;
  listeners.forEach((listener) => listener(snapshot));
  writing = writing.catch(() => undefined).then(() => persist(snapshot));
  await writing;
  return snapshot;
}

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
