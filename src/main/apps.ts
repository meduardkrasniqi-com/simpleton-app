import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { join } from "node:path";
import type { Preview } from "@shared/types";
import * as store from "./store";
import * as terminals from "./terminals";

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

async function command(dir: string, port: number) {
  const m = await manifest(dir);
  if (!m) return null;
  const scripts = m.scripts ?? {};
  const script = ["dev", "start", "serve"].find((name) => scripts[name]);
  if (!script) return null;
  const pm = packageManager(dir);
  const flag = portFlag.test(scripts[script]) ? (pm === "npm" ? ` -- --port ${port}` : ` --port ${port}`) : "";
  const install = needsInstall(dir, m) ? `${pm} install && ` : "";
  return `${install}${pm} run ${script}${flag}`;
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

export async function start(id: string) {
  const workspace = store.get().workspaces.find((w) => w.id === id);
  if (!workspace) throw new Error("Unknown workspace");
  const install = installs.get(id);
  if (!install) {
    terminals.kill(id, "app");
    terminals.clear(id, "app");
  }
  const port = await randomPort();
  const url = `http://localhost:${port}`;
  if (!(await command(workspace.path, port))) {
    terminals.print(id, "app", "No dev, start or serve script found in package.json.\n");
    await set(id, { state: "failed", port, url });
    return;
  }
  await set(id, { state: "starting", port, url });
  if (install) {
    const code = await install.done;
    const current = store.get().previews[id];
    if (current?.state !== "starting" || current.port !== port) return;
    if (code !== 0) return void (await patch(id, { state: "failed" }));
    terminals.print(id, "app", "\n");
  }
  const run = await command(workspace.path, port);
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
