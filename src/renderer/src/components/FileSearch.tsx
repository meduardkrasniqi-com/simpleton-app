import { FileText, Search } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Highlight, match } from "@/components/Fuzzy";
import { cn } from "@/lib/utils";

const limit = 60;

export function FileSearch({ workspaceId, onOpen, onClose }: { workspaceId: string; onOpen: (path: string) => void; onClose: () => void }) {
  const [files, setFiles] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let alive = true;
    window.simpleton
      .files(workspaceId)
      .then((f) => alive && setFiles(f))
      .catch(() => alive && setFiles([]));
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  const results = useMemo(() => {
    if (!files) return [];
    const q = query.trim().toLowerCase().replace(/\s+/g, "");
    if (!q) return files.slice(0, limit).map((path) => ({ path, positions: new Set<number>() }));
    const scored: { path: string; score: number; positions: number[] }[] = [];
    for (const path of files) {
      const m = match(q, path);
      if (m) scored.push({ path, ...m });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ path, positions }) => ({ path, positions: new Set(positions) }));
  }, [files, query]);

  useEffect(() => setSelected(0), [query]);

  useLayoutEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const open = (path: string | undefined) => {
    if (!path) return;
    onOpen(path);
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      open(results[selected]?.path);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="no-drag fixed inset-0 z-50 flex justify-center bg-black/20 pt-[12vh] dark:bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Search files" className="flex h-fit max-h-[min(480px,70vh)] w-[min(600px,calc(100vw-48px))] flex-col overflow-hidden rounded-xl border border-ink/[0.1] bg-raised shadow-[0_16px_48px_rgba(0,0,0,0.18)]">
        <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-line px-3.5">
          <Search className="size-4 shrink-0 text-mute" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} placeholder="Search files" spellCheck={false} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-mute" />
        </div>
        <ul ref={list} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {results.map(({ path, positions }, i) => {
            const slash = path.lastIndexOf("/");
            const name = path.slice(slash + 1);
            const dir = slash >= 0 ? path.slice(0, slash) : "";
            return (
              <li key={path} role="option" aria-selected={i === selected} data-index={i}>
                <button type="button" onClick={() => open(path)} onMouseMove={() => i !== selected && setSelected(i)} className={cn("flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px]", i === selected && "bg-ink/[0.06]")}>
                  <FileText className="size-3.5 shrink-0 text-mute" />
                  <span className="shrink-0 text-ink">
                    <Highlight text={name} offset={slash + 1} positions={positions} />
                  </span>
                  {dir && (
                    <span className="min-w-0 truncate text-[12px] text-mute">
                      <Highlight text={dir} offset={0} positions={positions} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {files && results.length === 0 && <li className="px-2 py-3 text-[13px] text-mute">No matching files</li>}
        </ul>
      </div>
    </div>
  );
}
