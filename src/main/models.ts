import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { app } from "electron";
import type { Agent, AgentSettings, ModelCatalog, ModelOption } from "@shared/types";
import { binaryInfo, env } from "./env";

const claudeEfforts = ["low", "medium", "high", "xhigh", "max"];

const fallbackModels: ModelOption[] = [
  { id: "fable", label: "Fable", efforts: claudeEfforts },
  { id: "opus", label: "Opus", efforts: claudeEfforts },
  { id: "sonnet", label: "Sonnet", efforts: claudeEfforts },
  { id: "haiku", label: "Haiku", efforts: claudeEfforts },
];

type CodexModel = { slug?: string; display_name?: string; visibility?: string; priority?: number; default_reasoning_level?: string; supported_reasoning_levels?: { effort?: string }[] };

const learnedFile = () => join(app.getPath("userData"), "defaults.json");

async function json<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function learned() {
  return (await json<Partial<Record<Agent, string>>>(learnedFile())) ?? {};
}

export async function learn(agent: Agent, model: string) {
  const current = await learned();
  if (current[agent] === model) return;
  await writeFile(learnedFile(), JSON.stringify({ ...current, [agent]: model })).catch(() => undefined);
}

type CliModel = { value?: string; resolvedModel?: string; displayName?: string; description?: string; supportedEffortLevels?: string[] };

type Listing = { models: CliModel[]; version?: string };

let listing: { path: string; result: Promise<Listing | null> } | null = null;

function handshake(file: string) {
  return new Promise<Listing | null>((resolve) => {
    env().then((environment) => {
      const child = spawn(file, ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"], { cwd: tmpdir(), env: environment, stdio: ["pipe", "pipe", "ignore"] });
      let done = false;
      const finish = (result: Listing | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        child.kill();
        resolve(result);
      };
      const timer = setTimeout(() => finish(null), 15000);
      child.on("error", () => finish(null));
      child.on("close", () => finish(null));
      createInterface({ input: child.stdout! }).on("line", (line) => {
        try {
          const event = JSON.parse(line);
          if (event.type !== "control_response" || event.response?.request_id !== "models") return;
          const body = event.response.response ?? {};
          finish(Array.isArray(body.models) ? { models: body.models, version: body.claude_code_version } : null);
        } catch {
          return;
        }
      });
      child.stdin!.on("error", () => undefined);
      child.stdin!.write(`${JSON.stringify({ type: "control_request", request_id: "models", request: { subtype: "initialize" } })}\n`);
    });
  });
}

async function claudeListing() {
  const cli = await binaryInfo("claude-code");
  if (!cli) return null;
  if (listing?.path !== cli.path) listing = { path: cli.path, result: handshake(cli.path) };
  const result = await listing.result;
  if (!result) listing = null;
  return result ? { ...result, version: result.version || cli.version } : { models: [], version: cli.version };
}

function baseLabel(models: ModelOption[], resolved: Map<string, string>, id: string) {
  const bare = id.replace(/\[1m\]$/i, "");
  const known = models.find((m) => m.id === bare) ?? models.find((m) => resolved.get(m.id) === bare);
  if (known) return known.label;
  const lower = bare.toLowerCase();
  return fallbackModels.find((m) => lower === m.id || lower.includes(`-${m.id}-`) || lower.startsWith(`${m.id}-`))?.label;
}

function claudeLabel(models: ModelOption[], resolved: Map<string, string>, id: string) {
  const base = baseLabel(models, resolved, id);
  if (!base) return id;
  return /\[1m\]$/i.test(id) ? `${base} 1M` : base;
}

async function claude() {
  const settings = (await json<{ model?: string; effortLevel?: string }>(join(homedir(), ".claude", "settings.json"))) ?? {};
  const cli = await claudeListing();
  const listed = (cli?.models ?? []).filter((m) => m.value && m.value !== "default" && m.displayName);
  const resolved = new Map(listed.map((m) => [m.value!, m.resolvedModel ?? m.value!]));
  const models: ModelOption[] = listed.length ? listed.map((m) => ({ id: m.value!, label: m.displayName!, efforts: m.supportedEffortLevels ?? [] })) : [...fallbackModels];
  const fallback = cli?.models.find((m) => m.value === "default");
  const model = process.env.ANTHROPIC_MODEL || settings.model || (await learned())["claude-code"] || fallback?.resolvedModel;
  if (model && !models.some((m) => m.id === model)) models.unshift({ id: model, label: claudeLabel(models, resolved, model), efforts: models.find((m) => resolved.get(m.id) === model.replace(/\[1m\]$/i, ""))?.efforts ?? claudeEfforts });
  return { models, defaults: { model, effort: settings.effortLevel }, version: cli?.version };
}

function toml(text: string, key: string) {
  const top = text.split(/^\s*\[/m)[0];
  const match = new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\n#]+?)["']?\\s*(?:#.*)?$`, "m").exec(top);
  return match?.[1].trim();
}

async function codex() {
  const home = process.env.CODEX_HOME || join(homedir(), ".codex");
  const cache = (await json<{ models?: CodexModel[] }>(join(home, "models_cache.json"))) ?? {};
  const models: ModelOption[] = (cache.models ?? [])
    .filter((m) => m.slug && m.visibility === "list")
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
    .map((m) => ({
      id: m.slug!,
      label: m.display_name || m.slug!,
      efforts: (m.supported_reasoning_levels ?? []).map((level) => level.effort ?? "").filter(Boolean),
      defaultEffort: m.default_reasoning_level,
    }));
  const config = await readFile(join(home, "config.toml"), "utf8").catch(() => "");
  const model = toml(config, "model") || (await learned()).codex || models[0]?.id;
  if (model && !models.some((m) => m.id === model)) models.unshift({ id: model, label: model, efforts: [] });
  const cli = await binaryInfo("codex");
  return { models, defaults: { model, effort: toml(config, "model_reasoning_effort") }, version: cli?.version };
}

export async function catalog(): Promise<ModelCatalog> {
  const [c, x] = await Promise.all([claude(), codex()]);
  return { models: { "claude-code": c.models, codex: x.models }, defaults: { "claude-code": c.defaults as AgentSettings, codex: x.defaults as AgentSettings }, versions: { "claude-code": c.version || undefined, codex: x.version || undefined } };
}
