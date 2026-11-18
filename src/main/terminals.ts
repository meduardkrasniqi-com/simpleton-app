import * as pty from "node-pty";
import type { TermData, TermKind, TermSnapshot } from "@shared/types";
import { shellEnv } from "./env";
import * as store from "./store";

type Term = { proc: pty.IPty | null; buffer: string; end: number; cols: number; rows: number };

const limit = 512 * 1024;
const terms = new Map<string, Term>();
const dataListeners = new Set<(event: TermData) => void>();
const exitListeners = new Set<(workspaceId: string, kind: TermKind, code: number) => void>();

const key = (workspaceId: string, kind: TermKind) => `${workspaceId}:${kind}`;

export const shell = () => process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");

export function onData(listener: (event: TermData) => void) {
  dataListeners.add(listener);
  return () => dataListeners.delete(listener);
}

export function onExit(listener: (workspaceId: string, kind: TermKind, code: number) => void) {
  exitListeners.add(listener);
  return () => exitListeners.delete(listener);
}

function term(workspaceId: string, kind: TermKind) {
  const k = key(workspaceId, kind);
  let t = terms.get(k);
  if (!t) {
    t = { proc: null, buffer: "", end: 0, cols: 100, rows: 24 };
    terms.set(k, t);
  }
  return t;
}

function emit(workspaceId: string, kind: TermKind, data: string) {
  const t = term(workspaceId, kind);
  t.buffer = (t.buffer + data).slice(-limit);
  t.end += data.length;
  dataListeners.forEach((listener) => listener({ workspaceId, kind, data, end: t.end }));
}

export async function spawn(workspaceId: string, kind: TermKind, args: string[], extraEnv: Record<string, string> = {}) {
  const workspace = store.get().workspaces.find((w) => w.id === workspaceId);
  if (!workspace) throw new Error("Unknown workspace");
  const t = term(workspaceId, kind);
  t.proc?.kill();
  const env = { ...(await shellEnv()), TERM: "xterm-256color", COLORTERM: "truecolor", ...extraEnv } as Record<string, string>;
  const proc = pty.spawn(shell(), args, { name: "xterm-256color", cols: t.cols, rows: t.rows, cwd: workspace.path, env });
  t.proc = proc;
  proc.onData((data) => emit(workspaceId, kind, data));
  proc.onExit(({ exitCode }) => {
    if (t.proc !== proc) return;
    t.proc = null;
    exitListeners.forEach((listener) => listener(workspaceId, kind, exitCode));
  });
  return proc;
}

export async function open(workspaceId: string, kind: TermKind, cols: number, rows: number): Promise<TermSnapshot> {
  const t = term(workspaceId, kind);
  t.cols = cols;
  t.rows = rows;
  if (kind === "shell" && !t.proc) {
    if (t.buffer) emit(workspaceId, kind, "\r\n");
    await spawn(workspaceId, kind, ["-l"]);
  } else {
    t.proc?.resize(cols, rows);
  }
  return { buffer: t.buffer, end: t.end };
}

export function write(workspaceId: string, kind: TermKind, data: string) {
  terms.get(key(workspaceId, kind))?.proc?.write(data);
}

export function resize(workspaceId: string, kind: TermKind, cols: number, rows: number) {
  const t = terms.get(key(workspaceId, kind));
  if (!t || cols < 2 || rows < 2) return;
  t.cols = cols;
  t.rows = rows;
  t.proc?.resize(cols, rows);
}

export function print(workspaceId: string, kind: TermKind, text: string) {
  emit(workspaceId, kind, text.replace(/\r?\n/g, "\r\n"));
}

export function clear(workspaceId: string, kind: TermKind) {
  term(workspaceId, kind).buffer = "";
  emit(workspaceId, kind, "\x1bc");
}

export function kill(workspaceId: string, kind: TermKind) {
  const t = terms.get(key(workspaceId, kind));
  const proc = t?.proc;
  if (!t || !proc) return;
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    proc.kill();
  }
}

export function forget(workspaceId: string) {
  for (const kind of ["shell", "setup", "app"] as const) {
    kill(workspaceId, kind);
    terms.delete(key(workspaceId, kind));
  }
}

export function shutdown() {
  for (const t of terms.values()) {
    if (!t.proc) continue;
    try {
      process.kill(-t.proc.pid, "SIGTERM");
    } catch {
      t.proc.kill();
    }
  }
}
