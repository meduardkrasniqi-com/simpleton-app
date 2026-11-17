import { git } from "./git";
import * as store from "./store";

export type Commit = { hash: string; at: number; repo: string; subject: string };

let commits: Commit[] = [];
let running: Promise<boolean> | null = null;

const span = 400 * 24 * 60 * 60 * 1000;

async function scan() {
  const found = new Map<string, Commit>();
  for (const repo of store.get().repos) {
    const email = await git(repo.path, ["config", "user.email"]).catch(() => "");
    if (!email) continue;
    const since = new Date(Date.now() - span).toISOString();
    const log = await git(repo.path, ["log", "--all", "--no-merges", "--fixed-strings", `--author=${email}`, `--since=${since}`, "--format=%H%x09%at%x09%s"]).catch(() => "");
    for (const line of log.split("\n")) {
      const [hash, at, ...subject] = line.split("\t");
      if (!hash || !at || found.has(hash)) continue;
      found.set(hash, { hash, at: Number(at) * 1000, repo: repo.name, subject: subject.join("\t").trim() });
    }
  }
  const next = [...found.values()].sort((a, b) => a.at - b.at);
  const changed = next.length !== commits.length || next.some((c, i) => c.hash !== commits[i]?.hash);
  commits = next;
  return changed;
}

export function refresh() {
  running ??= scan().finally(() => (running = null));
  return running;
}

export function between(start: number, end: number) {
  return commits.filter((c) => c.at >= start && c.at < end);
}

export function all() {
  return commits;
}
