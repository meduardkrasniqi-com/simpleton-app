import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { shell } from "electron";
import type { PrResult } from "@shared/types";
import * as agents from "./agents";
import { shellEnv, which } from "./env";
import * as git from "./git";
import * as store from "./store";

const exec = promisify(execFile);

function message(error: unknown) {
  const e = error as { stderr?: string; message?: string };
  return (e.stderr || e.message || String(error)).trim();
}

export function githubRepo(remote: string) {
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remote.trim());
  return match ? { owner: match[1], repo: match[2] } : null;
}

export function compareUrl(remote: string, base: string, branch: string, title: string, body: string) {
  const gh = githubRepo(remote);
  if (!gh) return null;
  const query = new URLSearchParams({ expand: "1", title, body });
  return `https://github.com/${gh.owner}/${gh.repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}?${query}`;
}

async function summary(id: string) {
  const entries = await agents.transcript(id);
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.kind === "assistant") return entry.text;
  }
  return "";
}

export async function create(id: string): Promise<PrResult> {
  const workspace = store.get().workspaces.find((w) => w.id === id);
  if (!workspace) throw new Error("Unknown workspace");
  const cwd = workspace.path;
  const title = workspace.task.split("\n")[0].trim().slice(0, 72) || workspace.branch;
  const body = (await summary(id)) || workspace.task;

  const dirty = !!(await git.git(cwd, ["status", "--porcelain"]));
  if (dirty) {
    await git.git(cwd, ["add", "-A"]);
    await git.git(cwd, ["commit", "-m", title]).catch((error) => {
      throw new Error(`Couldn't commit the changes.\n\n${message(error)}`);
    });
  }

  const ahead = Number(await git.git(cwd, ["rev-list", "--count", `${workspace.base}..HEAD`]).catch(() => "0"));
  if (!ahead) throw new Error("There are no changes to put in a pull request yet.");

  if (workspace.prUrl && !dirty) {
    const unpushed = await git.git(cwd, ["rev-list", "--count", "@{u}..HEAD"]).catch(() => "1");
    if (unpushed === "0") throw new Error("Everything is already pushed to the pull request.");
  }

  const remote = await git.git(cwd, ["remote", "get-url", "origin"]).catch(() => "");
  if (!remote) throw new Error("This repository has no origin remote to push to.");

  await git.git(cwd, ["push", "-u", "origin", workspace.branch]).catch((error) => {
    throw new Error(`Couldn't push ${workspace.branch}.\n\n${message(error)}`);
  });

  if (workspace.prUrl) return "pushed";

  const gh = githubRepo(remote) ? await which("gh") : null;
  if (gh) {
    try {
      const { stdout } = await exec(gh, ["pr", "create", "--base", workspace.base, "--head", workspace.branch, "--title", title, "--body", body], { cwd, env: await shellEnv() });
      const url = /https:\/\/\S+\/pull\/\d+/.exec(stdout)?.[0];
      if (url) return finish(id, url);
    } catch (error) {
      const url = /https:\/\/\S+\/pull\/\d+/.exec(message(error))?.[0];
      if (url) return finish(id, url);
    }
  }

  const url = compareUrl(remote, workspace.base, workspace.branch, title, body);
  if (!url) throw new Error(`Pushed ${workspace.branch} to origin. Open the pull request on your git host.`);
  await shell.openExternal(url);
  return "opened";
}

async function finish(id: string, url: string): Promise<PrResult> {
  await store.update((s) => ({ ...s, workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, prUrl: url } : w)) }));
  await shell.openExternal(url);
  return "created";
}
