import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FileView } from "@shared/types";
import { Stat } from "@/components/ui";
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

export function FileViewer({ workspaceId, path, version }: { workspaceId: string; path: string; version: number }) {
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
  }, [workspaceId, path, version]);

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
        <p className="selectable min-w-0 flex-1 truncate font-mono text-[12px] text-soft">{path}</p>
        {(added > 0 || removed > 0) && <Stat added={added} removed={removed} />}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
        {error && <p className="px-5 py-4 text-[13px] text-minus">{error}</p>}
        {view?.binary && <p className="px-5 py-4 text-[13px] text-mute">Binary file</p>}
        {view && !view.binary && view.lines.length === 0 && <p className="px-5 py-4 text-[13px] text-mute">Empty file</p>}
        {view && !view.binary && view.lines.length > 0 && (
          <table className="selectable min-w-full border-collapse font-mono text-[12px] leading-[20px]">
            <tbody>
              {view.lines.map((line, i) => (
                <tr key={i} className={rowStyles[line.kind]} data-change={line.kind === "add" || line.kind === "del" ? "" : undefined}>
                  <td className="w-12 min-w-12 select-none pr-3 text-right align-top text-black/25">{line.kind === "gap" ? "⋯" : line.n}</td>
                  <td className={cn("w-4 select-none text-center align-top", line.kind === "add" ? "text-plus" : "text-minus")}>{signs[line.kind]}</td>
                  <td className="whitespace-pre pr-6">
                    {tokens?.[i] && tokens[i]!.length > 0
                      ? tokens[i]!.map((token, k) => (
                          <span key={k} style={tokenStyle(token)}>
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
