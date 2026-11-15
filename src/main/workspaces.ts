import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { app } from "electron";
import type { NewWorkspace, Repo, Workspace } from "@shared/types";
import * as git from "./git";
import * as store from "./store";

const worktreesDir = () => join(app.getPath("userData"), "worktrees");

export function slugify(task: string) {
  const slug = task
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .split(/\s+/)
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
  const base = await git.currentBranch(repo.path);
  const id = randomUUID();
  const path = join(worktreesDir(), repo.name, `${branch}-${id.slice(0, 6)}`);
  await mkdir(join(worktreesDir(), repo.name), { recursive: true });
  await git.addWorktree(repo.path, path, branch, base);
  const workspace: Workspace = { id, repoId: repo.id, task: input.task.trim(), agent: input.agent, branch, base, path, status: "idle", createdAt: Date.now() };
  await store.update((s) => ({ ...s, workspaces: [...s.workspaces, workspace] }));
  return workspace;
}

export async function removeWorkspace(id: string) {
  const { repos, workspaces } = store.get();
  const workspace = workspaces.find((w) => w.id === id);
  if (!workspace) return;
  const repo = repos.find((r) => r.id === workspace.repoId);
  if (repo) await git.removeWorktree(repo.path, workspace.path, workspace.branch);
  await store.update((s) => ({ ...s, workspaces: s.workspaces.filter((w) => w.id !== id) }));
}

export async function changes(id: string) {
  const workspace = store.get().workspaces.find((w) => w.id === id);
  if (!workspace) return [];
  return git.changes(workspace.path, workspace.base);
}

export function find(id: string) {
  return store.get().workspaces.find((w) => w.id === id);
}
