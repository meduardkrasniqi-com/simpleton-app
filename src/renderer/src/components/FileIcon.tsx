import { File, FileArchive, FileAudio, FileBraces, FileCode, FileCog, FileImage, FileKey, FileLock, FileSpreadsheet, FileTerminal, FileText, FileVideo, Folder, FolderOpen, SquareDot, SquareMinus, SquarePlus, type LucideIcon } from "lucide-react";
import type { ChangeStatus } from "@shared/types";
import { cn } from "@/lib/utils";

const byExtension: Record<string, LucideIcon> = {
  ts: FileCode,
  tsx: FileCode,
  mts: FileCode,
  cts: FileCode,
  js: FileCode,
  jsx: FileCode,
  mjs: FileCode,
  cjs: FileCode,
  json: FileBraces,
  jsonc: FileBraces,
  json5: FileBraces,
  css: FileCode,
  scss: FileCode,
  sass: FileCode,
  less: FileCode,
  html: FileCode,
  htm: FileCode,
  vue: FileCode,
  svelte: FileCode,
  astro: FileCode,
  py: FileCode,
  rb: FileCode,
  go: FileCode,
  rs: FileCode,
  java: FileCode,
  kt: FileCode,
  swift: FileCode,
  c: FileCode,
  h: FileCode,
  cpp: FileCode,
  hpp: FileCode,
  cs: FileCode,
  php: FileCode,
  sql: FileCode,
  graphql: FileCode,
  prisma: FileCode,
  sh: FileTerminal,
  bash: FileTerminal,
  zsh: FileTerminal,
  fish: FileTerminal,
  md: FileText,
  mdx: FileText,
  txt: FileText,
  yml: FileCog,
  yaml: FileCog,
  toml: FileCog,
  ini: FileCog,
  conf: FileCog,
  xml: FileCode,
  plist: FileCog,
  lock: FileLock,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  webp: FileImage,
  ico: FileImage,
  icns: FileImage,
  svg: FileImage,
  mp4: FileVideo,
  mov: FileVideo,
  webm: FileVideo,
  mp3: FileAudio,
  wav: FileAudio,
  zip: FileArchive,
  gz: FileArchive,
  tar: FileArchive,
  dmg: FileArchive,
  csv: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  pdf: FileText,
  pem: FileKey,
  key: FileKey,
};

const byName: Record<string, LucideIcon> = {
  dockerfile: FileCog,
  makefile: FileCog,
  ".gitignore": FileCog,
  ".gitattributes": FileCog,
  ".npmrc": FileCog,
  ".editorconfig": FileCog,
  ".nvmrc": FileCog,
  "package.json": FileBraces,
  "package-lock.json": FileLock,
  "license": FileText,
};

function iconFor(path: string): LucideIcon {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (byName[name]) return byName[name];
  if (name.startsWith(".env")) return FileKey;
  if (name.startsWith("tsconfig") && name.endsWith(".json")) return FileCog;
  if (/\.config\.[cm]?[jt]s$/.test(name)) return FileCog;
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  return byExtension[ext] ?? File;
}

export function FileIcon({ path, className }: { path: string; className?: string }) {
  const Icon = iconFor(path);
  return <Icon aria-hidden className={cn("size-3.5 shrink-0 text-mute", className)} />;
}

export function FolderIcon({ open, className }: { open: boolean; className?: string }) {
  const Icon = open ? FolderOpen : Folder;
  return <Icon aria-hidden className={cn("size-3.5 shrink-0 text-mute", className)} />;
}

const changes: Record<ChangeStatus, { icon: LucideIcon; label: string }> = {
  added: { icon: SquarePlus, label: "Added" },
  untracked: { icon: SquarePlus, label: "Untracked" },
  modified: { icon: SquareDot, label: "Modified" },
  deleted: { icon: SquareMinus, label: "Deleted" },
};

export function ChangeIcon({ status, className }: { status: ChangeStatus | undefined; className?: string }) {
  if (!status) return null;
  const { icon: Icon, label } = changes[status];
  return (
    <span title={label} aria-label={label} className={cn("grid shrink-0 place-items-center text-mute", className)}>
      <Icon aria-hidden className="size-3.5" />
    </span>
  );
}
