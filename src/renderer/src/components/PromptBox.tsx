import { ChevronRight, FileText, Folder } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode, type Ref } from "react";
import type { Command } from "@shared/types";
import { AttachmentList, type AttachmentState } from "@/components/Attachments";
import { Highlight, match } from "@/components/Fuzzy";
import { Loader } from "@/components/Loader";
import { cn } from "@/lib/utils";

type Trigger = { kind: "file" | "command"; start: number; end: number; query: string };

type Item = { kind: "file" | "dir"; path: string; positions: Set<number>; browsing?: boolean } | { kind: "command"; command: Command; positions: Set<number> };

const limit = 50;
const origins: Command["origin"][] = ["project", "user", "plugin", "builtin"];

function detect(value: string, caret: number): Trigger | null {
  const before = value.slice(0, caret);
  const rest = /^\S*/.exec(value.slice(caret))?.[0].length ?? 0;
  const command = /^\/([^\s/]*)$/.exec(before);
  if (command) return { kind: "command", start: 0, end: caret + rest, query: command[1] };
  const file = /(?:^|\s)@([^\s@]*)$/.exec(before);
  if (file) return { kind: "file", start: caret - file[1].length - 1, end: caret + rest, query: file[1] };
  return null;
}

function buildIndex(files: string[]) {
  const children = new Map<string, string[]>();
  const dirs = new Set<string>();
  const add = (parent: string, child: string) => {
    const list = children.get(parent);
    if (list) list.push(child);
    else children.set(parent, [child]);
  };
  for (const file of files) {
    let parent = "";
    let at = file.indexOf("/");
    while (at !== -1) {
      const dir = file.slice(0, at + 1);
      if (!dirs.has(dir)) {
        dirs.add(dir);
        add(parent, dir);
      }
      parent = dir;
      at = file.indexOf("/", at + 1);
    }
    add(parent, file);
  }
  const order = (a: string, b: string) => Number(!a.endsWith("/")) - Number(!b.endsWith("/")) || a.localeCompare(b);
  for (const list of children.values()) list.sort(order);
  return { children, dirs, files: new Set(files), all: [...dirs, ...files] };
}

type Index = ReturnType<typeof buildIndex>;

const entry = (path: string, positions = new Set<number>()): Item => ({ kind: path.endsWith("/") ? "dir" : "file", path, positions });

function fileItems(index: Index, query: string): Item[] {
  const q = query.toLowerCase();
  if (!q || (q.endsWith("/") && index.dirs.has(query))) return (index.children.get(query) ?? []).slice(0, limit).map((path) => ({ ...entry(path), browsing: true }));
  const scored: { path: string; score: number; positions: number[] }[] = [];
  for (const path of index.all) {
    const bare = path.endsWith("/") ? path.slice(0, -1) : path;
    const m = match(q, bare);
    if (!m) continue;
    scored.push({ path, score: m.score + (bare.toLowerCase().startsWith(q) ? 50 : 0) - (path.endsWith("/") ? 2 : 0), positions: m.positions });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ path, positions }) => entry(path, new Set(positions)));
}

function commandItems(commands: Command[], query: string): Item[] {
  const q = query.toLowerCase();
  const ranked = commands.map((command, i) => {
    const name = command.name.toLowerCase();
    if (!q) return { command, score: -origins.indexOf(command.origin) * 1000 - i, positions: [] as number[] };
    if (name.startsWith(q)) return { command, score: 1000 - name.length, positions: [...q].map((_, k) => k) };
    const at = name.indexOf(q);
    if (at !== -1) return { command, score: 500 - at, positions: [...q].map((_, k) => at + k) };
    const m = match(q, name);
    return m ? { command, score: m.score, positions: m.positions } : null;
  });
  return ranked
    .filter((r) => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ command, positions }) => ({ kind: "command", command, positions: new Set(positions) }));
}

const token = "rounded-[4px] bg-ask/[0.12] text-ask shadow-[0_0_0_2px_color-mix(in_oklab,var(--color-ask)_12%,transparent)]";

const pattern = /(^\/[^\s/]+)|((?<=^|\s)@[^\s@]+)/g;

export function Tokens({ text, valid }: { text: string; valid?: (token: string) => boolean }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (valid && !valid(m[0])) continue;
    parts.push(text.slice(last, m.index));
    parts.push(
      <span key={m.index} className={token}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

function useLoaded<T>(source: string, load: (() => Promise<T>) | undefined) {
  const [data, setData] = useState<{ source: string; value: T } | null>(null);
  const loading = useRef<string | null>(null);
  const refresh = useCallback(() => {
    if (!load || loading.current === source) return;
    loading.current = source;
    load()
      .then((value) => setData({ source, value }))
      .catch(() => undefined)
      .finally(() => {
        if (loading.current === source) loading.current = null;
      });
  }, [source, load]);
  return { value: data?.source === source ? data.value : null, refresh };
}

function Row({ item, active, onPick, onHover }: { item: Item; active: boolean; onPick: () => void; onHover: () => void }) {
  const base = cn("flex w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px]", active && "bg-ink/[0.06]");
  if (item.kind === "command") {
    const { command } = item;
    return (
      <button type="button" onClick={onPick} onMouseMove={onHover} className={cn(base, "h-8")}>
        <span className="shrink-0 font-medium text-soft">
          /<Highlight text={command.name} offset={0} positions={item.positions} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-mute">{command.description}</span>
      </button>
    );
  }
  const bare = item.kind === "dir" ? item.path.slice(0, -1) : item.path;
  const slash = bare.lastIndexOf("/");
  const name = bare.slice(slash + 1);
  const dir = slash >= 0 && !item.browsing ? bare.slice(0, slash) : "";
  const Icon = item.kind === "dir" ? Folder : FileText;
  return (
    <button type="button" onClick={onPick} onMouseMove={onHover} className={cn(base, "h-8")}>
      <Icon className="size-3.5 shrink-0 text-mute" />
      <span className="shrink-0 text-soft">
        <Highlight text={name} offset={slash + 1} positions={item.positions} />
      </span>
      {dir && (
        <span className="min-w-0 truncate text-[12px] text-mute">
          <Highlight text={dir} offset={0} positions={item.positions} />
        </span>
      )}
      {item.kind === "dir" && <ChevronRight className={cn("ml-auto size-3.5 shrink-0 text-mute", !active && "opacity-0")} />}
    </button>
  );
}

export function PromptBox({
  value,
  onChange,
  onKeyDown,
  placeholder,
  inputRef,
  className,
  side,
  source,
  files,
  commands,
  attachments,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  inputRef?: Ref<HTMLTextAreaElement>;
  className?: string;
  side: "top" | "bottom";
  source: string;
  files: () => Promise<string[]>;
  commands?: () => Promise<Command[]>;
  attachments?: AttachmentState;
  children: ReactNode;
}) {
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const nextCaret = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const hasFiles = (e: DragEvent) => !!attachments && e.dataTransfer.types.includes("Files");

  const drop = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      attachments?.addFiles([...e.dataTransfer.files]);
      textarea.current?.focus();
    },
  };

  const paste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.files];
    if (!attachments || !files.length) return;
    e.preventDefault();
    attachments.addFiles(files);
  };

  const fileList = useLoaded(source, files);
  const commandList = useLoaded(source, commands);
  const index = useMemo(() => (fileList.value ? buildIndex(fileList.value) : null), [fileList.value]);
  const names = useMemo(() => new Map((commandList.value ?? []).map((c) => [c.name, c])), [commandList.value]);

  const refresh = () => {
    fileList.refresh();
    commandList.refresh();
  };

  useEffect(() => {
    if (focused) refresh();
  }, [source]);

  const trigger = focused ? detect(value, caret) : null;
  const key = trigger && `${trigger.kind}:${trigger.start}`;
  const supported = trigger?.kind === "file" || (trigger?.kind === "command" && !!commands);
  const open = !!trigger && supported && dismissed !== key;

  const items = useMemo(() => {
    if (!open || !trigger) return [];
    if (trigger.kind === "file") return index ? fileItems(index, trigger.query) : [];
    return commandList.value ? commandItems(commandList.value, trigger.query) : [];
  }, [open, trigger?.kind, trigger?.query, index, commandList.value]);

  const loading = open && (trigger?.kind === "file" ? !index : !commandList.value);
  const commandsEmpty = open && trigger?.kind === "command" && commandList.value?.length === 0;
  const visible = open && !commandsEmpty && (loading || items.length > 0 || !!trigger?.query);

  useEffect(() => setSelected(0), [trigger?.kind, trigger?.query]);

  useEffect(() => {
    if (dismissed && dismissed !== key) setDismissed(null);
  }, [key, dismissed]);

  useLayoutEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useLayoutEffect(() => {
    const el = textarea.current;
    if (el && nextCaret.current !== null) {
      el.setSelectionRange(nextCaret.current, nextCaret.current);
      setCaret(nextCaret.current);
      nextCaret.current = null;
    }
    if (el && backdrop.current) backdrop.current.scrollTop = el.scrollTop;
  }, [value]);

  const pick = (item: Item | undefined) => {
    if (!item || !trigger) return;
    const insert = item.kind === "command" ? `/${item.command.name} ` : item.kind === "dir" ? `@${item.path}` : `@${item.path} `;
    let tail = value.slice(trigger.end);
    if (insert.endsWith(" ") && tail.startsWith(" ")) tail = tail.slice(1);
    nextCaret.current = trigger.start + insert.length;
    onChange(value.slice(0, trigger.start) + insert + tail);
  };

  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (visible && !e.nativeEvent.isComposing) {
      const down = e.key === "ArrowDown" || (e.ctrlKey && e.key === "n");
      const up = e.key === "ArrowUp" || (e.ctrlKey && e.key === "p");
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setDismissed(key);
        return;
      }
      if (items.length && (down || up)) {
        e.preventDefault();
        setSelected((i) => (down ? (i + 1) % items.length : (i - 1 + items.length) % items.length));
        return;
      }
      if (items.length && ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab")) {
        e.preventDefault();
        pick(items[selected]);
        return;
      }
    }
    onKeyDown(e);
  };

  const ref = (el: HTMLTextAreaElement | null) => {
    textarea.current = el;
    if (typeof inputRef === "function") inputRef(el);
    else if (inputRef) inputRef.current = el;
  };

  const valid = (t: string) => (t.startsWith("/") ? names.has(t.slice(1)) : !!index && (index.files.has(t.slice(1)) || index.dirs.has(t.slice(1))));
  const ghost = /^\/(\S+) $/.exec(value);
  const hint = ghost ? names.get(ghost[1])?.hint : undefined;

  return (
    <div {...drop} className={cn("relative rounded-xl border border-ink/[0.1] bg-raised p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] focus-within:border-ink/[0.2]", dragging && "border-ask/60 shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-ask)_14%,transparent)] focus-within:border-ask/60")}>
      {attachments && <AttachmentList paths={attachments.paths} onRemove={attachments.remove} className="mb-3" />}
      <div className="relative">
        <div ref={backdrop} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-1 text-[14px] leading-[1.5] text-ink">
          <Tokens text={value} valid={valid} />
          {hint && <span className="text-mute">{hint}</span>}
        </div>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => {
            setCaret(e.target.selectionStart);
            onChange(e.target.value);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onScroll={(e) => {
            if (backdrop.current) backdrop.current.scrollTop = e.currentTarget.scrollTop;
          }}
          onFocus={() => {
            setFocused(true);
            refresh();
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={keyDown}
          onPaste={paste}
          placeholder={placeholder}
          spellCheck={false}
          rows={1}
          role="combobox"
          aria-expanded={visible}
          aria-autocomplete="list"
          className={cn("relative block w-full resize-none break-words bg-transparent px-1 text-[14px] leading-[1.5] text-transparent caret-ink outline-none [field-sizing:content] [scrollbar-width:none] selection:bg-ask/25 placeholder:text-mute", className)}
        />
      </div>
      {children}
      {visible && (
        <div onMouseDown={(e) => e.preventDefault()} className={cn("absolute inset-x-0 z-30 animate-fade overflow-hidden rounded-xl border border-ink/[0.1] bg-raised shadow-[0_12px_32px_-4px_rgba(0,0,0,0.16),0_2px_6px_rgba(0,0,0,0.06)]", side === "top" ? "bottom-full mb-2" : "top-full mt-2")}>
          <ul ref={list} role="listbox" className="max-h-[min(320px,40vh)] overflow-y-auto p-1.5">
            {loading && (
              <li className="flex h-8 items-center px-2">
                <Loader className="text-mute" />
              </li>
            )}
            {items.map((item, i) => (
              <li key={item.kind === "command" ? `/${item.command.name}` : item.path} role="option" aria-selected={i === selected} data-index={i}>
                <Row item={item} active={i === selected} onPick={() => pick(item)} onHover={() => i !== selected && setSelected(i)} />
              </li>
            ))}
            {!loading && !items.length && <li className="flex h-8 items-center px-2 text-[13px] text-mute">{trigger?.kind === "command" ? "No matching commands" : "No matching files"}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
