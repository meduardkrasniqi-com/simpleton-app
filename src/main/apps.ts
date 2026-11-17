import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { join } from "node:path";
import { promisify } from "node:util";
import type { OpenPort, Preview, RunMode, RunOption } from "@shared/types";
import * as store from "./store";
import * as terminals from "./terminals";

const exec = promisify(execFile);

const tools = /\b(vite|next|astro|nuxt|nuxi|storybook|docusaurus|remix|react-router|webpack|wrangler|serve|http-server|rails|django|flask|uvicorn|php|bun|deno)\b(?:\s+(dev|preview|start|serve|server|runserver))?/;

const portFlag = /\b(vite|next|astro|nuxt|nuxi|ng serve|webpack serve|webpack-dev-server|svelte-kit|react-router dev|remix vite:dev|storybook dev|docusaurus start)\b/;

const watchers = new Map<string, NodeJS.Timeout>();

type Install = { done: Promise<number>; finish: (code: number) => void };

const installs = new Map<string, Install>();

function packageManager(dir: string) {
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(dir, "yarn.lock"))) return "yarn";
  if (existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock"))) return "bun";
  return "npm";
}

type Manifest = { scripts?: Record<string, string>; dependencies?: object; devDependencies?: object };

async function manifest(dir: string) {
  try {
    return JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as Manifest;
  } catch {
    return null;
  }
}

function needsInstall(dir: string, m: Manifest) {
  return Object.keys({ ...m.dependencies, ...m.devDependencies }).length > 0 && !existsSync(join(dir, "node_modules"));
}

type Plan = { mode: RunMode; build?: string; serve: string };

function plan(scripts: Record<string, string>, mode: RunMode): Plan | null {
  if (mode === "build" && scripts.build) {
    const serve = ["preview", "start", "serve"].find((name) => scripts[name]);
    if (serve) return { mode, build: "build", serve };
  }
  const serve = ["dev", "start", "serve"].find((name) => scripts[name]);
  return serve ? { mode: "dev", serve } : null;
}

async function command(dir: string, port: number, mode: RunMode) {
  const m = await manifest(dir);
  if (!m) return null;
  const scripts = m.scripts ?? {};
  const p = plan(scripts, mode);
  if (!p) return null;
  const pm = packageManager(dir);
  const flag = portFlag.test(scripts[p.serve]) ? (pm === "npm" ? ` -- --port ${port}` : ` --port ${port}`) : "";
  const install = needsInstall(dir, m) ? `${pm} install && ` : "";
  const build = p.build ? `${pm} run ${p.build} && ` : "";
  return { mode: p.mode, run: `${install}${build}${pm} run ${p.serve}${flag}` };
}

export async function options(id: string): Promise<RunOption[]> {
  const workspace = store.get().workspaces.find((w) => w.id === id);
  const m = workspace && (await manifest(workspace.path));
  if (!workspace || !m) return [];
  const scripts = m.scripts ?? {};
  const pm = packageManager(workspace.path);
  const result: RunOption[] = [];
  for (const mode of ["dev", "build"] as const) {
    const p = plan(scripts, mode);
    if (p?.mode === mode) result.push({ mode, command: `${p.build ? `${pm} run ${p.build} && ` : ""}${pm} run ${p.serve}` });
  }
  return result;
}

function fields(out: string) {
  const rows: { pid: number; values: Record<string, string[]> }[] = [];
  for (const line of out.split("\n")) {
    if (!line) continue;
    const key = line[0];
    const value = line.slice(1);
    if (key === "p") rows.push({ pid: Number(value), values: {} });
    else if (rows.length) (rows[rows.length - 1].values[key] ??= []).push(value);
  }
  return rows;
}

export async function ports(id: string): Promise<OpenPort[]> {
  const workspace = store.get().workspaces.find((w) => w.id === id);
  if (!workspace) return [];
  try {
    const listening = fields((await exec("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcn"])).stdout).filter((row) => row.pid !== process.pid);
    if (!listening.length) return [];
    const pids = listening.map((row) => row.pid).join(",");
    const cwds = new Map(fields((await exec("lsof", ["-a", "-d", "cwd", "-p", pids, "-F", "pn"])).stdout).map((row) => [row.pid, row.values.n?.[0] ?? ""]));
    const root = await realpath(workspace.path).catch(() => workspace.path);
    const inside = listening.filter((row) => {
      const cwd = cwds.get(row.pid) ?? "";
      return cwd === root || cwd.startsWith(`${root}/`);
    });
    if (!inside.length) return [];
    const commands = new Map<number, string>();
    const ps = await exec("ps", ["-o", "pid=,command=", "-p", inside.map((row) => row.pid).join(",")]).catch(() => ({ stdout: "" }));
    for (const line of ps.stdout.split("\n")) {
      const match = /^\s*(\d+)\s+(.*)$/.exec(line);
      if (match) commands.set(Number(match[1]), match[2]);
    }
    const found = new Map<number, OpenPort>();
    for (const row of inside) {
      const tool = tools.exec(commands.get(row.pid) ?? "");
      const name = tool ? [tool[1], tool[2]].filter(Boolean).join(" ") : (row.values.c?.[0] ?? "process");
      for (const address of row.values.n ?? []) {
        const port = Number(address.slice(address.lastIndexOf(":") + 1));
        if (port && !found.has(port)) found.set(port, { port, name });
      }
    }
    return [...found.values()].sort((a, b) => a.port - b.port);
  } catch {
    return [];
  }
}

function free(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen({ port }, () => server.close(() => resolve(true)));
  });
}

async function randomPort() {
  const taken = new Set(Object.values(store.get().previews).map((p) => p.port));
  for (let i = 0; i < 50; i++) {
    const port = 4000 + Math.floor(Math.random() * 5000);
    if (!taken.has(port) && (await free(port))) return port;
  }
  throw new Error("No free port found");
}

function listening(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ port, host: "localhost" });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

function set(id: string, preview: Preview | null) {
  return store.update((s) => {
    const previews = { ...s.previews };
    if (preview) previews[id] = preview;
    else delete previews[id];
    return { ...s, previews };
  });
}

function patch(id: string, change: Partial<Preview>) {
  const current = store.get().previews[id];
  if (current) return set(id, { ...current, ...change });
}

function watch(id: string, port: number) {
  clearInterval(watchers.get(id));
  watchers.set(
    id,
    setInterval(async () => {
      const preview = store.get().previews[id];
      if (!preview || preview.state !== "starting") return clearInterval(watchers.get(id));
      if (await listening(port)) patch(id, { state: "running" });
    }, 1000),
  );
}

const urlPattern = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{2,5})/;

terminals.onData(({ workspaceId, kind, data }) => {
  if (kind !== "app") return;
  const preview = store.get().previews[workspaceId];
  if (!preview || preview.state !== "starting") return;
  const match = urlPattern.exec(data.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ""));
  if (!match) return;
  const port = Number(match[1]);
  patch(workspaceId, { state: "running", port, url: `http://localhost:${port}` });
});

terminals.onExit((workspaceId, kind, code) => {
  if (kind !== "app") return;
  const install = installs.get(workspaceId);
  if (install) {
    installs.delete(workspaceId);
    install.finish(code);
    const preview = store.get().previews[workspaceId];
    if (preview && code !== 0) terminals.print(workspaceId, "app", `\n[install exited with code ${code}]\n`);
    if (preview?.state === "installing") patch(workspaceId, { state: code === 0 ? "stopped" : "failed" });
    return;
  }
  clearInterval(watchers.get(workspaceId));
  const preview = store.get().previews[workspaceId];
  if (!preview) return;
  terminals.print(workspaceId, "app", `\n[exited with code ${code}]\n`);
  patch(workspaceId, { state: preview.state === "stopped" || code === 0 || code === 143 ? "stopped" : "failed" });
});

export async function install(id: string) {
  const workspace = store.get().workspaces.find((w) => w.id === id);
  if (!workspace || installs.has(id) || store.get().previews[id]) return;
  const m = await manifest(workspace.path);
  if (!m || !needsInstall(workspace.path, m)) return;
  const run = `${packageManager(workspace.path)} install`;
  let finish: (code: number) => void = () => undefined;
  const done = new Promise<number>((resolve) => (finish = resolve));
  installs.set(id, { done, finish });
  await set(id, { state: "installing", port: 0, url: "" });
  terminals.clear(id, "app");
  terminals.print(id, "app", `$ ${run}\n`);
  try {
    await terminals.spawn(id, "app", ["-ilc", run]);
  } catch {
    installs.delete(id);
    finish(1);
    await patch(id, { state: "failed" });
  }
}

export async function start(id: string, choice?: RunMode) {
  let workspace = store.get().workspaces.find((w) => w.id === id);
  if (!workspace) throw new Error("Unknown workspace");
  if (choice && choice !== workspace.run) {
    await store.update((s) => ({ ...s, workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, run: choice } : w)) }));
    workspace = store.get().workspaces.find((w) => w.id === id) ?? workspace;
  }
  const mode = workspace.run ?? "dev";
  const install = installs.get(id);
  if (!install) {
    terminals.kill(id, "app");
    terminals.clear(id, "app");
  }
  const port = await randomPort();
  const url = `http://localhost:${port}`;
  const planned = await command(workspace.path, port, mode);
  if (!planned) {
    terminals.print(id, "app", "No dev, start or serve script found in package.json.\n");
    await set(id, { state: "failed", port, url, mode });
    return;
  }
  await set(id, { state: "starting", port, url, mode: planned.mode });
  if (install) {
    const code = await install.done;
    const current = store.get().previews[id];
    if (current?.state !== "starting" || current.port !== port) return;
    if (code !== 0) return void (await patch(id, { state: "failed" }));
    terminals.print(id, "app", "\n");
  }
  const run = (await command(workspace.path, port, mode))?.run;
  if (!run) return void (await patch(id, { state: "failed" }));
  terminals.print(id, "app", `$ PORT=${port} ${run}\n`);
  await terminals.spawn(id, "app", ["-ilc", run], { PORT: String(port) });
  watch(id, port);
}

export async function stop(id: string) {
  clearInterval(watchers.get(id));
  await patch(id, { state: "stopped" });
  terminals.kill(id, "app");
}

export async function forget(id: string) {
  clearInterval(watchers.get(id));
  installs.get(id)?.finish(-1);
  installs.delete(id);
  terminals.forget(id);
  if (store.get().previews[id]) await set(id, null);
}
