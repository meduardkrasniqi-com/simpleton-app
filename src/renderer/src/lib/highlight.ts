import { useEffect, useState, type CSSProperties } from "react";
import type { HighlighterCore, ThemedToken } from "shiki/core";
import { bundledLanguages, bundledLanguagesInfo } from "shiki/langs";

export type Token = Pick<ThemedToken, "content" | "htmlStyle">;

const themes = { light: "github-light", dark: "github-dark-default" };
const maxLines = 6000;

const names: Record<string, string> = {
  dockerfile: "docker",
  makefile: "make",
  gemfile: "ruby",
  rakefile: "ruby",
  procfile: "shellscript",
  ".gitignore": "ini",
  ".env": "dotenv",
  ".npmrc": "ini",
  ".editorconfig": "ini",
};

const extensions: Record<string, string> = {
  mjs: "javascript",
  cjs: "javascript",
  mts: "typescript",
  cts: "typescript",
  h: "c",
  hpp: "cpp",
  cc: "cpp",
  zsh: "shellscript",
  bash: "shellscript",
  lock: "json",
  svg: "xml",
  plist: "xml",
  txt: "",
};

let core: Promise<HighlighterCore> | null = null;

function highlighter() {
  core ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript"), import("shiki/themes/github-light.mjs"), import("shiki/themes/github-dark-default.mjs")]).then(
    ([{ createHighlighterCore }, { createJavaScriptRegexEngine }, light, dark]) => createHighlighterCore({ themes: [light.default, dark.default], langs: [], engine: createJavaScriptRegexEngine({ forgiving: true }) }),
  );
  return core;
}

const canonical = new Map<string, string>();
for (const info of bundledLanguagesInfo) {
  canonical.set(info.id, info.id);
  for (const alias of info.aliases ?? []) canonical.set(alias, info.id);
}

function known(id: string) {
  return canonical.get(id.toLowerCase()) ?? null;
}

export function languageFor(path: string) {
  const file = path.split("/").pop()?.toLowerCase() ?? "";
  if (names[file] !== undefined) return names[file] || null;
  if (file.startsWith(".env")) return "dotenv";
  const ext = file.includes(".") ? file.split(".").pop()! : file;
  if (extensions[ext] !== undefined) return extensions[ext] || null;
  return known(ext);
}

export function languageForFence(tag: string) {
  return known(tag) ?? languageFor(`file.${tag}`);
}

export async function tokenize(code: string, language: string | null): Promise<Token[][] | null> {
  if (!language || code.split("\n").length > maxLines) return null;
  try {
    const h = await highlighter();
    const id = known(language);
    if (!id) return null;
    if (!h.getLoadedLanguages().includes(id)) await h.loadLanguage(bundledLanguages[id as keyof typeof bundledLanguages]);
    return h.codeToTokens(code, { lang: id, themes, defaultColor: false }).tokens;
  } catch {
    return null;
  }
}

export function useTokens(code: string, language: string | null) {
  const [tokens, setTokens] = useState<Token[][] | null>(null);
  useEffect(() => {
    let alive = true;
    setTokens(null);
    tokenize(code, language).then((t) => alive && setTokens(t));
    return () => {
      alive = false;
    };
  }, [code, language]);
  return tokens;
}

export function tokenStyle(token: Token) {
  return token.htmlStyle as CSSProperties | undefined;
}
