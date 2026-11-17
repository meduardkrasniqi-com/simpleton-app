import { Pencil } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { FileView } from "@shared/types";
import { ghost, primary, Stat } from "@/components/ui";
import { languageFor, tokenize, tokenStyle, type Token } from "@/lib/highlight";
import { cn } from "@/lib/utils";

const rowStyles = {
  add: "bg-plus/[0.09]",
  del: "bg-minus/[0.08]",
  ctx: "",
  gap: "bg-panel",
};

const signs = { add: "+", del: "−", ctx: "", gap: "" };

async function highlight(view: FileView, path: string) {
  const language = languageFor(path);
  if (!language || view.binary) return null;
  const pick = (kinds: string[]) => view.lines.map((line, i) => ({ line, i })).filter(({ line }) => kinds.includes(line.kind));
  const after = pick(["ctx", "add"]);
  const before = pick(["ctx", "del"]);
  const [next, prev] = await Promise.all([tokenize(after.map(({ line }) => line.text).join("\n"), language), before.some(({ line }) => line.kind === "del") ? tokenize(before.map(({ line }) => line.text).join("\n"), language) : Promise.resolve([])]);
  if (!next) return null;
  const rows: (Token[] | null)[] = view.lines.map(() => null);
  after.forEach(({ i }, k) => (rows[i] = next[k] ?? null));
  before.forEach(({ line, i }, k) => {
    if (line.kind === "del") rows[i] = prev?.[k] ?? null;
  });
  return rows;
}

type Draft = { original: string; text: string };

const drafts = new Map<string, Draft>();

const message = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e));

function Editor({ value, onChange, onSave, onCancel }: { value: string; onChange: (text: string) => void; onSave: () => void; onCancel: () => void }) {
  const gutter = useRef<HTMLPreElement>(null);
  const count = value.split("\n").length;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      onSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      document.execCommand("insertText", false, "  ");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 font-mono text-[12px] leading-[20px]">
      <pre ref={gutter} aria-hidden className="w-12 shrink-0 select-none overflow-hidden pb-10 pr-3 text-right text-ink/25">
        {Array.from({ length: count }, (_, i) => i + 1).join("\n")}
      </pre>
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
        }}
        wrap="off"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label={`Edit file`}
        className="selectable min-h-0 flex-1 resize-none whitespace-pre bg-transparent pb-10 pl-4 pr-6 text-ink caret-ink outline-none"
      />
    </div>
  );
}

export function FileViewer({ workspaceId, path, version }: { workspaceId: string; path: string; version: number }) {
  const key = `${workspaceId}:${path}`;
  const [draft, setDraftState] = useState<Draft | null>(() => drafts.get(key) ?? null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const setDraft = (next: Draft | null) => {
    if (next) drafts.set(key, next);
    else drafts.delete(key);
    setDraftState(next);
  };
  const [view, setView] = useState<FileView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<(Token[] | null)[] | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      window.simpleton
        .file(workspaceId, path)
        .then((v) => {
          if (!alive) return;
          setView(v);
          setError(null);
        })
        .catch((e) => alive && setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e)));
    load();
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.removeEventListener("focus", load);
    };
  }, [workspaceId, path, version, reload]);

  const startEditing = async () => {
    setEditError(null);
    try {
      const text = await window.simpleton.readText(workspaceId, path);
      setDraft({ original: text, text });
    } catch (e) {
      setEditError(message(e));
    }
  };

  const cancel = () => {
    if (draft && draft.text !== draft.original && !confirm("Discard your changes to this file?")) return;
    setEditError(null);
    setDraft(null);
  };

  const save = async () => {
    if (!draft || saving || draft.text === draft.original) return;
    setSaving(true);
    setEditError(null);
    try {
      const current = await window.simpleton.readText(workspaceId, path).catch(() => draft.original);
      if (current !== draft.original && current !== draft.text && !confirm("This file changed on disk since you started editing. Overwrite it?")) return;
      await window.simpleton.writeText(workspaceId, path, draft.text);
      setDraft(null);
      positioned.current = false;
      setReload((n) => n + 1);
    } catch (e) {
      setEditError(message(e));
    } finally {
      setSaving(false);
    }
  };

  const dirty = !!draft && draft.text !== draft.original;

  useEffect(() => {
    if (!view) return;
    let alive = true;
    highlight(view, path).then((rows) => alive && setTokens(rows));
    return () => {
      alive = false;
    };
  }, [view, path]);

  useLayoutEffect(() => {
    if (!view || positioned.current || !scroller.current) return;
    positioned.current = true;
    const first = scroller.current.querySelector<HTMLElement>("[data-change]");
    if (first && view.lines.some((l) => l.kind === "ctx")) scroller.current.scrollTop = Math.max(first.offsetTop - 120, 0);
  }, [view]);

  const added = view?.lines.filter((l) => l.kind === "add").length ?? 0;
  const removed = view?.lines.filter((l) => l.kind === "del").length ?? 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line px-5">
        <p className="selectable flex min-w-0 flex-1 items-center gap-2 font-mono text-[12px] text-soft">
          <span className="truncate">{path}</span>
          {dirty && <span aria-label="Unsaved changes" title="Unsaved changes" className="size-[7px] shrink-0 rounded-full bg-busy" />}
        </p>
        {!draft && (added > 0 || removed > 0) && <Stat added={added} removed={removed} />}
        {draft ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={cancel} className={cn(ghost, "h-6 px-2 text-[12px]")}>
              Cancel
            </button>
            <button type="button" onClick={save} disabled={saving || !dirty} title="Save  ⌘S" className={cn(primary, "h-6 px-2.5 text-[12px]")}>
              Save
            </button>
          </div>
        ) : (
          view &&
          !view.binary && (
            <button type="button" onClick={startEditing} title="Edit file" className={cn(ghost, "h-6 shrink-0 px-2 text-[12px]")}>
              <Pencil className="size-3" />
              Edit
            </button>
          )
        )}
      </div>
      {editError && <p className="shrink-0 border-b border-line bg-minus/[0.06] px-5 py-2 text-[12.5px] text-minus">{editError}</p>}
      {draft && <Editor value={draft.text} onChange={(text) => setDraft({ ...draft, text })} onSave={save} onCancel={cancel} />}
      <div ref={scroller} className={cn("min-h-0 flex-1 overflow-auto", draft && "hidden")}>
        {error && <p className="px-5 py-4 text-[13px] text-minus">{error}</p>}
        {view?.binary && <p className="px-5 py-4 text-[13px] text-mute">Binary file</p>}
        {view && !view.binary && view.lines.length === 0 && <p className="px-5 py-4 text-[13px] text-mute">Empty file</p>}
        {view && !view.binary && view.lines.length > 0 && (
          <table className="selectable min-w-full border-collapse font-mono text-[12px] leading-[20px]">
            <tbody>
              {view.lines.map((line, i) => (
                <tr key={i} className={rowStyles[line.kind]} data-change={line.kind === "add" || line.kind === "del" ? "" : undefined}>
                  <td className="w-12 min-w-12 select-none pr-3 text-right align-top text-ink/25">{line.kind === "gap" ? "⋯" : line.n}</td>
                  <td className={cn("w-4 select-none text-center align-top", line.kind === "add" ? "text-plus" : "text-minus")}>{signs[line.kind]}</td>
                  <td className="whitespace-pre pr-6">
                    {tokens?.[i] && tokens[i]!.length > 0
                      ? tokens[i]!.map((token, k) => (
                          <span key={k} className="tk" style={tokenStyle(token)}>
                            {token.content}
                          </span>
                        ))
                      : line.text || " "}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {view?.truncated && <p className="px-5 py-3 text-[12.5px] text-mute">File is too long to show in full</p>}
      </div>
    </div>
  );
}
