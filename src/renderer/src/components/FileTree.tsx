import { ChevronRight, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ChangeStatus, FileChange } from "@shared/types";
import { ChangeIcon, FileIcon, FolderIcon } from "@/components/FileIcon";
import { Highlight, match } from "@/components/Fuzzy";
import { cn } from "@/lib/utils";

type Dir = { name: string; path: string; dirs: Dir[]; files: string[] };

const limit = 200;

function build(paths: string[]) {
  const root: Dir = { name: "", path: "", dirs: [], files: [] };
  const index = new Map<string, Dir>([["", root]]);
  for (const path of paths) {
    const parts = path.split("/");
    let parent = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts.slice(0, i + 1).join("/");
      let dir = index.get(key);
      if (!dir) {
        dir = { name: parts[i], path: key, dirs: [], files: [] };
        index.set(key, dir);
        parent.dirs.push(dir);
      }
      parent = dir;
    }
    parent.files.push(path);
  }
  const sort = (dir: Dir) => {
    dir.dirs.sort((a, b) => a.name.localeCompare(b.name));
    dir.files.sort((a, b) => a.localeCompare(b));
    dir.dirs.forEach(sort);
  };
  sort(root);
  return root;
}

const indent = (depth: number) => ({ paddingLeft: 8 + depth * 12 });

const row = "flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left font-mono text-[12px]";

const expandedState = new Map<string, Set<string>>();

const rank: Record<ChangeStatus, number> = { deleted: 1, added: 2, untracked: 2, modified: 3 };

function statuses(changes: FileChange[]) {
  const files = new Map<string, ChangeStatus>();
  const dirs = new Map<string, ChangeStatus>();
  for (const change of changes) {
    const status = change.status ?? "modified";
    files.set(change.path, status);
    const parts = change.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      const current = dirs.get(dir);
      if (!current || rank[status] > rank[current]) dirs.set(dir, status);
    }
  }
  return { files, dirs };
}

export function FileTree({ id, files, changes, active, onOpen }: { id: string; files: string[]; changes: FileChange[]; active: string; onOpen: (path: string) => void }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpandedState] = useState<Set<string>>(() => expandedState.get(id) ?? new Set());
  const root = useMemo(() => build(files), [files]);
  const changed = useMemo(() => statuses(changes), [changes]);

  const setExpanded = (change: (current: Set<string>) => Set<string>) =>
    setExpandedState((current) => {
      const next = change(current);
      expandedState.set(id, next);
      return next;
    });

  useEffect(() => {
    const parts = active.split("/").slice(0, -1);
    if (!parts.length) return;
    setExpanded((current) => {
      const ancestors = parts.map((_, i) => parts.slice(0, i + 1).join("/"));
      if (ancestors.every((dir) => current.has(dir))) return current;
      return new Set([...current, ...ancestors]);
    });
  }, [active]);

  const toggle = (path: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  const results = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "");
    if (!q) return null;
    const scored: { path: string; score: number; positions: number[] }[] = [];
    for (const path of files) {
      const m = match(q, path);
      if (m) scored.push({ path, ...m });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ path, positions }) => ({ path, positions: new Set(positions) }));
  }, [files, query]);

  const file = (path: string, depth: number) => {
    const status = changed.files.get(path);
    return (
      <li key={path}>
        <button type="button" onClick={() => onOpen(path)} title={path} className={cn(row, active === path ? "bg-ink/[0.06] text-ink" : "text-soft hover:bg-ink/[0.04] hover:text-ink")} style={indent(depth)}>
          <span className="size-3.5 shrink-0" />
          <FileIcon path={path} />
          <span className={cn("min-w-0 flex-1 truncate", status === "deleted" && "line-through")}>{path.slice(path.lastIndexOf("/") + 1)}</span>
          <ChangeIcon status={status} />
        </button>
      </li>
    );
  };

  const dir = (node: Dir, depth: number): ReactNode => {
    const open = expanded.has(node.path);
    const status = changed.dirs.get(node.path);
    return (
      <li key={node.path}>
        <button type="button" onClick={() => toggle(node.path)} aria-expanded={open} className={cn(row, "text-soft hover:bg-ink/[0.04] hover:text-ink")} style={indent(depth)}>
          <ChevronRight className={cn("size-3.5 shrink-0 text-mute transition-transform", open && "rotate-90")} />
          <FolderIcon open={open} />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {status && <span className="mr-1 size-[5px] shrink-0 rounded-full bg-mute/60" />}
        </button>
        {open && <ul>{children(node, depth + 1)}</ul>}
      </li>
    );
  };

  const children = (node: Dir, depth: number) => [...node.dirs.map((d) => dir(d, depth)), ...node.files.map((f) => file(f, depth))];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-0.5 mb-1.5 flex h-7 shrink-0 items-center gap-2 rounded-md bg-ink/[0.04] px-2">
        <Search className="size-3.5 shrink-0 text-mute" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
            if (e.key === "Enter" && results?.[0]) onOpen(results[0].path);
          }}
          placeholder="Search files"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-mute"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-4 place-items-center rounded text-mute hover:text-ink">
            <X className="size-3" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {results ? (
          <ul>
            {results.map(({ path, positions }) => {
              const slash = path.lastIndexOf("/");
              return (
                <li key={path}>
                  <button type="button" onClick={() => onOpen(path)} title={path} className={cn(row, "gap-2 px-2", active === path ? "bg-ink/[0.06]" : "hover:bg-ink/[0.04]")}>
                    <FileIcon path={path} />
                    <span className="shrink-0 text-ink">
                      <Highlight text={path.slice(slash + 1)} offset={slash + 1} positions={positions} />
                    </span>
                    {slash > 0 && (
                      <span className="min-w-0 truncate text-[11.5px] text-mute">
                        <Highlight text={path.slice(0, slash)} offset={0} positions={positions} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
            {results.length === 0 && <li className="px-2 py-1 text-[12.5px] text-mute">No matching files</li>}
          </ul>
        ) : (
          <ul>{children(root, 0)}</ul>
        )}
      </div>
    </div>
  );
}
