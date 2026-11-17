import { File, FileArchive, FileAudio, FileBraces, FileCode, FileCog, FileImage, FileKey, FileLock, FileSpreadsheet, FileTerminal, FileText, FileVideo, Folder, FolderOpen, type LucideIcon } from "lucide-react";
import type { ChangeStatus } from "@shared/types";
import { cn } from "@/lib/utils";

type Kind = [LucideIcon, string];

const code = (tone: string): Kind => [FileCode, tone];

const byExtension: Record<string, Kind> = {
  ts: code("text-blue-600 dark:text-blue-400"),
  tsx: code("text-blue-600 dark:text-blue-400"),
  mts: code("text-blue-600 dark:text-blue-400"),
  cts: code("text-blue-600 dark:text-blue-400"),
  js: code("text-yellow-600 dark:text-yellow-300"),
  jsx: code("text-yellow-600 dark:text-yellow-300"),
  mjs: code("text-yellow-600 dark:text-yellow-300"),
  cjs: code("text-yellow-600 dark:text-yellow-300"),
  json: [FileBraces, "text-amber-600 dark:text-amber-400"],
  jsonc: [FileBraces, "text-amber-600 dark:text-amber-400"],
  json5: [FileBraces, "text-amber-600 dark:text-amber-400"],
  css: code("text-sky-600 dark:text-sky-400"),
  scss: code("text-pink-600 dark:text-pink-400"),
  sass: code("text-pink-600 dark:text-pink-400"),
  less: code("text-indigo-600 dark:text-indigo-400"),
  html: code("text-orange-600 dark:text-orange-400"),
  htm: code("text-orange-600 dark:text-orange-400"),
  vue: code("text-emerald-600 dark:text-emerald-400"),
  svelte: code("text-orange-600 dark:text-orange-400"),
  astro: code("text-orange-600 dark:text-orange-400"),
  py: code("text-sky-700 dark:text-sky-300"),
  rb: code("text-red-600 dark:text-red-400"),
  go: code("text-cyan-600 dark:text-cyan-400"),
  rs: code("text-orange-700 dark:text-orange-400"),
  java: code("text-red-600 dark:text-red-400"),
  kt: code("text-violet-600 dark:text-violet-400"),
  swift: code("text-orange-600 dark:text-orange-400"),
  c: code("text-blue-700 dark:text-blue-300"),
  h: code("text-violet-600 dark:text-violet-400"),
  cpp: code("text-blue-700 dark:text-blue-300"),
  hpp: code("text-violet-600 dark:text-violet-400"),
  cs: code("text-green-700 dark:text-green-400"),
  php: code("text-indigo-600 dark:text-indigo-400"),
  sql: code("text-pink-600 dark:text-pink-400"),
  graphql: code("text-pink-600 dark:text-pink-400"),
  prisma: code("text-teal-600 dark:text-teal-400"),
  sh: [FileTerminal, "text-green-700 dark:text-green-400"],
  bash: [FileTerminal, "text-green-700 dark:text-green-400"],
  zsh: [FileTerminal, "text-green-700 dark:text-green-400"],
  fish: [FileTerminal, "text-green-700 dark:text-green-400"],
  md: [FileText, "text-sky-600 dark:text-sky-400"],
  mdx: [FileText, "text-sky-600 dark:text-sky-400"],
  txt: [FileText, "text-mute"],
  yml: [FileCog, "text-rose-600 dark:text-rose-400"],
  yaml: [FileCog, "text-rose-600 dark:text-rose-400"],
  toml: [FileCog, "text-mute"],
  ini: [FileCog, "text-mute"],
  conf: [FileCog, "text-mute"],
  xml: code("text-orange-600 dark:text-orange-400"),
  plist: [FileCog, "text-mute"],
  lock: [FileLock, "text-mute"],
  png: [FileImage, "text-violet-600 dark:text-violet-400"],
  jpg: [FileImage, "text-violet-600 dark:text-violet-400"],
  jpeg: [FileImage, "text-violet-600 dark:text-violet-400"],
  gif: [FileImage, "text-violet-600 dark:text-violet-400"],
  webp: [FileImage, "text-violet-600 dark:text-violet-400"],
  ico: [FileImage, "text-violet-600 dark:text-violet-400"],
  icns: [FileImage, "text-violet-600 dark:text-violet-400"],
  svg: [FileImage, "text-amber-600 dark:text-amber-400"],
  mp4: [FileVideo, "text-rose-600 dark:text-rose-400"],
  mov: [FileVideo, "text-rose-600 dark:text-rose-400"],
  webm: [FileVideo, "text-rose-600 dark:text-rose-400"],
  mp3: [FileAudio, "text-rose-600 dark:text-rose-400"],
  wav: [FileAudio, "text-rose-600 dark:text-rose-400"],
  zip: [FileArchive, "text-mute"],
  gz: [FileArchive, "text-mute"],
  tar: [FileArchive, "text-mute"],
  dmg: [FileArchive, "text-mute"],
  csv: [FileSpreadsheet, "text-green-700 dark:text-green-400"],
  xlsx: [FileSpreadsheet, "text-green-700 dark:text-green-400"],
  pdf: [FileText, "text-red-600 dark:text-red-400"],
  pem: [FileKey, "text-yellow-600 dark:text-yellow-300"],
  key: [FileKey, "text-yellow-600 dark:text-yellow-300"],
};

const byName: Record<string, Kind> = {
  dockerfile: [FileCog, "text-sky-600 dark:text-sky-400"],
  makefile: [FileCog, "text-orange-600 dark:text-orange-400"],
  ".gitignore": [FileCog, "text-orange-600 dark:text-orange-400"],
  ".gitattributes": [FileCog, "text-orange-600 dark:text-orange-400"],
  ".npmrc": [FileCog, "text-red-600 dark:text-red-400"],
  ".editorconfig": [FileCog, "text-mute"],
  ".nvmrc": [FileCog, "text-green-700 dark:text-green-400"],
  "package.json": [FileBraces, "text-green-700 dark:text-green-400"],
  "package-lock.json": [FileLock, "text-mute"],
  "license": [FileText, "text-yellow-600 dark:text-yellow-300"],
};

function kindFor(path: string): Kind {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (byName[name]) return byName[name];
  if (name.startsWith(".env")) return [FileKey, "text-yellow-600 dark:text-yellow-300"];
  if (name.startsWith("tsconfig") && name.endsWith(".json")) return [FileCog, "text-blue-600 dark:text-blue-400"];
  if (/\.config\.[cm]?[jt]s$/.test(name)) return [FileCog, "text-mute"];
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  return byExtension[ext] ?? [File, "text-mute"];
}

export function FileIcon({ path, className }: { path: string; className?: string }) {
  const [Icon, tone] = kindFor(path);
  return <Icon aria-hidden className={cn("size-3.5 shrink-0", tone, className)} />;
}

export function FolderIcon({ open, className }: { open: boolean; className?: string }) {
  const Icon = open ? FolderOpen : Folder;
  return <Icon aria-hidden className={cn("size-3.5 shrink-0 text-mute", className)} />;
}

const changes: Record<ChangeStatus, { letter: string; tone: string; label: string }> = {
  added: { letter: "A", tone: "text-plus", label: "Added" },
  untracked: { letter: "U", tone: "text-plus", label: "Untracked" },
  modified: { letter: "M", tone: "text-modified", label: "Modified" },
  deleted: { letter: "D", tone: "text-minus", label: "Deleted" },
};

export const changeTone = (status: ChangeStatus | undefined) => (status ? changes[status].tone : "");

export function ChangeLetter({ status, className }: { status: ChangeStatus | undefined; className?: string }) {
  if (!status) return null;
  const { letter, tone, label } = changes[status];
  return (
    <span title={label} aria-label={label} className={cn("w-3 shrink-0 text-center font-mono text-[11px] font-semibold", tone, className)}>
      {letter}
    </span>
  );
}
