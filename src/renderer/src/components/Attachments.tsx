import { Paperclip, X } from "lucide-react";
import { useCallback, useState } from "react";
import { Annotator } from "@/components/Annotator";
import { FileIcon } from "@/components/FileIcon";
import { isImagePath } from "@/components/Shot";
import { ghost } from "@/components/ui";
import { cn } from "@/lib/utils";

const pathLine = /^\/[^\s/]+\/.+$/;

export const withAttachments = (text: string, paths: string[]) => (paths.length ? [text.trim(), paths.join("\n")].filter(Boolean).join("\n\n") : text);

export function splitAttachments(text: string) {
  const lines = text.split("\n");
  let i = lines.length;
  while (i > 0 && pathLine.test(lines[i - 1])) i--;
  if (i === lines.length || (i > 0 && lines[i - 1].trim() !== "")) return { text, paths: [] as string[] };
  return { text: lines.slice(0, i).join("\n").trimEnd(), paths: lines.slice(i) };
}

const url = (path: string) => `simpleton-image://local${path.split("/").map(encodeURIComponent).join("/")}`;

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");

async function toPath(file: File) {
  const path = window.simpleton.pathForFile(file);
  if (path) return path;
  const name = !file.name || file.name === "image.png" ? `screenshot-${stamp()}.${file.type.split("/")[1] || "png"}` : file.name;
  return window.simpleton.saveAttachment(name, new Uint8Array(await file.arrayBuffer()));
}

export function useAttachments() {
  const [paths, setPaths] = useState<string[]>([]);
  const add = useCallback((next: string[]) => setPaths((current) => [...current, ...next.filter((p) => !current.includes(p))]), []);
  const addFiles = useCallback(async (files: File[]) => add(await Promise.all(files.map(toPath))), [add]);
  const pick = useCallback(async () => add(await window.simpleton.pickAttachments()), [add]);
  const remove = useCallback((path: string) => setPaths((current) => current.filter((p) => p !== path)), []);
  const clear = useCallback(() => setPaths([]), []);
  return { paths, add, addFiles, pick, remove, clear };
}

export type AttachmentState = ReturnType<typeof useAttachments>;

export function AttachButton({ attachments }: { attachments: AttachmentState }) {
  return (
    <button type="button" onClick={attachments.pick} aria-label="Attach files" title="Attach files" className={cn(ghost, "size-7 shrink-0")}>
      <Paperclip className="size-4" />
    </button>
  );
}

function Tile({ path, onRemove }: { path: string; onRemove?: () => void }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const image = isImagePath(path) && !broken;
  const name = nameOf(path);
  return (
    <div className="group/tile relative animate-fade">
      {image ? (
        <button type="button" onClick={() => setOpen(true)} title={path} className="block size-14 overflow-hidden rounded-lg border border-ink/[0.1] bg-panel transition-[border-color] hover:border-ink/25">
          <img src={url(path)} alt={name} onError={() => setBroken(true)} className="size-full object-cover" />
        </button>
      ) : (
        <div title={path} className="flex h-14 max-w-52 items-center gap-2 rounded-lg border border-ink/[0.1] bg-panel px-3 text-[12.5px] text-soft">
          <FileIcon path={name} className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{name}</span>
        </div>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-ink/[0.1] bg-raised text-soft opacity-0 shadow-[0_1px_3px_rgba(0,0,0,0.12)] transition-opacity hover:text-ink group-hover/tile:opacity-100 focus-visible:opacity-100"
        >
          <X className="size-3" />
        </button>
      )}
      {open && <Annotator path={path} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function AttachmentList({ paths, onRemove, className }: { paths: string[]; onRemove?: (path: string) => void; className?: string }) {
  if (!paths.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {paths.map((path) => (
        <Tile key={path} path={path} onRemove={onRemove && (() => onRemove(path))} />
      ))}
    </div>
  );
}
