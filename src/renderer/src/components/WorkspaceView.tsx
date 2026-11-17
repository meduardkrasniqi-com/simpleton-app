import { ArrowDown, ArrowUp, Bot, Brain, ChevronRight, CircleAlert, Clock, CornerDownRight, FilePen, FileText, Globe, ListTodo, PanelRight, Pencil, Search, Square, Terminal, Wrench, X, type LucideIcon } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { modes, type Entry, type FileChange, type Pending, type Preview, type Reply, type RunMode, type Share, type TermKind, type Workspace } from "@shared/types";
import { AttachButton, AttachmentList, splitAttachments, useAttachments, withAttachments } from "@/components/Attachments";
import { FileIcon } from "@/components/FileIcon";
import { FileSearch } from "@/components/FileSearch";
import { FileViewer } from "@/components/FileViewer";
import { Activity, Loader } from "@/components/Loader";
import { Markdown } from "@/components/Markdown";
import { PromptBox, Tokens } from "@/components/PromptBox";
import { AnsweredQuestion, ApprovalCard, PlanCard, QuestionCard } from "@/components/Prompts";
import { RunSettings, useAgentChoices } from "@/components/RunSettings";
import { WorkspaceSetup } from "@/components/WorkspaceSetup";
import { WorkspaceSide } from "@/components/WorkspaceSide";
import { Terminal as TerminalView } from "@/components/Terminal";
import { ghost, Stat, StatusIcon } from "@/components/ui";
import { FileLinksContext, resolver } from "@/lib/fileLinks";
import { useTranscript } from "@/lib/useTranscript";
import { agents, cn, duration } from "@/lib/utils";

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

const basename = (path: string) => path.split("/").pop() || path;

const openable = (entry: Extract<Entry, { kind: "tool" }>) => fileVerbs.has(entry.verb) && !!entry.target && !entry.target.startsWith("/") && !entry.target.includes(", ") && !entry.target.endsWith("…");

const isPending = (entry: Entry) => (entry.kind === "tool" ? entry.approval?.state === "pending" : (entry.kind === "question" || entry.kind === "plan") && entry.state === "pending");

type ToolEntry = Extract<Entry, { kind: "tool" }>;

const parentOf = (entry: Entry) => (entry.kind === "tool" || entry.kind === "thinking" || entry.kind === "assistant" ? entry.parent : undefined);

const Nested = createContext<{ children: Map<string, Entry[]>; render: (entry: Entry) => ReactNode }>({ children: new Map(), render: () => null });

function Delegate({ entry }: { entry: ToolEntry }) {
  const { children, render } = useContext(Nested);
  const [open, setOpen] = useState(false);
  const steps = (children.get(entry.id) ?? []).filter((e) => !isPending(e));
  const running = entry.state === "running";
  const count = steps.filter((e) => e.kind === "tool").length;
  const latest = running ? steps.findLast((e): e is ToolEntry => e.kind === "tool") : undefined;
  const name = !entry.agent || entry.agent === "general-purpose" ? "Agent" : entry.agent;
  const expandable = steps.length > 0 || !!entry.output;
  return (
    <div>
      <button type="button" onClick={() => expandable && setOpen(!open)} aria-expanded={open} className="group flex h-6 w-full min-w-0 items-center gap-2 text-left text-[12.5px]">
        <span className="relative grid size-3.5 shrink-0 place-items-center">
          <span className={cn("grid place-items-center transition-opacity", expandable && "group-hover:opacity-0")}>{running ? <Loader className="text-soft" /> : <Bot className={cn("size-3.5", entry.state === "failed" ? "text-minus" : "text-mute")} />}</span>
          {expandable && <ChevronRight className={cn("absolute size-3.5 text-mute opacity-0 transition-[opacity,transform] group-hover:opacity-100", open && "rotate-90")} />}
        </span>
        <span className={cn("shrink-0 font-medium", running ? "shimmer" : "text-soft")}>{name}</span>
        <span className={cn("min-w-0 truncate", running ? "shimmer" : "text-mute group-hover:text-ink")}>{entry.target}</span>
        {count > 0 && (
          <span className="shrink-0 text-[12px] text-mute">
            {count} {count === 1 ? "step" : "steps"}
          </span>
        )}
      </button>
      {!open && latest && (
        <div className="ml-[22px] flex h-5 min-w-0 items-center gap-1.5 text-[12px] text-mute">
          <CornerDownRight className="size-3 shrink-0" />
          <span className="shrink-0">{latest.label ?? latest.verb}</span>
          <span className="min-w-0 truncate font-mono">{latest.target}</span>
        </div>
      )}
      {open && (
        <div className="mb-2 ml-[7px] mt-1 border-l border-line pl-[14px]">
          {steps.map((step, i) => (
            <div key={step.id} className={cn(gap(steps[i - 1], step), step.kind === "assistant" && "text-soft [&_*]:text-[13px]")}>
              {render(step)}
            </div>
          ))}
          {entry.output && (
            <div className={cn("text-soft [&_*]:text-[13px]", steps.length > 0 && "mt-4")}>
              <Markdown text={entry.output} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Tool({ entry, onOpen, onReply }: { entry: ToolEntry; onOpen: (path: string) => void; onReply: (reply: Reply) => void }) {
  const [open, setOpen] = useState(false);
  if (entry.approval?.state === "pending") return <ApprovalCard entry={entry} icon={icons[entry.verb] ?? Wrench} onReply={onReply} />;
  if (entry.agent) return <Delegate entry={entry} />;
  const running = entry.state === "running";
  const Icon = icons[entry.verb] ?? Wrench;
  const icon = running ? <Loader className="text-soft" /> : <Icon className={cn("size-3.5 shrink-0", entry.state === "failed" ? "text-minus" : "text-mute")} />;
  const denied = entry.approval?.state === "denied" && <span className="shrink-0 text-[12px] text-minus">Denied</span>;

  if (entry.command) {
    return (
      <div>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="group flex h-6 w-full min-w-0 items-center gap-2 text-left text-[12.5px]">
          <span className="relative grid size-3.5 shrink-0 place-items-center">
            <span className="grid place-items-center transition-opacity group-hover:opacity-0">{icon}</span>
            <ChevronRight className={cn("absolute size-3.5 text-mute opacity-0 transition-[opacity,transform] group-hover:opacity-100", open && "rotate-90")} />
          </span>
          <span className={cn("shrink-0 font-medium", running ? "shimmer" : "text-soft", entry.label && "max-w-[70%] truncate")}>{entry.label ?? entry.verb}</span>
          <span className={cn("min-w-0 truncate font-mono text-[12px]", running ? "shimmer" : "text-mute group-hover:text-ink")}>{entry.target}</span>
          {denied}
        </button>
        {open && (
          <div className="mb-2 ml-[22px] mt-1 overflow-hidden rounded-lg border border-line bg-panel">
            <pre className="selectable max-h-60 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12px] leading-[18px] text-ink">
              <span className="select-none text-mute">$ </span>
              {entry.command}
            </pre>
            {entry.output && <pre className={cn("selectable max-h-80 overflow-auto whitespace-pre-wrap break-words border-t border-line px-3 py-2 font-mono text-[12px] leading-[18px]", entry.state === "failed" ? "text-minus" : "text-soft")}>{entry.output}</pre>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-6 items-center gap-2 text-[12.5px]">
      {icon}
      <span className={cn("shrink-0 font-medium", running ? "shimmer" : "text-soft")}>{entry.verb}</span>
      {entry.target &&
        (openable(entry) ? (
          <button type="button" onClick={() => onOpen(entry.target)} className={cn("min-w-0 truncate font-mono text-[12px] underline decoration-transparent underline-offset-2 hover:decoration-ink/30", running ? "shimmer" : "text-mute hover:text-ink")} title={entry.target}>
            {entry.target}
          </button>
        ) : (
          <span className={cn("selectable min-w-0 truncate font-mono text-[12px]", running ? "shimmer" : "text-mute")} title={entry.target}>
            {entry.target}
          </span>
        ))}
      {denied}
    </div>
  );
}

function Thinking({ entry }: { entry: Extract<Entry, { kind: "thinking" }> }) {
  const [open, setOpen] = useState(false);
  const preview = entry.text.split("\n").find((line) => line.trim())?.replace(/[*_#`]/g, "").trim() ?? "";
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="group flex h-6 w-full min-w-0 items-center gap-2 text-left text-[12.5px]">
        <span className="relative grid size-3.5 shrink-0 place-items-center">
          <Brain className="size-3.5 text-mute transition-opacity group-hover:opacity-0" />
          <ChevronRight className={cn("absolute size-3.5 text-mute opacity-0 transition-[opacity,transform] group-hover:opacity-100", open && "rotate-90")} />
        </span>
        <span className="shrink-0 font-medium text-soft">Thought</span>
        {!open && <span className="min-w-0 truncate text-mute group-hover:text-ink">{preview}</span>}
      </button>
      {open && (
        <div className="mb-2 ml-[7px] mt-1 border-l border-line pl-[14px] text-soft [&_*]:text-[13px]">
          <Markdown text={entry.text} />
        </div>
      )}
    </div>
  );
}

const shown = 2;

function Turn({ entry, grouped, onOpen }: { entry: Extract<Entry, { kind: "turn" }>; grouped?: boolean; onOpen: (path: string) => void }) {
  if (grouped && !entry.files.length) return null;
  const first = entry.files.slice(0, shown);
  const rest = entry.files.slice(shown);
  const added = entry.files.reduce((n, f) => n + f.added, 0);
  const removed = entry.files.reduce((n, f) => n + f.removed, 0);
  return (
    <div className="flex h-6 min-w-0 items-center gap-3 text-[12px] text-mute">
      {!grouped && (
        <span className="flex shrink-0 items-center gap-1.5" title="Response time">
          <Clock className="size-3.5" />
          {duration(entry.ms)}
        </span>
      )}
      {entry.files.length > 0 && (
        <span className="flex min-w-0 items-center gap-1.5">
          <FilePen className="size-3.5 shrink-0" />
          {first.map((f) => (
            <button key={f.path} type="button" onClick={() => onOpen(f.path)} title={f.path} className="min-w-0 truncate font-mono text-[12px] hover:text-ink">
              {basename(f.path)}
            </button>
          ))}
          {rest.length > 0 && (
            <span className="shrink-0" title={rest.map((f) => f.path).join("\n")}>
              +{rest.length}
            </span>
          )}
          <Stat added={added} removed={removed} className="ml-1 text-[11.5px]" />
        </span>
      )}
    </div>
  );
}

type Item = { kind: "entry"; entry: Entry; grouped?: boolean } | { kind: "steps"; id: string; entries: Entry[]; ms: number };

const stepKinds = new Set<Entry["kind"]>(["tool", "thinking", "assistant", "notice"]);

function group(entries: Entry[]): Item[] {
  const chunks: Entry[][] = [];
  for (const entry of entries) {
    if (entry.kind === "user" || !chunks.length) chunks.push([entry]);
    else chunks[chunks.length - 1].push(entry);
  }
  return chunks.flatMap((chunk): Item[] => {
    const head = chunk[0].kind === "user" ? [chunk[0]] : [];
    const body = chunk.slice(head.length);
    const turn = body[body.length - 1];
    const reply = body[body.length - 2];
    const before = body.slice(0, -2);
    const steps = before.filter((e) => stepKinds.has(e.kind) && !isPending(e));
    if (turn?.kind !== "turn" || reply?.kind !== "assistant" || !steps.length) return chunk.map((entry) => ({ kind: "entry", entry }));
    return [
      ...head.map((entry): Item => ({ kind: "entry", entry })),
      { kind: "steps", id: `${steps[0].id}:steps`, entries: steps, ms: turn.ms },
      ...before.filter((e) => !steps.includes(e)).map((entry): Item => ({ kind: "entry", entry })),
      { kind: "entry", entry: reply },
      { kind: "entry", entry: turn, grouped: true },
    ];
  });
}

function Steps({ item, render }: { item: Extract<Item, { kind: "steps" }>; render: (entry: Entry) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="group flex h-6 items-center gap-1.5 text-[12.5px] text-mute hover:text-ink">
        Worked for {duration(item.ms)}
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="mt-2">
          {item.entries.map((entry, i) => (
            <div key={entry.id} className={gap(item.entries[i - 1], entry)}>
              {render(entry)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ entry, agent, grouped, onOpen, onReply }: { entry: Entry; agent: Workspace["agent"]; grouped?: boolean; onOpen: (path: string) => void; onReply: (reply: Reply) => void }) {
  switch (entry.kind) {
    case "user": {
      const message = splitAttachments(entry.text);
      return (
        <div className="ml-auto flex w-fit max-w-[85%] flex-col items-end gap-2">
          {message.text && (
            <p className="selectable w-fit whitespace-pre-wrap break-words rounded-2xl bg-stage px-4 py-2.5 text-[14px] leading-[1.5]">
              <Tokens text={message.text} />
            </p>
          )}
          <AttachmentList paths={message.paths} className="justify-end" />
        </div>
      );
    }
    case "assistant":
      return <Markdown text={entry.text} />;
    case "thinking":
      return <Thinking entry={entry} />;
    case "tool":
      return <Tool entry={entry} onOpen={onOpen} onReply={onReply} />;
    case "question":
      return entry.state === "pending" ? <QuestionCard entry={entry} onReply={onReply} /> : <AnsweredQuestion entry={entry} />;
    case "plan":
      return <PlanCard entry={entry} modeLabel={modes[agent].find((m) => m.id === entry.mode)?.label} onReply={onReply} />;
    case "turn":
      return <Turn entry={entry} grouped={grouped} onOpen={onOpen} />;
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

function spacing(previous: Item | undefined, item: Item) {
  if (!previous) return "";
  if (item.kind === "steps") return "mt-4";
  if (previous.kind === "steps") return item.entry.kind === "turn" ? "mt-2" : "mt-3";
  return gap(previous.entry, item.entry);
}

function gap(previous: Entry | undefined, entry: Entry) {
  if (!previous) return "";
  if (entry.kind === "turn") return "mt-2";
  const step = (e: Entry) => e.kind === "thinking" || (e.kind === "tool" && !isPending(e));
  if (step(previous) && step(entry)) return "mt-0.5";
  if (entry.kind === "user") return "mt-8";
  return "mt-4";
}

const placeholders: Record<string, string> = {
  tool: "Tell the agent what to do instead",
  question: "Answer in your own words",
  plan: "Describe what to change",
};

function Queue({ workspace, onEdit }: { workspace: Workspace; onEdit: (text: string) => void }) {
  const queue = workspace.queue ?? [];
  if (!queue.length) return null;
  return (
    <ul className="mx-3 rounded-t-lg border border-b-0 border-ink/[0.08] bg-panel p-1">
      {queue.map((item) => (
        <li key={item.id} className="group flex h-8 animate-fade items-center gap-2 rounded-md pl-2 pr-1 text-[13px] hover:bg-ink/[0.04]">
          <CornerDownRight className="size-3.5 shrink-0 text-mute" />
          <button
            type="button"
            title={item.text}
            onClick={() => {
              window.simpleton.unqueue(workspace.id, item.id);
              onEdit(item.text);
            }}
            className="min-w-0 flex-1 truncate text-left text-soft hover:text-ink"
          >
            <Tokens text={item.text} />
          </button>
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button type="button" onClick={() => window.simpleton.sendNow(workspace.id, item.id)} aria-label="Send now" title="Send now" className={cn(ghost, "size-6")}>
              <ArrowUp className="size-3.5" />
            </button>
            <button type="button" onClick={() => window.simpleton.unqueue(workspace.id, item.id)} aria-label="Remove from queue" title="Remove" className={cn(ghost, "size-6 hover:text-minus")}>
              <X className="size-3.5" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function FollowUp({ workspace, initial, pending }: { workspace: Workspace; initial: string; pending?: Entry }) {
  const [text, setText] = useState(initial);
  const input = useRef<HTMLTextAreaElement>(null);
  const attachments = useAttachments();
  const working = workspace.status === "working" || (workspace.status === "input" && !!pending);
  const canSend = !!text.trim() || attachments.paths.length > 0;
  const choices = useAgentChoices(workspace.agent, { model: workspace.model, effort: workspace.effort, mode: workspace.mode }, (settings) => window.simpleton.configure(workspace.id, settings));

  useEffect(() => {
    input.current?.focus();
  }, []);

  const submit = () => {
    if (!canSend) return;
    const message = withAttachments(text, attachments.paths);
    if (pending) window.simpleton.respond(workspace.id, pending.id, { kind: "deny", message });
    else window.simpleton.send(workspace.id, message);
    setText("");
    attachments.clear();
  };

  const edit = (queued: string) => {
    setText((current) => (current.trim() ? `${queued}\n\n${current}` : queued));
    input.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div>
      <Queue workspace={workspace} onEdit={edit} />
      <PromptBox
        value={text}
        onChange={setText}
        onKeyDown={onKeyDown}
        placeholder={pending ? placeholders[pending.kind] : working ? "Queue a follow-up" : `Message ${agents[workspace.agent]}`}
        inputRef={input}
        side="top"
        source={`${workspace.id}:${workspace.agent}`}
        files={() => window.simpleton.files(workspace.id)}
        commands={workspace.agent === "claude-code" && !pending ? () => window.simpleton.commands(workspace.agent, workspace.repoId) : undefined}
        className="max-h-40 min-h-6"
        attachments={attachments}
      >
        <div className="-ml-1 mt-2 flex items-center gap-2">
          <AttachButton attachments={attachments} />
          <RunSettings choices={choices} side="top" />
          <span className="ml-auto" />
          {working && (
            <button type="button" onClick={() => window.simpleton.stop(workspace.id)} aria-label="Stop" title="Stop" className={cn("grid size-7 shrink-0 place-items-center rounded-md", canSend ? "text-soft hover:bg-ink/[0.06] hover:text-ink" : "bg-ink text-surface")}>
              <Square className="size-3 fill-current" />
            </button>
          )}
          {(!working || canSend) && (
            <button type="button" onClick={submit} disabled={!canSend} aria-label={working && !pending ? "Queue" : "Send"} className={cn("grid size-7 shrink-0 place-items-center rounded-md bg-ink text-surface transition-opacity", !canSend && "opacity-30")}>
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </PromptBox>
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
  const [unpushed, setUnpushed] = useState<Pending | null>(null);
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

  const runApp = (mode?: RunMode) => {
    setPanel({ open: true, tab: "app" });
    window.simpleton.startApp(workspace.id, mode);
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
  const [atBottom, setAtBottom] = useState(true);
  const [pinned, setPinned] = useState<string | null>(null);
  const lastUser = useRef<string | undefined>(undefined);

  const refresh = useCallback(() => {
    window.simpleton
      .changes(workspace.id)
      .then(setFiles)
      .catch(() => setFiles([]));
    window.simpleton
      .pending(workspace.id)
      .then(setUnpushed)
      .catch(() => setUnpushed(null));
  }, [workspace.id]);

  useEffect(() => {
    setFiles(null);
    setUnpushed(null);
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const settled = entries?.filter((e) => e.kind === "tool" && e.state !== "running").length ?? 0;

  useEffect(() => {
    const timer = setTimeout(refresh, 300);
    return () => clearTimeout(timer);
  }, [settled, workspace.status, workspace.prUrl, workspace.prState, refresh]);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(stick.current);
    const top = el.getBoundingClientRect().top;
    let current: string | null = null;
    for (const node of el.querySelectorAll<HTMLElement>("[data-user]")) {
      const rect = node.getBoundingClientRect();
      if (rect.top >= top) break;
      current = rect.bottom < top + 8 ? node.dataset.user! : null;
    }
    setPinned(current);
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    const latest = entries?.findLast((e) => e.kind === "user")?.id;
    if (lastUser.current !== undefined && latest !== lastUser.current) stick.current = true;
    if (entries) lastUser.current = latest ?? "";
    if (el && stick.current) el.scrollTop = el.scrollHeight;
    measure();
  }, [entries, workspace.status, measure]);

  const toBottom = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const toEntry = (id: string) => {
    const el = scroller.current;
    const node = el?.querySelector<HTMLElement>(`[data-user="${id}"]`);
    if (!el || !node) return;
    el.scrollTo({ top: el.scrollTop + node.getBoundingClientRect().top - el.getBoundingClientRect().top - 32, behavior: "smooth" });
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
  const links = useMemo(() => ({ root: workspace.path, resolve: resolver(workspace.path, tree), open: (path: string) => openRef.current(path) }), [workspace.path, tree]);

  const children = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of entries ?? []) {
      const parent = parentOf(entry);
      if (!parent) continue;
      const list = map.get(parent);
      if (list) list.push(entry);
      else map.set(parent, [entry]);
    }
    return map;
  }, [entries]);
  const top = useMemo(() => (entries ?? []).filter((e) => !parentOf(e) || isPending(e)), [entries]);
  const items = useMemo(() => group(top), [top]);
  const last = top[top.length - 1];
  const pinnedEntry = pinned ? entries?.find((e) => e.id === pinned) : undefined;
  const pending = entries?.find(isPending);
  const thinking = workspace.status === "working" && !pending && !(last?.kind === "tool" && last.state === "running");
  const reply = (entryId: string) => (value: Reply) => window.simpleton.respond(workspace.id, entryId, value);
  const nested = { children, render: (entry: Entry) => <Row entry={entry} agent={workspace.agent} onOpen={openFile} onReply={reply(entry.id)} /> };

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="drag flex h-12 shrink-0 items-center gap-3 pl-3 pr-3 shadow-[inset_0_-1px_0_var(--color-line)]">
          <div role="tablist" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
            <Tab active={tabs.active === "chat"} onSelect={() => setTabs((t) => ({ ...t, active: "chat" }))}>
              <StatusIcon workspace={workspace} />
              Chat
            </Tab>
            {tabs.files.map((path) => (
              <Tab key={path} active={tabs.active === path} title={path} onSelect={() => setTabs((t) => ({ ...t, active: path }))} onClose={() => closeFile(path)}>
                <FileIcon path={path} />
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
            <div className={cn("relative flex min-h-0 flex-1 flex-col", tabs.active !== "chat" && "hidden")}>
              {pinnedEntry?.kind === "user" && (
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-linear-to-b from-surface from-60% to-transparent px-8 pb-6 pt-3">
                  <div className="mx-auto flex max-w-[720px]">
                    <button
                      type="button"
                      onClick={() => toEntry(pinnedEntry.id)}
                      title={pinnedEntry.text}
                      className="pointer-events-auto ml-auto line-clamp-2 w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl bg-stage px-4 py-2.5 text-left text-[14px] leading-[1.5] shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:bg-[color-mix(in_oklab,var(--color-ink)_7%,var(--color-stage))]"
                    >
                      {pinnedEntry.text}
                    </button>
                  </div>
                </div>
              )}
              <Nested.Provider value={nested}>
                <div ref={scroller} onScroll={measure} className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
                  <div className="mx-auto max-w-[720px]">
                    {workspace.status === "setup" && !entries?.length && (
                      <>
                        <Row entry={{ id: "task", kind: "user", text: workspace.task }} agent={workspace.agent} onOpen={openFile} onReply={() => undefined} />
                        <WorkspaceSetup workspace={workspace} />
                      </>
                    )}
                    {items.map((item, i) =>
                      item.kind === "steps" ? (
                        <div key={item.id} className={spacing(items[i - 1], item)}>
                          <Steps item={item} render={(entry) => <Row entry={entry} agent={workspace.agent} onOpen={openFile} onReply={reply(entry.id)} />} />
                        </div>
                      ) : (
                        <div key={item.entry.id} data-user={item.entry.kind === "user" ? item.entry.id : undefined} className={spacing(items[i - 1], item)}>
                          <Row entry={item.entry} agent={workspace.agent} grouped={item.grouped} onOpen={openFile} onReply={reply(item.entry.id)} />
                        </div>
                      ),
                    )}
                    {thinking && <Activity id={`${workspace.id}:${entries?.filter((e) => e.kind === "user").length ?? 0}`} className={entries?.length ? "mt-4" : ""} />}
                  </div>
                </div>
              </Nested.Provider>
              <div className="relative shrink-0 px-8 pb-5">
                {!atBottom && (
                  <button type="button" onClick={toBottom} aria-label="Jump to latest" className="absolute bottom-full left-1/2 mb-3 grid size-8 -translate-x-1/2 place-items-center rounded-full border border-ink/[0.1] bg-raised text-soft shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:text-ink">
                    <ArrowDown className="size-4" />
                  </button>
                )}
                <div className="mx-auto max-w-[720px]">{entries && workspace.status !== "setup" && <FollowUp workspace={workspace} pending={pending} initial={entries.length === 0 && workspace.status === "idle" ? workspace.task : ""} />}</div>
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
          pending={unpushed}
          tree={tree}
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
