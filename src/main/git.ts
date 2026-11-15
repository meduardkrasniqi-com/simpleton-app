import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { DiffLine, FileChange, FileView } from "@shared/types";

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

const maxLines = 20000;

function plain(text: string, kind: "add" | "ctx"): FileView {
  const rows = text.split("\n");
  if (text.endsWith("\n")) rows.pop();
  return { binary: false, truncated: rows.length > maxLines, lines: rows.slice(0, maxLines).map((line, i) => ({ kind, text: line, n: i + 1 })) };
}

function parse(diff: string): FileView {
  if (/^Binary files .* differ$/m.test(diff)) return { binary: true, truncated: false, lines: [] };
  const lines: DiffLine[] = [];
  let n = 0;
  let started = false;
  for (const line of diff.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      if (started) lines.push({ kind: "gap", text: "" });
      started = true;
      n = Number(hunk[1]);
      continue;
    }
    if (!started || line.startsWith("\\")) continue;
    if (line.startsWith("+")) lines.push({ kind: "add", text: line.slice(1), n: n++ });
    else if (line.startsWith("-")) lines.push({ kind: "del", text: line.slice(1) });
    else if (line.startsWith(" ")) lines.push({ kind: "ctx", text: line.slice(1), n: n++ });
    if (lines.length >= maxLines) return { binary: false, truncated: true, lines };
  }
  return { binary: false, truncated: false, lines };
}

export async function listFiles(worktree: string) {
  const { stdout } = await exec("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: worktree, maxBuffer: 64 * 1024 * 1024 });
  const deleted = new Set((await git(worktree, ["ls-files", "-z", "--deleted"])).split("\0"));
  return [...new Set(stdout.split("\0"))].filter((path) => path && !deleted.has(path));
}

export async function fileView(worktree: string, base: string, path: string): Promise<FileView> {
  const full = resolve(worktree, path);
  if (!full.startsWith(worktree + sep)) throw new Error("Path is outside the workspace");
  const tracked = await git(worktree, ["ls-files", "--error-unmatch", "--", path]).then(
    () => true,
    () => false,
  );
  const read = () => readFile(full).catch(() => null);
  if (!tracked) {
    const content = await read();
    if (!content) return { binary: false, truncated: false, lines: [] };
    if (content.includes(0)) return { binary: true, truncated: false, lines: [] };
    return plain(content.toString("utf8"), "add");
  }
  const mergeBase = await git(worktree, ["merge-base", base, "HEAD"]).catch(() => base);
  const { stdout } = await exec("git", ["diff", "--no-color", "--no-ext-diff", "-U100000", mergeBase, "--", path], { cwd: worktree, maxBuffer: 64 * 1024 * 1024 });
  if (stdout.trim()) return parse(stdout);
  const content = await read();
  if (!content) return { binary: false, truncated: false, lines: [] };
  if (content.includes(0)) return { binary: true, truncated: false, lines: [] };
  return plain(content.toString("utf8"), "ctx");
}
