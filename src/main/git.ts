import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
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
  if (await branchExists(repo, branch)) await git(repo, ["worktree", "add", target, branch]);
  else await git(repo, ["worktree", "add", "--no-track", "-b", branch, target, base]);
}

async function refExists(path: string, ref: string) {
  return git(path, ["rev-parse", "--verify", "--quiet", ref]).then(
    () => true,
    () => false,
  );
}

export async function remoteBase(path: string) {
  const remote = await git(path, ["remote", "get-url", "origin"]).catch(() => "");
  if (!remote) return null;
  const head = await git(path, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).catch(() => "");
  const branch = head.replace(/^origin\//, "") || (await git(path, ["ls-remote", "--symref", "origin", "HEAD"]).catch(() => "")).match(/refs\/heads\/(\S+)\s+HEAD/)?.[1] || "main";
  await exec("git", ["fetch", "--quiet", "origin", branch], { cwd: path, timeout: 30000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }).catch(() => undefined);
  const ref = `origin/${branch}`;
  return (await refExists(path, ref)) ? ref : null;
}

export async function removeWorktree(repo: string, target: string, branch: string, trash?: string) {
  const moved = trash ? await mkdir(dirname(trash), { recursive: true }).then(() => rename(target, trash)).then(() => true, () => false) : false;
  await git(repo, ["worktree", "remove", "--force", target]).catch(() => git(repo, ["worktree", "prune"]));
  await git(repo, ["branch", "-D", branch]).catch(() => undefined);
  if (moved && trash) await rm(trash, { recursive: true, force: true }).catch(() => undefined);
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
  const list = (args: string[]) => exec("git", ["ls-files", "-z", ...args], { cwd: worktree, maxBuffer: 64 * 1024 * 1024 }).then(({ stdout }) => stdout.split("\0"));
  const [visible, ignored, removed] = await Promise.all([list(["--cached", "--others", "--exclude-standard"]), list(["--others", "--ignored", "--exclude-standard", "--directory"]).catch(() => []), list(["--deleted"])]);
  const deleted = new Set(removed);
  return [...new Set([...visible, ...ignored.filter((path) => !path.endsWith("/"))])].filter((path) => path && !deleted.has(path)).sort();
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
    const ignored = await git(worktree, ["check-ignore", "-q", "--", path]).then(
      () => true,
      () => false,
    );
    const content = await read();
    if (!content) return { binary: false, truncated: false, lines: [] };
    if (content.includes(0)) return { binary: true, truncated: false, lines: [] };
    return plain(content.toString("utf8"), ignored ? "ctx" : "add");
  }
  const mergeBase = await git(worktree, ["merge-base", base, "HEAD"]).catch(() => base);
  const { stdout } = await exec("git", ["diff", "--no-color", "--no-ext-diff", "-U100000", mergeBase, "--", path], { cwd: worktree, maxBuffer: 64 * 1024 * 1024 });
  if (stdout.trim()) return parse(stdout);
  const content = await read();
  if (!content) return { binary: false, truncated: false, lines: [] };
  if (content.includes(0)) return { binary: true, truncated: false, lines: [] };
  return plain(content.toString("utf8"), "ctx");
}
