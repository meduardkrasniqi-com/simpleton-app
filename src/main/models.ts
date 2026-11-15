import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import type { Agent, AgentSettings, ModelCatalog, ModelOption } from "@shared/types";

const claudeEfforts = ["low", "medium", "high", "xhigh", "max"];

const claudeModels: ModelOption[] = [
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

function claudeLabel(id: string) {
  const lower = id.toLowerCase();
  const known = claudeModels.find((m) => lower === m.id || lower.startsWith(`${m.id}[`) || lower.includes(`-${m.id}-`) || lower.startsWith(`${m.id}-`));
  if (!known) return id;
  return /\[1m\]/i.test(id) ? `${known.label} 1M` : known.label;
}

async function claude() {
  const settings = (await json<{ model?: string; effortLevel?: string }>(join(homedir(), ".claude", "settings.json"))) ?? {};
  const model = process.env.ANTHROPIC_MODEL || settings.model || (await learned())["claude-code"];
  const models = [...claudeModels];
  if (model && !models.some((m) => m.id === model)) models.unshift({ id: model, label: claudeLabel(model), efforts: claudeEfforts });
  return { models, defaults: { model, effort: settings.effortLevel } };
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
  return { models, defaults: { model, effort: toml(config, "model_reasoning_effort") } };
}

export async function catalog(): Promise<ModelCatalog> {
  const [c, x] = await Promise.all([claude(), codex()]);
  return { models: { "claude-code": c.models, codex: x.models }, defaults: { "claude-code": c.defaults as AgentSettings, codex: x.defaults as AgentSettings } };
}
