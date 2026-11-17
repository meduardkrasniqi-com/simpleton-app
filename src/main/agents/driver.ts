import type { AgentSettings, Entry, Reply } from "@shared/types";

export type Json = Record<string, unknown>;

export type Pending = { requestId: string; tool: string; input: Json; suggestions: Json[]; entry: Entry };

export type Answer = { response: Json; entry: Entry; mode?: string; rules?: string[] };

export type Update = { session: string } | { model: string } | { entry: Entry } | { request: Pending } | { cancel: string } | { settled: string } | { send: Json } | { error: string } | { done: true };

export type Launch = AgentSettings & { allow?: string[]; context: Context };

export type Driver = {
  args: (cwd: string, sessionId: string | undefined, settings: Launch) => string[];
  parser: (cwd: string, runId: string) => (event: Json) => Update[];
  streaming?: {
    open: (text: string) => Json[];
    answer: (pending: Pending, reply: Reply) => Answer;
    prepare: (pending: Pending, mode: string) => Pending;
    setMode: (mode: string) => Json;
  };
};

export type Context = { app?: { url: string; ready: boolean }; shots: string; appFile: string; browser?: string; screenshots: boolean };

export function instructions({ app, shots, appFile, browser, screenshots }: Context) {
  const capture = browser
    ? `To take a screenshot, run \`"${browser}" --headless --disable-gpu --hide-scrollbars --user-data-dir=${shots}/.profile --window-size=1440,900 --virtual-time-budget=5000 --screenshot=<file> <url>\`. It takes about a second and needs no install. Only if that fails, fall back to \`npx playwright screenshot --viewport-size=1440,900 <url> <file>\`.`
    : "To take a screenshot, run `npx playwright screenshot --viewport-size=1440,900 <url> <file>`. If the browser is missing, run `npx playwright install chromium` first.";
  const server = !app
    ? "No app was running in Simpleton when this turn started."
    : app.ready
      ? `The user's app is running at ${app.url}.`
      : `The user's app is starting at ${app.url}.`;
  return [
    "You are running inside Simpleton, a desktop app that renders your replies as Markdown. To show an image, embed it with Markdown image syntax and its absolute path, for example ![Home page](/tmp/shots/home.png). Simpleton shows it inline. Do not just tell the user where the file is.",
    ...(screenshots ? ["After you change anything the user will see in a web app, such as UI, styling, layout or frontend components, take a screenshot of the result and embed it in your final reply without being asked. If you cannot take one, say why in one sentence."] : []),
    `Save screenshots in ${shots} so Simpleton lists them. ${capture}`,
    "By default only load the page. Do not click, type, submit forms, log in or do anything that could change data, because the app may be connected to real data. Only interact with the page when the user explicitly asks you to.",
    `${server} Simpleton keeps the URL of the user's running app in ${appFile} and updates it live. Read that file before you start a server or take a screenshot. If it contains a URL, use that app and do not start another server, even if the port differs from what the project's docs say. If it is empty, start the dev server yourself, take the screenshot, then stop the server.`,
  ].join("\n\n");
}

export const text = (value: unknown) => (typeof value === "string" ? value : "");

export const record = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});

export const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export function command(value: string, cwd: string) {
  const lines = value
    .trim()
    .replace(/^cd\s+("[^"]*"|'[^']*'|\S+)\s*&&\s*/, (match, target: string) => {
      const dir = target.replace(/^["']|["']$/g, "").replace(/\/+$/, "");
      if (dir === cwd) return "";
      if (dir.startsWith(`${cwd}/`)) return `cd ${dir.slice(cwd.length + 1)} && `;
      return match;
    })
    .split("\n");
  return shorten(lines.length > 1 ? `${lines[0]} …` : lines[0]);
}

export function shorten(value: string, max = 160) {
  const line = value.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

const maxOutput = 8000;

export function output(value: unknown): string | undefined {
  const raw = typeof value === "string" ? value : list(value).map(record).map((block) => text(block.text)).join("\n");
  const clean = raw.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  if (!clean.trim()) return undefined;
  return clean.length > maxOutput ? `…${clean.slice(-maxOutput)}` : clean;
}
