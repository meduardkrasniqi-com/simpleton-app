import { ExternalLink, FolderOpen } from "lucide-react";
import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Markdown } from "@/components/Markdown";
import { ghost, outline, primary, Stat } from "@/components/ui";
import { FileLinksContext, useFileLinks } from "@/lib/fileLinks";
import { languageFor, tokenize, tokenStyle, type Token } from "@/lib/highlight";
import { decorate, type LineMark } from "@/lib/lineDiff";
import { cn } from "@/lib/utils";

type Draft = { original: string; text: string };

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "binary" } | { kind: "large" } | { kind: "deleted" } | { kind: "error"; message: string };

type Highlighted = { lines: Token[][]; byText: Map<string, Token[]> };

type Media = "image" | "video" | "audio" | "pdf";

type Rendered = "markdown" | "svg";

type Mode = "preview" | "code";

type Info = { size: number; modified: number };

const drafts = new Map<string, Draft>();

const modes = new Map<string, Mode>();

const mediaTypes: Record<string, Media> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  bmp: "image",
  ico: "image",
  mp4: "video",
  m4v: "video",
  mov: "video",
  webm: "video",
  ogv: "video",
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  oga: "audio",
  m4a: "audio",
  aac: "audio",
  flac: "audio",
  opus: "audio",
  pdf: "pdf",
};

const renderedTypes: Record<string, Rendered> = { md: "markdown", markdown: "markdown", mdx: "markdown", svg: "svg" };

const extensionOf = (path: string) => {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

const fileUrl = (workspaceId: string, path: string, modified: number) => `simpleton-file://workspace/${encodeURIComponent(workspaceId)}/${path.split("/").map(encodeURIComponent).join("/")}?v=${Math.round(modified)}`;

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
};

const revealLabel = window.simpleton.platform === "darwin" ? "Reveal in Finder" : "Show in folder";

const checkerboard = { background: "repeating-conic-gradient(color-mix(in oklab, var(--color-ink) 7%, transparent) 0 25%, transparent 0 50%) 0 0 / 16px 16px" };

const normalize = (path: string) =>
  path
    .split("/")
    .reduce<string[]>((parts, part) => (part === ".." ? parts.slice(0, -1) : part === "." || !part ? parts : [...parts, part]), [])
    .join("/");

const lineHeight = 20;

const message = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e));

const plainText = (tokens: Token[]) => tokens.map((t) => t.content).join("");

const markTint: Record<LineMark, string> = {
  add: "bg-plus/[0.07]",
  mod: "bg-edited/[0.08]",
};

const markBar: Record<LineMark, string> = {
  add: "bg-plus",
  mod: "bg-edited",
};

const Line = memo(function Line({ text, tokens, mark }: { text: string; tokens: Token[] | null; mark?: LineMark }) {
  return (
    <div className={cn("h-5 pl-3", mark && markTint[mark])}>
      {tokens
        ? tokens.map((token, k) => (
            <span key={k} className="tk" style={tokenStyle(token)}>
              {token.content}
            </span>
          ))
        : text}
    </div>
  );
});

const Gutter = memo(function Gutter({ n, mark, removedAbove, removedBelow, active }: { n: number; mark?: LineMark; removedAbove: boolean; removedBelow: boolean; active: boolean }) {
  const triangle = "absolute right-[3px] size-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-minus";
  return (
    <div className={cn("relative h-5 pr-5 text-right", active ? "text-ink/70" : "text-ink/25")}>
      {n}
      {mark && <span className={cn("absolute inset-y-0 right-[5px] w-[3px]", markBar[mark])} />}
      {removedAbove && <span className={cn(triangle, "-top-[4px]")} />}
      {removedBelow && <span className={cn(triangle, "-bottom-[4px]")} />}
    </div>
  );
});

function useHighlight(text: string | null, path: string) {
  const language = useMemo(() => languageFor(path), [path]);
  const [highlighted, setHighlighted] = useState<Highlighted | null>(null);
  const warm = useRef(false);

  useEffect(() => {
    if (text === null || !language) return;
    let alive = true;
    const timer = setTimeout(
      () =>
        tokenize(text, language).then((lines) => {
          if (!alive || !lines) return;
          const byText = new Map<string, Token[]>();
          for (const line of lines) {
            const key = plainText(line);
            if (!byText.has(key)) byText.set(key, line);
          }
          warm.current = true;
          setHighlighted({ lines, byText });
        }),
      warm.current ? 60 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [text, language]);

  return (line: string, i: number) => {
    if (!highlighted) return null;
    const bare = line.endsWith("\r") ? line.slice(0, -1) : line;
    const exact = highlighted.lines[i];
    if (exact && plainText(exact) === bare) return exact;
    return highlighted.byText.get(bare) ?? null;
  };
}

function lineAt(text: string, offset: number) {
  let n = 0;
  for (let i = text.indexOf("\n"); i !== -1 && i < offset; i = text.indexOf("\n", i + 1)) n++;
  return n;
}

function Header({ path, children }: { path: string; children?: ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line px-5">
      <p className="selectable min-w-0 flex-1 truncate font-mono text-[12px] text-soft">{path}</p>
      {children}
    </div>
  );
}

function FileActions({ workspaceId, path }: { workspaceId: string; path: string }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button type="button" onClick={() => window.simpleton.openFile(workspaceId, path).catch(() => undefined)} aria-label="Open with default app" title="Open with default app" className={cn(ghost, "size-6")}>
        <ExternalLink className="size-3.5" />
      </button>
      <button type="button" onClick={() => window.simpleton.revealFile(workspaceId, path)} aria-label={revealLabel} title={revealLabel} className={cn(ghost, "size-6")}>
        <FolderOpen className="size-3.5" />
      </button>
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div role="tablist" className="flex shrink-0 items-center gap-0.5">
      {(["preview", "code"] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          aria-selected={mode === option}
          onClick={() => onChange(option)}
          className={cn("h-6 rounded-md px-2 text-[12px] font-medium", mode === option ? "bg-ink/[0.06] text-ink" : "text-mute hover:text-ink")}
        >
          {option === "preview" ? "Preview" : "Code"}
        </button>
      ))}
    </div>
  );
}

function useInfo(workspaceId: string, path: string, version: number) {
  const [info, setInfo] = useState<Info | "missing" | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      window.simpleton.fileInfo(workspaceId, path).then(
        (next) => alive && setInfo((current) => (current && current !== "missing" && current.modified === next.modified && current.size === next.size ? current : next)),
        () => alive && setInfo("missing"),
      );
    load();
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.removeEventListener("focus", load);
    };
  }, [workspaceId, path, version]);
  return info;
}

function ImageView({ src, onSize }: { src: string; onSize: (size: string) => void }) {
  const [actual, setActual] = useState(false);
  const [zoomable, setZoomable] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  const measure = () => {
    const el = image.current;
    if (el) setZoomable(el.naturalWidth > el.clientWidth + 1 || el.naturalHeight > el.clientHeight + 1);
  };
  return (
    <div className="flex min-h-0 flex-1 overflow-auto p-6">
      <img
        ref={image}
        src={src}
        alt=""
        onLoad={(e) => {
          onSize(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`);
          measure();
        }}
        onMouseEnter={measure}
        onClick={() => (actual || zoomable) && setActual(!actual)}
        style={checkerboard}
        className={cn("m-auto shrink-0 select-none", actual ? "max-w-none cursor-zoom-out" : "max-h-full min-h-0 min-w-0 max-w-full object-contain", !actual && zoomable && "cursor-zoom-in")}
      />
    </div>
  );
}

function MediaViewer({ workspaceId, path, version, media }: { workspaceId: string; path: string; version: number; media: Media }) {
  const info = useInfo(workspaceId, path, version);
  const [dimensions, setDimensions] = useState<string | null>(null);
  const src = info && info !== "missing" ? fileUrl(workspaceId, path, info.modified) : null;
  return (
    <div className="flex h-full flex-col">
      <Header path={path}>
        {dimensions && <span className="shrink-0 font-mono text-[12px] tabular-nums text-mute">{dimensions}</span>}
        {info && info !== "missing" && <span className="shrink-0 font-mono text-[12px] tabular-nums text-mute">{formatSize(info.size)}</span>}
        {src && <FileActions workspaceId={workspaceId} path={path} />}
      </Header>
      {info === "missing" && <p className="px-5 py-4 text-[13px] text-mute">This file was deleted</p>}
      {src && media === "image" && <ImageView key={src} src={src} onSize={setDimensions} />}
      {src && media === "video" && (
        <div className="flex min-h-0 flex-1 bg-black/[0.04] p-6">
          <video key={src} src={src} controls className="m-auto max-h-full max-w-full rounded-md bg-black" />
        </div>
      )}
      {src && media === "audio" && (
        <div className="flex min-h-0 flex-1 p-6">
          <audio key={src} src={src} controls className="m-auto w-full max-w-[520px]" />
        </div>
      )}
      {src && media === "pdf" && <iframe key={src} src={src} title={path} className="min-h-0 w-full flex-1 border-0" />}
    </div>
  );
}

function BinaryView({ workspaceId, path, label }: { workspaceId: string; path: string; label: string }) {
  const info = useInfo(workspaceId, path, 0);
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-6">
      <div className="flex flex-col items-center gap-4">
        <p className="text-[13px] text-mute">{label}{info && info !== "missing" ? ` · ${formatSize(info.size)}` : ""}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.simpleton.openFile(workspaceId, path).catch(() => undefined)} className={cn(outline, "h-8 px-3 text-[12.5px]")}>
            Open with default app
          </button>
          <button type="button" onClick={() => window.simpleton.revealFile(workspaceId, path)} className={cn(outline, "h-8 px-3 text-[12.5px]")}>
            {revealLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function MarkdownPreview({ text, path }: { text: string; path: string }) {
  const links = useFileLinks();
  const deferred = useDeferredValue(text);
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const scoped = useMemo(
    () =>
      links && {
        ...links,
        root: links.root && dir ? `${links.root.replace(/\/$/, "")}/${dir}` : links.root,
        resolve: (target: string) => (dir && !target.trim().startsWith("/") ? links.resolve(normalize(`${dir}/${target.trim()}`)) : null) ?? links.resolve(target),
      },
    [links, dir],
  );
  return (
    <div className="min-h-0 flex-1 overflow-auto px-8 py-8">
      <div className="mx-auto max-w-[760px]">
        <FileLinksContext.Provider value={scoped}>
          <Markdown text={deferred} page />
        </FileLinksContext.Provider>
      </div>
    </div>
  );
}

function SvgPreview({ text }: { text: string }) {
  const src = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`, [text]);
  return (
    <div className="flex min-h-0 flex-1 overflow-auto p-6">
      <img src={src} alt="" style={checkerboard} className="m-auto max-h-full min-h-0 min-w-0 max-w-full object-contain" />
    </div>
  );
}

export function FileViewer({ workspaceId, path, version }: { workspaceId: string; path: string; version: number }) {
  const media = mediaTypes[extensionOf(path)];
  if (media) return <MediaViewer workspaceId={workspaceId} path={path} version={version} media={media} />;
  return <TextViewer workspaceId={workspaceId} path={path} version={version} />;
}

function TextViewer({ workspaceId, path, version }: { workspaceId: string; path: string; version: number }) {
  const key = `${workspaceId}:${path}`;
  const rendered = renderedTypes[extensionOf(path)];
  const [mode, setModeState] = useState<Mode>(() => modes.get(key) ?? "preview");
  const setMode = (next: Mode) => {
    modes.set(key, next);
    setModeState(next);
  };
  const previewing = !!rendered && mode === "preview";
  const [doc, setDocState] = useState<Draft | null>(() => drafts.get(key) ?? null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const [base, setBase] = useState<string[] | null>(null);
  const [status, setStatus] = useState<Status>(() => (doc ? { kind: "ready" } : { kind: "loading" }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [active, setActive] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const positioned = useRef(false);

  const setDoc = (next: Draft) => {
    if (next.text !== next.original) drafts.set(key, next);
    else drafts.delete(key);
    docRef.current = next;
    setDocState(next);
  };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [view, read] = await Promise.all([
        window.simpleton.file(workspaceId, path).catch(() => null),
        window.simpleton.readText(workspaceId, path).then(
          (text) => ({ ok: true as const, text }),
          (e) => ({ ok: false as const, error: message(e) }),
        ),
      ]);
      if (!alive) return;
      setBase(view && !view.binary && !view.truncated && !view.lines.some((l) => l.kind === "gap") ? view.lines.filter((l) => l.kind !== "add").map((l) => l.text) : null);
      if (view?.binary) return setStatus({ kind: "binary" });
      if (!read.ok) {
        if (/Binary files/.test(read.error)) return setStatus({ kind: "binary" });
        if (/too large/.test(read.error)) return setStatus({ kind: "large" });
        const gone = /ENOENT/.test(read.error) || (!!view && view.lines.length > 0 && view.lines.every((l) => l.kind === "del"));
        return setStatus(gone ? { kind: "deleted" } : { kind: "error", message: read.error });
      }
      setStatus({ kind: "ready" });
      const current = docRef.current;
      if (current && current.text !== current.original) return;
      if (current?.text === read.text) return;
      setDoc({ original: read.text, text: read.text });
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.removeEventListener("focus", load);
    };
  }, [workspaceId, path, version, reload]);

  const text = doc?.text ?? null;
  const lines = useMemo(() => (text === null ? [] : text.split("\n")), [text]);
  const deferredLines = useDeferredValue(lines);
  const decorations = useMemo(() => (base ? decorate(base, deferredLines) : null), [base, deferredLines]);
  const tokensFor = useHighlight(text, path);
  const dirty = !!doc && doc.text !== doc.original;

  useLayoutEffect(() => {
    if (positioned.current || status.kind !== "ready" || !doc || !scroller.current) return;
    if (base && !decorations) return;
    positioned.current = true;
    input.current?.focus({ preventScroll: true });
    input.current?.setSelectionRange(0, 0);
    if (!decorations) return;
    const first = decorations.marks.findIndex(Boolean);
    const removal = decorations.removals.size ? Math.min(...decorations.removals) : -1;
    const target = [first, removal].filter((i) => i >= 0);
    if (target.length && decorations.marks.length > decorations.added) scroller.current.scrollTop = Math.max(Math.min(...target) * lineHeight - 120, 0);
  }, [status, doc, base, decorations]);

  const save = async () => {
    const current = docRef.current;
    if (!current || saving || current.text === current.original) return;
    const text = current.text;
    setSaving(true);
    setSaveError(null);
    try {
      const disk = await window.simpleton.readText(workspaceId, path).catch(() => current.original);
      if (disk !== current.original && disk !== text && !confirm("This file changed on disk since you started editing. Overwrite it?")) return;
      await window.simpleton.writeText(workspaceId, path, text);
      setDoc({ original: text, text: docRef.current?.text ?? text });
      setReload((n) => n + 1);
    } catch (e) {
      setSaveError(message(e));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (!doc || !dirty || !confirm("Discard your changes to this file?")) return;
    setDoc({ original: doc.original, text: doc.original });
  };

  const track = (el: HTMLTextAreaElement) => {
    const line = lineAt(el.value, el.selectionStart);
    if (line !== active) setActive(line);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
    } else if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      document.execCommand("insertText", false, "  ");
    } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.nativeEvent.isComposing) {
      const start = el.selectionStart;
      const lineStart = el.value.lastIndexOf("\n", start - 1) + 1;
      const indent = /^[ \t]*/.exec(el.value.slice(lineStart, start))![0];
      const opener = /[{[(]$/.test(el.value.slice(lineStart, start).trimEnd());
      if (!indent && !opener) return;
      e.preventDefault();
      document.execCommand("insertText", false, "\n" + indent + (opener ? (indent.includes("\t") ? "\t" : "  ") : ""));
    }
  };

  const digits = Math.max(String(lines.length).length, 2);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line px-5">
        <p className="selectable flex min-w-0 flex-1 items-center gap-2 font-mono text-[12px] text-soft">
          <span className="truncate">{path}</span>
          {dirty && <span aria-label="Unsaved changes" title="Unsaved changes" className="size-[7px] shrink-0 rounded-full bg-busy" />}
        </p>
        {rendered && status.kind === "ready" && <ModeToggle mode={mode} onChange={setMode} />}
        {decorations && (decorations.added > 0 || decorations.removed > 0) && <Stat added={decorations.added} removed={decorations.removed} />}
        {dirty && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={discard} className={cn(ghost, "h-6 px-2 text-[12px]")}>
              Discard
            </button>
            <button type="button" onClick={save} disabled={saving} title="Save  ⌘S" className={cn(primary, "h-6 px-2.5 text-[12px]")}>
              Save
            </button>
          </div>
        )}
      </div>
      {saveError && <p className="shrink-0 border-b border-line bg-minus/[0.06] px-5 py-2 text-[12.5px] text-minus">{saveError}</p>}
      {status.kind === "error" && <p className="px-5 py-4 text-[13px] text-minus">{status.message}</p>}
      {status.kind === "binary" && <BinaryView workspaceId={workspaceId} path={path} label="Binary file" />}
      {status.kind === "large" && <BinaryView workspaceId={workspaceId} path={path} label="Too large to show here" />}
      {status.kind === "deleted" && <p className="px-5 py-4 text-[13px] text-mute">This file was deleted</p>}
      {status.kind === "ready" && doc && previewing && (rendered === "markdown" ? <MarkdownPreview text={doc.text} path={path} /> : <SvgPreview text={doc.text} />)}
      {status.kind === "ready" && doc && !previewing && (
        <div ref={scroller} className="min-h-0 flex-1 overflow-auto font-mono text-[12px] leading-[20px] [tab-size:4]">
          <div className="flex min-h-full w-max min-w-full">
            <div aria-hidden className="sticky left-0 z-10 shrink-0 select-none bg-surface pb-10 pt-2" style={{ width: `calc(${digits}ch + 32px)` }}>
              {lines.map((_, i) => (
                <Gutter
                  key={i}
                  n={i + 1}
                  mark={decorations?.marks[i]}
                  removedAbove={!!decorations?.removals.has(i)}
                  removedBelow={i === lines.length - 1 && !!decorations?.removals.has(lines.length)}
                  active={i === active}
                />
              ))}
            </div>
            <div className="relative min-w-0 flex-1">
              <div aria-hidden className="pointer-events-none whitespace-pre pb-10 pr-10 pt-2 text-ink">
                {lines.map((line, i) => (
                  <Line key={i} text={line} tokens={tokensFor(line, i)} mark={decorations?.marks[i]} />
                ))}
              </div>
              <textarea
                ref={input}
                value={doc.text}
                onChange={(e) => {
                  setDoc({ original: doc.original, text: e.target.value });
                  track(e.target);
                }}
                onKeyDown={onKeyDown}
                onSelect={(e) => track(e.currentTarget)}
                onScroll={(e) => {
                  e.currentTarget.scrollTop = 0;
                  e.currentTarget.scrollLeft = 0;
                }}
                wrap="off"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-label={`Edit ${path}`}
                className="selectable absolute inset-0 size-full resize-none overflow-hidden whitespace-pre bg-transparent pb-10 pl-3 pr-6 pt-2 text-transparent caret-ink outline-none selection:bg-edited/25 selection:text-transparent"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
