import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
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

export type Picture = { path: string; alt?: string };

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const arrow = "grid size-9 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white";

function Viewer({ items, index, onIndex, onClose }: { items: Picture[]; index: number; onIndex: (index: number) => void; onClose: () => void }) {
  const item = items[index];
  const many = items.length > 1;
  const step = (by: number) => onIndex((index + by + items.length) % items.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (many && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.stopPropagation();
        e.preventDefault();
        onIndex((index + (e.key === "ArrowLeft" ? -1 : 1) + items.length) % items.length);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, onIndex, index, many, items.length]);

  if (!item) return null;

  return createPortal(
    <div className="no-drag fixed inset-0 z-50 flex animate-fade flex-col bg-black/75 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-12 shrink-0 items-center gap-2 pl-24 pr-3 text-white/80">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px]" title={item.path}>
          {item.path}
        </span>
        {many && (
          <span className="shrink-0 px-1 text-[12px] tabular-nums text-white/60">
            {index + 1} / {items.length}
          </span>
        )}
        <button type="button" onClick={() => window.simpleton.openImage(item.path)} aria-label="Open in Preview" title="Open in Preview" className="grid size-7 place-items-center rounded-md hover:bg-white/10 hover:text-white">
          <ExternalLink className="size-4" />
        </button>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-md hover:bg-white/10 hover:text-white">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-4 px-6 pb-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {many && (
          <button type="button" onClick={() => step(-1)} aria-label="Previous image" className={arrow}>
            <ChevronLeft className="size-5" />
          </button>
        )}
        <img key={item.path} src={url(item.path)} alt={item.alt || nameOf(item.path)} className="min-w-0 max-h-full max-w-full flex-1 animate-pop rounded-lg object-contain shadow-[0_24px_64px_rgba(0,0,0,0.5)]" />
        {many && (
          <button type="button" onClick={() => step(1)} aria-label="Next image" className={arrow}>
            <ChevronRight className="size-5" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

const slideArrow = "absolute top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-ink/[0.08] bg-raised/90 text-soft opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.12)] backdrop-blur transition-opacity hover:text-ink group-hover/gallery:opacity-100 focus-visible:opacity-100";

export function Gallery({ items }: { items: Picture[] }) {
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const shown = items.filter((item) => !missing.has(item.path));
  if (!shown.length) return null;
  const current = Math.min(index, shown.length - 1);
  const item = shown[current];
  const many = shown.length > 1;
  const step = (by: number) => setIndex((current + by + shown.length) % shown.length);
  const lost = (path: string) => setMissing((m) => new Set(m).add(path));

  return (
    <div className="mt-3 first:mt-0">
      <div className="group/gallery relative">
        <button type="button" onClick={() => setOpen(true)} title={item.path} className="block h-80 w-full overflow-hidden rounded-lg border border-line bg-panel transition-[border-color] hover:border-ink/20">
          <img key={item.path} src={url(item.path)} alt={item.alt || nameOf(item.path)} onError={() => lost(item.path)} className="size-full animate-fade object-contain" />
        </button>
        {many && (
          <>
            <button type="button" onClick={() => step(-1)} aria-label="Previous image" className={cn(slideArrow, "left-2.5")}>
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" onClick={() => step(1)} aria-label="Next image" className={cn(slideArrow, "right-2.5")}>
              <ChevronRight className="size-4" />
            </button>
            <span className="pointer-events-none absolute right-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11.5px] font-medium tabular-nums text-white">
              {current + 1} / {shown.length}
            </span>
          </>
        )}
      </div>
      {(item.alt || many) && (
        <div className="mt-2 flex items-center gap-3">
          {many && (
            <div className="flex shrink-0 gap-1.5">
              {shown.map((picture, i) => (
                <button
                  key={picture.path}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Show image ${i + 1}`}
                  aria-current={i === current}
                  title={picture.alt || nameOf(picture.path)}
                  className={cn("h-10 w-14 overflow-hidden rounded-md border bg-panel transition-[opacity,border-color]", i === current ? "border-ink/50" : "border-line opacity-60 hover:opacity-100")}
                >
                  <img src={url(picture.path)} alt="" onError={() => lost(picture.path)} className="size-full object-cover object-top" />
                </button>
              ))}
            </div>
          )}
          {item.alt && <span className="min-w-0 truncate text-[12.5px] text-mute">{item.alt}</span>}
        </div>
      )}
      {open && <Viewer items={shown} index={current} onIndex={setIndex} onClose={() => setOpen(false)} />}
    </div>
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
      {open && <Viewer items={[{ path, alt: alt || name }]} index={0} onIndex={() => undefined} onClose={() => setOpen(false)} />}
    </>
  );
}

const mentioned = /(?:^|[\s(`'"[])((?:\/|\.{0,2}\/)?[^\s`'"()<>[\]]+\.(?:png|jpe?g|gif|webp))(?=$|[\s)`'".,;:!?\]])/gim;
const embedded = /!\[([^\]]*)\]\(\s*<?([^)>\s]+)>?(?:\s+"[^"]*")?\s*\)/g;

export function embeddedImages(text: string, root: string | undefined): Picture[] {
  const seen = new Set<string>();
  const found: Picture[] = [];
  for (const m of text.matchAll(embedded)) {
    const path = imagePath(m[2], root);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    found.push({ path, alt: m[1].trim() || undefined });
  }
  return found;
}

export function mentionedImages(text: string, root: string | undefined) {
  const skip = new Set([...text.matchAll(embedded)].map((m) => imagePath(m[2], root)));
  const found = new Set<string>();
  for (const m of text.matchAll(mentioned)) {
    if (/^https?:/i.test(m[1])) continue;
    const path = imagePath(m[1], root);
    if (path && !skip.has(path)) found.add(path);
  }
  return [...found].slice(0, 12);
}
