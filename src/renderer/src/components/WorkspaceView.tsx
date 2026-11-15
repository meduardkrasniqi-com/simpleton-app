import { ArrowUp, Bot, CircleAlert, FilePen, FileText, Globe, ListTodo, LoaderCircle, PanelRight, Pencil, Search, Square, Terminal, Wrench, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { Entry, FileChange, Preview, Share, TermKind, Workspace } from "@shared/types";
import { FileSearch } from "@/components/FileSearch";
import { FileViewer } from "@/components/FileViewer";
import { Markdown } from "@/components/Markdown";
import { ModelPicker } from "@/components/ModelPicker";
import { WorkspaceSide } from "@/components/WorkspaceSide";
import { Terminal as TerminalView } from "@/components/Terminal";
import { Dot, ghost } from "@/components/ui";
import { FileLinksContext, resolver } from "@/lib/fileLinks";
import { useTranscript } from "@/lib/useTranscript";
import { agents, cn, statuses } from "@/lib/utils";

const icons: Record<string, LucideIcon> = {
  Run: Terminal,
  Read: FileText,
  Edit: Pencil,
  Write: FilePen,
  Search: Search,
  Find: Search,
  "Search web": Globe,
  Fetch: Globe,
  Plan: ListTodo,
  Delegate: Bot,
};

const fileVerbs = new Set(["Read", "Edit", "Write"]);

const openable = (entry: Extract<Entry, { kind: "tool" }>) => fileVerbs.has(entry.verb) && !!entry.target && !entry.target.startsWith("/") && !entry.target.includes(", ") && !entry.target.endsWith("…");

function Tool({ entry, onOpen }: { entry: Extract<Entry, { kind: "tool" }>; onOpen: (path: string) => void }) {
  const running = entry.state === "running";
  const Icon = running ? LoaderCircle : (icons[entry.verb] ?? Wrench);
  return (
    <div className="flex h-6 items-center gap-2 text-[12.5px]">
      <Icon className={cn("size-3.5 shrink-0", running && "animate-spin", entry.state === "failed" ? "text-minus" : "text-mute")} />
      <span className="shrink-0 font-medium text-soft">{entry.verb}</span>
      {entry.target &&
        (openable(entry) ? (
          <button type="button" onClick={() => onOpen(entry.target)} className="min-w-0 truncate font-mono text-[12px] text-mute underline decoration-transparent underline-offset-2 hover:text-ink hover:decoration-ink/30" title={entry.target}>
            {entry.target}
          </button>
        ) : (
          <span className="selectable min-w-0 truncate font-mono text-[12px] text-mute" title={entry.target}>
            {entry.target}
          </span>
        ))}
    </div>
  );
}

function Row({ entry, onOpen }: { entry: Entry; onOpen: (path: string) => void }) {
  switch (entry.kind) {
    case "user":
      return <p className="selectable ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl bg-stage px-4 py-2.5 text-[14px] leading-[1.5]">{entry.text}</p>;
    case "assistant":
      return <Markdown text={entry.text} />;
    case "tool":
      return <Tool entry={entry} onOpen={onOpen} />;
    case "notice":
      return (
        <div className="flex gap-2 text-[12.5px] leading-[1.5] text-mute">
          <CircleAlert className="mt-[3px] size-3.5 shrink-0" />
          <p className="selectable min-w-0 whitespace-pre-wrap break-words">{entry.text}</p>
        </div>
      );
    case "error":
      return (
        <div className="flex gap-2 rounded-lg bg-minus/[0.06] px-3 py-2 text-[13px] leading-[1.5] text-minus">
          <CircleAlert className="mt-[3px] size-3.5 shrink-0" />
          <p className="selectable min-w-0 whitespace-pre-wrap break-words">{entry.text}</p>
        </div>
      );
  }
}

function gap(previous: Entry | undefined, entry: Entry) {
  if (!previous) return "";
  if (previous.kind === "tool" && entry.kind === "tool") return "mt-0.5";
  if (entry.kind === "user") return "mt-8";
  return "mt-4";
}

function FollowUp({ workspace, initial }: { workspace: Workspace; initial: string }) {
  const [text, setText] = useState(initial);
  const input = useRef<HTMLTextAreaElement>(null);
  const working = workspace.status === "working";

  useEffect(() => {
    input.current?.focus();
  }, []);

  const submit = () => {
    if (!text.trim() || working) return;
    window.simpleton.send(workspace.id, text);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="rounded-xl border border-ink/[0.1] bg-raised p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-within:border-ink/[0.2]">
      <textarea
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={`Message ${agents[workspace.agent]}`}
        rows={1}
        className="block max-h-40 min-h-6 w-full resize-none bg-transparent px-1 text-[14px] leading-[1.5] outline-none [field-sizing:content] placeholder:text-mute"
      />
      <div className="mt-2 flex items-center gap-2">
        <ModelPicker agent={workspace.agent} value={{ model: workspace.model, effort: workspace.effort }} onChange={(settings) => window.simpleton.configure(workspace.id, settings)} />
        <span className="ml-auto" />
        {working ? (
          <button type="button" onClick={() => window.simpleton.stop(workspace.id)} aria-label="Stop" className="grid size-7 shrink-0 place-items-center rounded-md bg-ink text-surface">
            <Square className="size-3 fill-current" />
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={!text.trim()} aria-label="Send" className={cn("grid size-7 shrink-0 place-items-center rounded-md bg-ink text-surface transition-opacity", !text.trim() && "opacity-30")}>
            <ArrowUp className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

type Panel = { open: boolean; tab: TermKind; height: number; shell: boolean };

const panels = new Map<string, Panel>();

const sideKey = "simpleton.side";

function readSide() {
  try {
    return localStorage.getItem(sideKey) !== "closed";
  } catch {
    return true;
  }
}

function writeSide(open: boolean) {
  try {
    localStorage.setItem(sideKey, open ? "open" : "closed");
  } catch {
    return;
  }
}

type Tabs = { files: string[]; active: string };

const tabState = new Map<string, Tabs>();

const basename = (path: string) => path.split("/").pop() || path;

function Tab({ active, title, onSelect, onClose, children }: { active: boolean; title?: string; onSelect: () => void; onClose?: () => void; children: ReactNode }) {
  return (
    <div
      role="tab"
      aria-selected={active}
      title={title}
      onClick={onSelect}
      onAuxClick={(e) => e.button === 1 && onClose?.()}
      className={cn("no-drag group flex h-7 shrink-0 cursor-default items-center gap-1.5 rounded-md text-[12.5px]", onClose ? "pl-2.5 pr-1" : "px-2.5", active ? "bg-ink/[0.06] font-medium text-ink" : "text-soft hover:bg-ink/[0.04]")}
    >
      {children}
      {onClose && (
        <button
          type="button"
          aria-label="Close tab"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={cn("grid size-4 place-items-center rounded hover:bg-ink/[0.08]", active ? "visible" : "invisible group-hover:visible")}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

export function WorkspaceView({ workspace, preview, share }: { workspace: Workspace; preview?: Preview; share?: Share }) {
  const [files, setFiles] = useState<FileChange[] | null>(null);
  const [side, setSideState] = useState(readSide);
  const setSide = (open: boolean) => {
    setSideState(open);
    writeSide(open);
  };
  const [tabs, setTabsState] = useState<Tabs>(() => tabState.get(workspace.id) ?? { files: [], active: "chat" });

  const setTabs = (change: (current: Tabs) => Tabs) =>
    setTabsState((current) => {
      const next = change(current);
      tabState.set(workspace.id, next);
      return next;
    });

  const openFile = (path: string) => setTabs((t) => ({ files: t.files.includes(path) ? t.files : [...t.files, path], active: path }));

  const closeFile = (path: string) =>
    setTabs((t) => {
      const index = t.files.indexOf(path);
      const files = t.files.filter((f) => f !== path);
      const active = t.active !== path ? t.active : (files[Math.min(index, files.length - 1)] ?? "chat");
      return { files, active };
    });
  const [searching, setSearching] = useState(false);
  const searchingRef = useRef(searching);
  searchingRef.current = searching;

  useEffect(
    () =>
      window.simpleton.onCloseTab(() => {
        if (searchingRef.current) return setSearching(false);
        setTabs((t) => {
          if (t.active === "chat") return t;
          const index = t.files.indexOf(t.active);
          const files = t.files.filter((f) => f !== t.active);
          return { files, active: files[Math.min(index, files.length - 1)] ?? "chat" };
        });
      }),
    [],
  );

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        e.stopPropagation();
        setSearching((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const [panel, setPanelState] = useState<Panel>(() => panels.get(workspace.id) ?? { open: false, tab: "shell", height: 260, shell: false });

  const setPanel = (change: Partial<Panel>) =>
    setPanelState((current) => {
      const next = { ...current, ...change };
      next.shell ||= next.open && next.tab === "shell";
      panels.set(workspace.id, next);
      return next;
    });

  const runApp = () => {
    setPanel({ open: true, tab: "app" });
    window.simpleton.startApp(workspace.id);
  };

  const toggleTerminal = () => setPanel(panel.open && panel.tab === "shell" ? { open: false } : { open: true, tab: "shell" });

  const startResize = (e: PointerEvent<HTMLDivElement>) => {
    const startY = e.clientY;
    const startHeight = panel.height;
    const move = (event: globalThis.PointerEvent) => setPanel({ height: Math.min(Math.max(startHeight + startY - event.clientY, 120), window.innerHeight - 200) });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const entries = useTranscript(workspace.id);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const refresh = useCallback(() => {
    window.simpleton
      .changes(workspace.id)
      .then(setFiles)
      .catch(() => setFiles([]));
  }, [workspace.id]);

  useEffect(() => {
    setFiles(null);
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const settled = entries?.filter((e) => e.kind === "tool" && e.state !== "running").length ?? 0;

  useEffect(() => {
    const timer = setTimeout(refresh, 300);
    return () => clearTimeout(timer);
  }, [settled, workspace.status, refresh]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [entries, workspace.status]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const [tree, setTree] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      window.simpleton
        .files(workspace.id)
        .then((f) => alive && setTree(f))
        .catch(() => undefined);
    const timer = setTimeout(load, 300);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener("focus", load);
    };
  }, [workspace.id, settled]);

  const openRef = useRef(openFile);
  openRef.current = openFile;
  const links = useMemo(() => ({ resolve: resolver(workspace.path, tree), open: (path: string) => openRef.current(path) }), [workspace.path, tree]);

  const last = entries?.[entries.length - 1];
  const thinking = workspace.status === "working" && !(last?.kind === "tool" && last.state === "running");

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="drag flex h-12 shrink-0 items-center gap-3 pl-3 pr-3 shadow-[inset_0_-1px_0_var(--color-line)]">
          <div role="tablist" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
            <Tab active={tabs.active === "chat"} onSelect={() => setTabs((t) => ({ ...t, active: "chat" }))}>
              <Dot className={statuses[workspace.status].dot} />
              Chat
            </Tab>
            {tabs.files.map((path) => (
              <Tab key={path} active={tabs.active === path} title={path} onSelect={() => setTabs((t) => ({ ...t, active: path }))} onClose={() => closeFile(path)}>
                <span className="max-w-[180px] truncate">{basename(path)}</span>
              </Tab>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => setSearching(true)} aria-label="Search files" title="Search files  ⌘P" className={cn(ghost, "size-7")}>
              <Search className="size-4" />
            </button>
            {!side && (
              <button type="button" onClick={() => setSide(true)} aria-label="Show sidebar" className={cn(ghost, "size-7")}>
                <PanelRight className="size-4" />
              </button>
            )}
          </div>
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {tabs.active !== "chat" && (
            <div className="min-h-0 flex-1">
              <FileViewer key={tabs.active} workspaceId={workspace.id} path={tabs.active} version={settled} />
            </div>
          )}
          <FileLinksContext.Provider value={links}>
            <div className={cn("flex min-h-0 flex-1 flex-col", tabs.active !== "chat" && "hidden")}>
              <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
                <div className="mx-auto max-w-[720px]">
                  {entries?.map((entry, i) => (
                    <div key={entry.id} className={gap(entries[i - 1], entry)}>
                      <Row entry={entry} onOpen={openFile} />
                    </div>
                  ))}
                  {thinking && <LoaderCircle className={cn("size-3.5 animate-spin text-mute", entries?.length ? "mt-4" : "")} />}
                </div>
              </div>
              <div className="shrink-0 px-8 pb-5">
                <div className="mx-auto max-w-[720px]">{entries && <FollowUp workspace={workspace} initial={entries.length === 0 && workspace.status === "idle" ? workspace.task : ""} />}</div>
              </div>
            </div>
          </FileLinksContext.Provider>
          {panel.open && (
            <div className="flex shrink-0 flex-col border-t border-line" style={{ height: panel.height }}>
              <div onPointerDown={startResize} className="-mt-[3px] h-[5px] shrink-0 cursor-row-resize" />
              <div className="flex h-8 shrink-0 items-center gap-1 px-3">
                {(["shell", "app"] as const)
                  .filter((kind) => kind === "shell" || preview)
                  .map((kind) => (
                    <button key={kind} type="button" onClick={() => setPanel({ tab: kind })} className={cn("h-6 rounded-md px-2 text-[12px] font-medium", panel.tab === kind ? "bg-ink/[0.06] text-ink" : "text-mute hover:text-ink")}>
                      {kind === "shell" ? "Terminal" : "App"}
                    </button>
                  ))}
                <button type="button" onClick={() => setPanel({ open: false })} aria-label="Close panel" className={cn(ghost, "ml-auto size-6")}>
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="relative min-h-0 flex-1">
                {(["shell", "app"] as const).map((kind) =>
                  (kind === "shell" ? panel.shell : preview) ? (
                    <div key={kind} className={cn("absolute inset-0 pb-2 pl-3 pr-1", panel.tab !== kind && "invisible")}>
                      <TerminalView workspaceId={workspace.id} kind={kind} active={panel.tab === kind} />
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {searching && <FileSearch workspaceId={workspace.id} onOpen={openFile} onClose={() => setSearching(false)} />}
      {side && (
        <WorkspaceSide
          workspace={workspace}
          preview={preview}
          share={share}
          files={files}
          activeFile={tabs.active}
          terminalOpen={panel.open && panel.tab === "shell"}
          onOpenFile={openFile}
          onRun={runApp}
          onToggleTerminal={toggleTerminal}
          onCollapse={() => setSide(false)}
        />
      )}
    </div>
  );
}
