import { execFile } from "node:child_process";
import { access, constants, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import type { Agent } from "@shared/types";

const home = homedir();

const fallbackDirs = [join(home, ".local/bin"), join(home, ".claude/local"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];

const internal = [/^ELECTRON_RUN_AS_NODE$/, /^CLAUDECODE$/, /^CLAUDE_CODE_(?!USE_|SKIP_)/, /^CLAUDE_PID$/, /^CLAUDE_AGENT_SDK_/, /^CLAUDE_EFFORT$/];

const keys = [/^ANTHROPIC_API_KEY$/, /^ANTHROPIC_AUTH_TOKEN$/, /^OPENAI_API_KEY$/, /^CODEX_API_KEY$/];

let shellPath: Promise<string> | null = null;

function loginShellPath() {
  const shell = process.env.SHELL || "/bin/zsh";
  return new Promise<string>((resolve) => {
    execFile(shell, ["-ilc", 'printf "__SIMPLETON__%s__SIMPLETON__" "$PATH"'], { timeout: 8000, env: { ...process.env, TERM: "dumb" } }, (_error, stdout) => {
      const match = /__SIMPLETON__(.*)__SIMPLETON__/.exec(stdout ?? "");
      resolve(match?.[1] ?? "");
    });
  });
}

async function path() {
  shellPath ??= loginShellPath();
  const dirs = [...(await shellPath).split(delimiter), ...(process.env.PATH ?? "").split(delimiter), ...fallbackDirs].filter(Boolean);
  return [...new Set(dirs)].join(delimiter);
}

async function clean(stripped: RegExp[]) {
  const result: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!stripped.some((pattern) => pattern.test(key))) result[key] = value;
  }
  result.PATH = await path();
  result.LANG ||= "en_US.UTF-8";
  return result;
}

export function env() {
  return clean([...internal, ...keys]);
}

export function shellEnv() {
  return clean(internal);
}

async function executable(file: string) {
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function compareVersions(a: string, b: string) {
  const parse = (name: string) => (/(\d+)\.(\d+)\.(\d+)/.exec(name) ?? []).slice(1).map(Number);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
  return 0;
}

async function extensionBinaries(prefix: string, relative: string) {
  const found: string[] = [];
  for (const root of [".vscode/extensions", ".cursor/extensions", ".windsurf/extensions"]) {
    const dir = join(home, root);
    const names = await readdir(dir).catch(() => [] as string[]);
    for (const name of names.filter((n) => n.startsWith(prefix)).sort(compareVersions)) found.push(join(dir, name, relative));
  }
  return found;
}

const names: Record<Agent, string> = { "claude-code": "claude", codex: "codex" };

async function bundled(agent: Agent) {
  if (agent === "claude-code") return extensionBinaries("anthropic.claude-code-", "resources/native-binary/claude");
  return ["/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex"];
}

export async function which(name: string) {
  for (const dir of (await path()).split(delimiter)) {
    const candidate = join(dir, name);
    if (await executable(candidate)) return candidate;
  }
  return null;
}

const resolved = new Map<Agent, string>();

export async function binary(agent: Agent) {
  const cached = resolved.get(agent);
  if (cached && (await executable(cached))) return cached;
  const candidates = [...(await path()).split(delimiter).map((dir) => join(dir, names[agent])), ...(await bundled(agent))];
  for (const candidate of candidates) {
    if (await executable(candidate)) {
      resolved.set(agent, candidate);
      return candidate;
    }
  }
  return null;
}
