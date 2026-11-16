import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { app } from "electron";
import { defaultModes, type Agent, type AgentSettings, type Entry, type EntryEvent, type Reply, type Workspace } from "@shared/types";
import * as models from "../models";
import * as pr from "../pr";
import * as store from "../store";
import { claude } from "./claude";
import { codex } from "./codex";
import type { Driver, Json, Pending, Update } from "./driver";
import { binary, env } from "../env";

const drivers: Record<Agent, Driver> = { "claude-code": claude, codex };

const missing: Record<Agent, string> = {
  "claude-code": "Claude Code isn't installed. Install it with `npm install -g @anthropic-ai/claude-code`, run `claude` once to sign in, then try again.",
  codex: "Codex isn't installed. Install it with `npm install -g @openai/codex`, run `codex` once to sign in, then try again.",
};

type Run = { child: ChildProcess; stopped: boolean; driver: Driver; pending: Map<string, Pending>; write: (message: Json) => void };

const runs = new Map<string, Run>();
const transcripts = new Map<string, Entry[]>();
const saves = new Map<string, NodeJS.Timeout>();
const listeners = new Set<(event: EntryEvent) => void>();
const closed = (entry: Entry): Entry | null => {
  if (entry.kind === "tool" && entry.approval?.state === "pending") return { ...entry, approval: { ...entry.approval, state: "cancelled" } };
  if ((entry.kind === "question" || entry.kind === "plan") && entry.state === "pending") return { ...entry, state: "cancelled" };
  return null;
};

const dir = () => join(app.getPath("userData"), "transcripts");
const file = (id: string) => join(dir(), `${id}.json`);

export function onEntry(listener: (event: EntryEvent) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function transcript(id: string) {
  const cached = transcripts.get(id);
  if (cached) return cached;
  let entries: Entry[] = [];
  try {
    entries = JSON.parse(await readFile(file(id), "utf8")) as Entry[];
  } catch {
    entries = [];
  }
  if (!runs.has(id)) entries = entries.map((entry) => closed(entry) ?? entry);
  transcripts.set(id, transcripts.get(id) ?? entries);
  return transcripts.get(id)!;
}

function save(id: string) {
  clearTimeout(saves.get(id));
  saves.set(
    id,
    setTimeout(async () => {
      saves.delete(id);
      const entries = transcripts.get(id);
      if (!entries) return;
      await mkdir(dir(), { recursive: true });
      await writeFile(file(id), JSON.stringify(entries));
    }, 400),
  );
}

function upsert(id: string, entry: Entry) {
  const entries = transcripts.get(id) ?? [];
  const index = entries.findIndex((e) => e.id === entry.id);
  const next = index === -1 ? entry : ({ ...entries[index], ...entry } as Entry);
  if (index === -1) entries.push(next);
  else entries[index] = next;
  transcripts.set(id, entries);
  listeners.forEach((listener) => listener({ workspaceId: id, entry: next }));
  save(id);
}

function patch(id: string, change: Partial<Workspace>) {
  return store.update((s) => ({ ...s, workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, ...change } : w)) }));
}

function settleTools(id: string) {
  for (const entry of transcripts.get(id) ?? []) {
    const ended = closed(entry);
    if (ended) upsert(id, ended);
    if (entry.kind === "tool" && entry.state === "running") upsert(id, { ...(ended ?? entry), state: "failed" } as Entry);
  }
}

export async function send(id: string, message: string) {
  const workspace = store.get().workspaces.find((w) => w.id === id);
  const text = message.trim();
  if (!workspace) throw new Error("Unknown workspace");
  if (!text) return;
  if (runs.has(id)) throw new Error("The agent is still working");

  await transcript(id);
  upsert(id, { id: randomUUID(), kind: "user", text });
  await patch(id, { status: "working", setup: undefined });

  const fail = async (reason: string) => {
    upsert(id, { id: randomUUID(), kind: "error", text: reason });
    await patch(id, { status: "input" });
  };

  const bin = await binary(workspace.agent);
  if (!bin) return fail(missing[workspace.agent]);

  const driver = drivers[workspace.agent];
  const runId = randomUUID().slice(0, 8);
  const parse = driver.parser(workspace.path, runId);

  const requested = workspace.mode || defaultModes[workspace.agent];

  let child: ChildProcess;
  try {
    child = spawn(bin, driver.args(workspace.path, workspace.sessionId, { model: workspace.model, effort: workspace.effort, mode: requested, allow: workspace.allow }), { cwd: workspace.path, env: await env(), stdio: ["pipe", "pipe", "pipe"], detached: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  const write = (message: Json) => {
    if (child.stdin?.writable) child.stdin.write(`${JSON.stringify(message)}\n`);
  };
  const run: Run = { child, stopped: false, driver, pending: new Map(), write };
  runs.set(id, run);

  const drop = (key: string) => {
    const pending = run.pending.get(key);
    if (!pending) return;
    run.pending.delete(key);
    const ended = closed(transcripts.get(id)?.find((e) => e.id === key) ?? pending.entry);
    if (ended) upsert(id, ended);
    if (!run.pending.size) patch(id, { status: "working" });
  };

  let finished = false;
  let failed = false;
  let stderr = "";

  const apply = (update: Update) => {
    if ("model" in update) {
      if (!workspace.model) models.learn(workspace.agent, update.model);
    } else if ("settled" in update) {
      [update.settled, `${update.settled}:ask`, `${update.settled}:plan`].forEach(drop);
    } else if ("request" in update) {
      const mode = store.get().workspaces.find((w) => w.id === id)?.mode || requested;
      const request = driver.streaming ? driver.streaming.prepare(update.request, mode) : update.request;
      run.pending.set(request.entry.id, request);
      upsert(id, request.entry);
      patch(id, { status: "input" });
    } else if ("cancel" in update) {
      [...run.pending].filter(([, pending]) => pending.requestId === update.cancel).forEach(([key]) => drop(key));
    } else if ("send" in update) {
      write(update.send);
    } else if ("session" in update) {
      if (update.session !== store.get().workspaces.find((w) => w.id === id)?.sessionId) patch(id, { sessionId: update.session });
    } else if ("entry" in update) {
      upsert(id, update.entry);
    } else if ("error" in update) {
      failed = true;
      upsert(id, { id: randomUUID(), kind: "error", text: update.error });
    } else {
      finished = true;
      if (driver.streaming) child.stdin?.end();
    }
  };

  createInterface({ input: child.stdout! }).on("line", (line) => {
    if (!line.trim().startsWith("{")) return;
    try {
      parse(JSON.parse(line) as Json).forEach(apply);
    } catch {
      return;
    }
  });

  child.stderr!.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-4000);
  });

  child.stdin!.on("error", () => undefined);
  if (driver.streaming) driver.streaming.open(text).forEach(write);
  else child.stdin!.end(text);

  await new Promise<void>((resolve) => {
    let settled = false;
    const done = async (code: number | null, error?: Error) => {
      if (settled) return;
      settled = true;
      runs.delete(id);
      run.pending.clear();
      settleTools(id);
      if (!run.stopped && !finished && !failed) {
        const detail = error?.message || stderr.trim().split("\n").slice(-6).join("\n") || `Exited with code ${code}`;
        failed = true;
        upsert(id, { id: randomUUID(), kind: "error", text: detail });
      }
      if (store.get().workspaces.some((w) => w.id === id)) {
        await patch(id, { status: failed ? "input" : "ready" });
        const said = (transcripts.get(id) ?? []).flatMap((entry) => (entry.kind === "assistant" ? [entry.text] : [])).join("\n");
        pr.sync(id, pr.findUrl(said)).catch(() => undefined);
      }
      resolve();
    };
    child.on("error", (error) => done(null, error));
    child.on("close", (code) => done(code));
  });
}

function kill(run: Run) {
  run.stopped = true;
  const pid = run.child.pid;
  try {
    if (pid) process.kill(-pid, "SIGTERM");
    else run.child.kill("SIGTERM");
  } catch {
    run.child.kill("SIGTERM");
  }
}

export function stop(id: string) {
  const run = runs.get(id);
  if (run) kill(run);
}

export async function forget(id: string) {
  stop(id);
  clearTimeout(saves.get(id));
  saves.delete(id);
  transcripts.delete(id);
  await rm(file(id), { force: true });
}

export async function configure(id: string, settings: AgentSettings) {
  const before = store.get().workspaces.find((w) => w.id === id);
  await patch(id, { model: settings.model || undefined, effort: settings.effort || undefined, mode: settings.mode || undefined });
  const run = runs.get(id);
  if (run?.driver.streaming && settings.mode && settings.mode !== before?.mode) {
    run.write(run.driver.streaming.setMode(settings.mode));
  }
}

export async function respond(id: string, entryId: string, reply: Reply) {
  const run = runs.get(id);
  const pending = run?.pending.get(entryId);
  if (!run?.driver.streaming || !pending) return;
  run.pending.delete(entryId);

  const said = reply.kind === "deny" ? reply.message?.trim() : "";
  if (said) upsert(id, { id: randomUUID(), kind: "user", text: said });

  const result = run.driver.streaming.answer(pending, reply);
  run.write({ type: "control_response", response: { subtype: "success", request_id: pending.requestId, response: result.response } });
  upsert(id, result.entry);

  const workspace = store.get().workspaces.find((w) => w.id === id);
  const change: Partial<Workspace> = {};
  if (result.mode) {
    change.mode = result.mode;
  }
  if (result.rules?.length) change.allow = [...new Set([...(workspace?.allow ?? []), ...result.rules])];
  if (!run.pending.size) change.status = "working";
  if (Object.keys(change).length) await patch(id, change);
}

export async function recover() {
  const stale = store.get().workspaces.filter((w) => w.status === "working");
  for (const w of stale) await patch(w.id, { status: w.sessionId ? "ready" : "input" });
}

export function shutdown() {
  runs.forEach(kill);
  mkdirSync(dir(), { recursive: true });
  for (const [id, timer] of saves) {
    clearTimeout(timer);
    const entries = transcripts.get(id);
    if (entries) writeFileSync(file(id), JSON.stringify(entries));
  }
  saves.clear();
}
