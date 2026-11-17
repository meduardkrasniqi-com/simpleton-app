import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { app } from "electron";
import type { NewWorkspace, Repo, SetupStep, Workspace } from "@shared/types";
import * as agents from "./agents";
import * as apps from "./apps";
import * as git from "./git";
import * as naming from "./naming";
import * as share from "./share";
import * as store from "./store";

const worktreesDir = () => join(app.getPath("userData"), "worktrees");
const trashDir = () => join(worktreesDir(), ".trash");

async function uniqueBranch(repo: Repo, slug: string, except?: string) {
  const owner = await naming.prefix(repo.path);
  const base = owner ? `${owner}/${slug}` : slug;
  const taken = new Set(store.get().workspaces.filter((w) => w.id !== except).map((w) => w.branch));
  for (let i = 1; ; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    if (!taken.has(candidate) && !(await git.branchExists(repo.path, candidate))) return candidate;
  }
}

async function copyEnvFiles(from: string, to: string) {
  const ignored = await git.ignoredFiles(from).catch(() => []);
  for (const path of ignored) {
    if (!/^\.env/.test(basename(path)) || existsSync(join(to, path))) continue;
    await mkdir(dirname(join(to, path)), { recursive: true }).catch(() => undefined);
    await copyFile(join(from, path), join(to, path)).catch(() => undefined);
  }
}

export async function addRepo(path: string) {
  if (!(await git.isRepo(path))) throw new Error(`${path} is not a git repository`);
  const top = await git.root(path);
  const existing = store.get().repos.find((r) => r.path === top);
  if (existing) return existing;
  const repo: Repo = { id: randomUUID(), name: basename(top), path: top };
  await store.update((s) => ({ ...s, repos: [...s.repos, repo] }));
  return repo;
}

export async function removeRepo(id: string) {
  const owned = store.get().workspaces.filter((w) => w.repoId === id);
  for (const w of owned) await removeWorkspace(w.id);
  await store.update((s) => ({ ...s, repos: s.repos.filter((r) => r.id !== id) }));
}

export async function createWorkspace(input: NewWorkspace) {
  const repo = store.get().repos.find((r) => r.id === input.repoId);
  if (!repo) throw new Error("Unknown repository");
  const guess = naming.guess(input.task);
  const branch = await uniqueBranch(repo, guess.slug);
  const id = randomUUID();
  const path = join(worktreesDir(), repo.name, `${guess.slug}-${id.slice(0, 6)}`);
  const workspace: Workspace = {
    id,
    repoId: repo.id,
    task: input.task.trim(),
    title: guess.title,
    agent: input.agent,
    branch,
    base: "",
    path,
    status: "setup",
    setup: { step: "fetch" },
    createdAt: Date.now(),
    model: input.model || undefined,
    effort: input.effort || undefined,
    mode: input.mode || undefined,
  };
  await store.update((s) => ({ ...s, workspaces: [...s.workspaces, workspace] }));
  setup(id).catch(() => undefined);
  return workspace;
}

const settingUp = new Set<string>();

const find = (id: string) => store.get().workspaces.find((w) => w.id === id);

async function patch(id: string, change: Partial<Workspace>) {
  await store.update((s) => ({ ...s, workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, ...change } : w)) }));
}

function reason(error: unknown) {
  const e = error as { stderr?: string; message?: string };
  return (e.stderr || e.message || String(error)).trim().replace(/^Command failed: .*\n/, "");
}

async function setup(id: string) {
  if (settingUp.has(id)) return;
  settingUp.add(id);
  let step: SetupStep = "fetch";
  try {
    const workspace = find(id);
    const repo = workspace && store.get().repos.find((r) => r.id === workspace.repoId);
    if (!workspace || !repo) return;

    await patch(id, { status: "setup", setup: { step } });
    const fresh = !existsSync(workspace.path);
    const [remote, named] = await Promise.all([workspace.base ? workspace.base : git.remoteBase(repo.path), fresh && !workspace.summary ? naming.name(workspace.task) : null]);
    const base = remote || (await git.currentBranch(repo.path));
    if (!find(id)) return;
    let branch = workspace.branch;
    if (named?.summary) {
      branch = await uniqueBranch(repo, named.slug, id);
      await patch(id, { branch, title: named.title, summary: named.summary });
    }

    step = "worktree";
    await patch(id, { base, setup: { step } });
    if (!existsSync(workspace.path)) {
      await mkdir(join(worktreesDir(), repo.name), { recursive: true });
      await git.addWorktree(repo.path, workspace.path, branch, base);
    }
    if (!find(id)) {
      await git.removeWorktree(repo.path, workspace.path, branch);
      return;
    }

    step = "env";
    await patch(id, { setup: { step } });
    await copyEnvFiles(repo.path, workspace.path);
    if (!find(id)) return;

    step = "agent";
    await patch(id, { setup: { step } });
    apps.install(id).catch(() => undefined);
    agents.send(id, workspace.task).catch(() => undefined);
  } catch (error) {
    if (find(id)) await patch(id, { setup: { step, error: reason(error) } });
  } finally {
    settingUp.delete(id);
  }
}

export async function retrySetup(id: string) {
  const workspace = find(id);
  if (workspace?.status === "setup") await setup(id);
}

export async function recoverSetups() {
  for (const w of store.get().workspaces) {
    if (w.status === "setup" && !w.setup?.error) await patch(w.id, { setup: { step: w.setup?.step ?? "fetch", error: "Setup was interrupted when Simpleton closed." } });
  }
}

export async function removeWorkspace(id: string) {
  const { repos, workspaces } = store.get();
  const workspace = workspaces.find((w) => w.id === id);
  if (!workspace) return;
  await agents.forget(id);
  await apps.forget(id);
  await share.stop(id);
  await store.update((s) => ({ ...s, workspaces: s.workspaces.filter((w) => w.id !== id) }));
  const repo = repos.find((r) => r.id === workspace.repoId);
  if (repo) git.removeWorktree(repo.path, workspace.path, workspace.branch, join(trashDir(), randomUUID())).catch(() => undefined);
}

export function emptyTrash() {
  rm(trashDir(), { recursive: true, force: true }).catch(() => undefined);
}

export async function file(id: string, path: string) {
  const workspace = store.get().workspaces.find((w) => w.id === id);
  if (!workspace || workspace.status === "setup") throw new Error("Unknown workspace");
  return git.fileView(workspace.path, workspace.base, path);
}

export async function files(id: string) {
  const workspace = store.get().workspaces.find((w) => w.id === id);
  if (!workspace || workspace.status === "setup") return [];
  return git.listFiles(workspace.path);
}

export async function repoFiles(repoId: string) {
  const repo = store.get().repos.find((r) => r.id === repoId);
  if (!repo) return [];
  return git.listFiles(repo.path).catch(() => []);
}

export async function changes(id: string) {
  const workspace = store.get().workspaces.find((w) => w.id === id);
  if (!workspace || workspace.status === "setup") return [];
  return git.changes(workspace.path, workspace.base);
}

const maxEditable = 2 * 1024 * 1024;

function inside(id: string, path: string) {
  const workspace = store.get().workspaces.find((w) => w.id === id);
  if (!workspace || workspace.status === "setup") throw new Error("Unknown workspace");
  const full = resolve(workspace.path, path);
  if (!full.startsWith(workspace.path + sep)) throw new Error("Path is outside the workspace");
  return full;
}

export async function readText(id: string, path: string) {
  const full = inside(id, path);
  if ((await stat(full)).size > maxEditable) throw new Error("File is too large to edit here");
  const content = await readFile(full);
  if (content.includes(0)) throw new Error("Binary files can't be edited");
  return content.toString("utf8");
}

export async function writeText(id: string, path: string, text: string) {
  const full = inside(id, path);
  await writeFile(full, text);
}
