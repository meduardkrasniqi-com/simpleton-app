import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { app } from "electron";
import type { NewWorkspace, Repo, SetupStep, Workspace } from "@shared/types";
import * as agents from "./agents";
import * as apps from "./apps";
import * as git from "./git";
import * as share from "./share";
import * as store from "./store";

const worktreesDir = () => join(app.getPath("userData"), "worktrees");
const trashDir = () => join(worktreesDir(), ".trash");

const stopwords = new Set(["a", "an", "the", "to", "of", "for", "in", "on", "at", "and", "or", "with", "from", "into", "is", "are", "be", "it", "this", "that", "please"]);

export function slugify(task: string) {
  const slug = task
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => !stopwords.has(word))
    .slice(0, 5)
    .join("-")
    .replace(/-+/g, "-")
    .slice(0, 48)
    .replace(/-$/, "");
  return slug || "task";
}

async function uniqueBranch(repo: Repo, task: string) {
  const base = slugify(task);
  const taken = new Set(store.get().workspaces.map((w) => w.branch));
  for (let i = 1; ; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    if (!taken.has(candidate) && !(await git.branchExists(repo.path, candidate))) return candidate;
  }
}

async function copyEnvFiles(from: string, to: string) {
  const entries = await readdir(from, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !/^\.env/.test(entry.name) || existsSync(join(to, entry.name))) continue;
    await copyFile(join(from, entry.name), join(to, entry.name)).catch(() => undefined);
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
  const branch = await uniqueBranch(repo, input.task);
  const id = randomUUID();
  const path = join(worktreesDir(), repo.name, `${branch}-${id.slice(0, 6)}`);
  const workspace: Workspace = {
    id,
    repoId: repo.id,
    task: input.task.trim(),
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
    const base = workspace.base || (await git.remoteBase(repo.path)) || (await git.currentBranch(repo.path));
    if (!find(id)) return;

    step = "worktree";
    await patch(id, { base, setup: { step } });
    if (!existsSync(workspace.path)) {
      await mkdir(join(worktreesDir(), repo.name), { recursive: true });
      await git.addWorktree(repo.path, workspace.path, workspace.branch, base);
    }
    if (!find(id)) {
      await git.removeWorktree(repo.path, workspace.path, workspace.branch);
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
