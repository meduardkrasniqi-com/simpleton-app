import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { FileChange } from "@shared/types";

const exec = promisify(execFile);

export async function git(cwd: string, args: string[]) {
  const { stdout } = await exec("git", args, { cwd, maxBuffer: 32 * 1024 * 1024 });
  return stdout.trim();
}

export async function isRepo(path: string) {
  try {
    return (await git(path, ["rev-parse", "--is-inside-work-tree"])) === "true";
  } catch {
    return false;
  }
}

export async function root(path: string) {
  return git(path, ["rev-parse", "--show-toplevel"]);
}

export async function currentBranch(path: string) {
  try {
    return await git(path, ["symbolic-ref", "--short", "HEAD"]);
  } catch {
    return git(path, ["rev-parse", "HEAD"]);
  }
}

export async function branchExists(path: string, branch: string) {
  try {
    await git(path, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

export async function addWorktree(repo: string, target: string, branch: string, base: string) {
  await git(repo, ["worktree", "add", "-b", branch, target, base]);
}

export async function removeWorktree(repo: string, target: string, branch: string) {
  await git(repo, ["worktree", "remove", "--force", target]).catch(() => git(repo, ["worktree", "prune"]));
  await git(repo, ["branch", "-D", branch]).catch(() => undefined);
}

async function lineCount(file: string) {
  try {
    const content = await readFile(file);
    if (content.includes(0)) return 0;
    const text = content.toString("utf8");
    if (!text) return 0;
    return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  } catch {
    return 0;
  }
}

export async function changes(worktree: string, base: string): Promise<FileChange[]> {
  const mergeBase = await git(worktree, ["merge-base", base, "HEAD"]).catch(() => base);
  const tracked = await git(worktree, ["diff", "--numstat", mergeBase]);
  const untracked = await git(worktree, ["ls-files", "--others", "--exclude-standard"]);
  const files: FileChange[] = tracked
    ? tracked.split("\n").map((line) => {
        const [added, removed, ...rest] = line.split("\t");
        return { path: rest.join("\t"), added: Number(added) || 0, removed: Number(removed) || 0 };
      })
    : [];
  for (const path of untracked ? untracked.split("\n") : []) {
    files.push({ path, added: await lineCount(join(worktree, path)), removed: 0 });
  }
  return files;
}
