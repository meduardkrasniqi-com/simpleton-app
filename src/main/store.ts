import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { AppState } from "@shared/types";

type Listener = (state: AppState) => void;

const file = () => join(app.getPath("userData"), "state.json");

let state: AppState = { repos: [], workspaces: [] };
const listeners = new Set<Listener>();

export async function load() {
  try {
    const parsed = JSON.parse(await readFile(file(), "utf8")) as Partial<AppState>;
    state = { repos: parsed.repos ?? [], workspaces: parsed.workspaces ?? [] };
  } catch {
    state = { repos: [], workspaces: [] };
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
  await writeFile(`${target}.tmp`, JSON.stringify(snapshot, null, 2));
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
