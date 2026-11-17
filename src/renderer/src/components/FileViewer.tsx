import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ghost, primary, Stat } from "@/components/ui";
import { languageFor, tokenize, tokenStyle, type Token } from "@/lib/highlight";
import { decorate, type LineMark } from "@/lib/lineDiff";
import { cn } from "@/lib/utils";

type Draft = { original: string; text: string };

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "binary" } | { kind: "deleted" } | { kind: "error"; message: string };

type Highlighted = { lines: Token[][]; byText: Map<string, Token[]> };

const drafts = new Map<string, Draft>();

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

export function FileViewer({ workspaceId, path, version }: { workspaceId: string; path: string; version: number }) {
  const key = `${workspaceId}:${path}`;
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
      {status.kind === "binary" && <p className="px-5 py-4 text-[13px] text-mute">Binary file</p>}
      {status.kind === "deleted" && <p className="px-5 py-4 text-[13px] text-mute">This file was deleted</p>}
      {status.kind === "ready" && doc && (
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
