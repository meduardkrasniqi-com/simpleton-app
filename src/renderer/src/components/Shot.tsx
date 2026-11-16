import { ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const imagePattern = /\.(png|jpe?g|gif|webp|svg)$/i;

export const isImagePath = (path: string) => imagePattern.test(path);

export function imagePath(src: string, root: string | undefined) {
  const clean = decodeURIComponent(src.trim().replace(/^file:\/\//, "").replace(/^<|>$/g, ""));
  if (!isImagePath(clean) || /^[a-z][a-z0-9+.-]*:/i.test(clean)) return null;
  if (clean.startsWith("/")) return clean;
  if (!root) return null;
  return `${root.replace(/\/$/, "")}/${clean.replace(/^\.\//, "")}`;
}

const url = (path: string) => `simpleton-image://local${path.split("/").map(encodeURIComponent).join("/")}`;

function Viewer({ path, alt, onClose }: { path: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="no-drag fixed inset-0 z-50 flex animate-fade flex-col bg-black/75 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-12 shrink-0 items-center gap-2 pl-24 pr-3 text-white/80">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px]" title={path}>
          {path}
        </span>
        <button type="button" onClick={() => window.simpleton.openImage(path)} aria-label="Open in Preview" title="Open in Preview" className="grid size-7 place-items-center rounded-md hover:bg-white/10 hover:text-white">
          <ExternalLink className="size-4" />
        </button>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-md hover:bg-white/10 hover:text-white">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-8 pb-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <img src={url(path)} alt={alt} className="max-h-full max-w-full animate-pop rounded-lg object-contain shadow-[0_24px_64px_rgba(0,0,0,0.5)]" />
      </div>
    </div>,
    document.body,
  );
}

export function Shot({ path, alt, className, quiet }: { path: string; alt?: string; className?: string; quiet?: boolean }) {
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const [open, setOpen] = useState(false);
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (state === "missing") return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={path}
        className={cn("group/shot relative inline-block max-w-full overflow-hidden rounded-lg border border-line bg-panel align-top transition-[border-color,box-shadow] hover:border-ink/20 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]", state === "loading" && (quiet ? "hidden" : "h-40 w-64 animate-pulse"), className)}
      >
        <img src={url(path)} alt={alt || name} onLoad={() => setState("ok")} onError={() => setState("missing")} className={cn("block max-h-72 max-w-full object-contain", state === "loading" && "invisible")} />
        {state === "ok" && <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/55 to-transparent px-2.5 pb-1.5 pt-5 text-left text-[11.5px] font-medium text-white opacity-0 transition-opacity group-hover/shot:opacity-100">{alt || name}</span>}
      </button>
      {open && <Viewer path={path} alt={alt || name} onClose={() => setOpen(false)} />}
    </>
  );
}

const mentioned = /(?:^|[\s(`'"[])((?:\/|\.{0,2}\/)?[^\s`'"()<>[\]]+\.(?:png|jpe?g|gif|webp))(?=$|[\s)`'".,;:!?\]])/gim;
const embedded = /!\[[^\]]*\]\(\s*<?([^)>\s]+)>?(?:\s+"[^"]*")?\s*\)/g;

export function mentionedImages(text: string, root: string | undefined) {
  const skip = new Set([...text.matchAll(embedded)].map((m) => imagePath(m[1], root)));
  const found = new Set<string>();
  for (const m of text.matchAll(mentioned)) {
    if (/^https?:/i.test(m[1])) continue;
    const path = imagePath(m[1], root);
    if (path && !skip.has(path)) found.add(path);
  }
  return [...found].slice(0, 12);
}
