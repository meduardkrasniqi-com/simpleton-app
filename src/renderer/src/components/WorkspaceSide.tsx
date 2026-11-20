import { Archive, ArrowUpFromLine, ArrowUpRight, Check, ChevronDown, ChevronRight, Copy, GitMerge, GitPullRequest, Link, PanelRight, Play, Square, SquareTerminal, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import type { FileChange, FileTarget, OpenPort, Pending, Preview, RunMode, RunOption, Share, Workspace } from "@shared/types";
import { Annotator } from "@/components/Annotator";
import { ChangeIcon, FileIcon } from "@/components/FileIcon";
import { FileTree } from "@/components/FileTree";
import { Loader } from "@/components/Loader";
import { ResizeHandle, useWidth } from "@/components/Resizer";
import { Dot, ghost, outline, primary, Stat } from "@/components/ui";
import { cn, totals } from "@/lib/utils";

const size = "h-7 px-2.5 text-[12.5px]";

const menu = "absolute right-0 top-full z-50 mt-1.5 origin-top-right rounded-[11px] border border-ink/[0.08] bg-menu p-1 shadow-[0_16px_40px_-8px_rgba(0,0,0,0.22),0_4px_10px_-2px_rgba(0,0,0,0.08)] animate-pop";

const item = "flex w-full items-center gap-2.5 rounded-[7px] px-2 text-left text-[13px] outline-none transition-colors hover:bg-ink/[0.06] focus-visible:bg-ink/[0.06]";

const modeNames: Record<RunMode, string> = { dev: "Dev server", build: "Production build" };

function useDismiss(root: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) latest.current();
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, root]);
}

function navigate(e: ReactKeyboardEvent<HTMLElement>, close: () => void) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    close();
    return;
  }
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-item]")];
  const index = items.indexOf(document.activeElement as HTMLElement);
  e.preventDefault();
  items[(index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
}

function useRunOptions(workspace: Workspace) {
  const [options, setOptions] = useState<RunOption[]>([]);
  const ready = workspace.status !== "setup";
  const refresh = () => {
    if (ready) window.simpleton.runOptions(workspace.id).then(setOptions, () => undefined);
  };
  useEffect(refresh, [workspace.id, ready]);
  return { options, refresh };
}

function RunButton({ workspace, preview, onRun }: { workspace: Workspace; preview?: Preview; onRun: (mode?: RunMode) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { options, refresh } = useRunOptions(workspace);
  const live = preview?.state === "starting" || preview?.state === "running";
  const mode = (live ? preview.mode : undefined) ?? workspace.run ?? "dev";
  const split = options.length > 1;
  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  useDismiss(root, open, close);

  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>("[data-current]")?.focus();
  }, [open]);

  const pick = (next: RunMode) => {
    close();
    onRun(next);
  };

  return (
    <div ref={root} className="relative flex">
      {live ? (
        <button type="button" onClick={() => window.simpleton.stopApp(workspace.id)} className={cn(outline, size, split && "rounded-r-none")}>
          <Square className="size-2.5 fill-current" />
          Stop
        </button>
      ) : (
        <button type="button" onClick={() => onRun()} disabled={workspace.status === "setup"} className={cn(outline, size, split && "rounded-r-none", preview?.state === "failed" && "text-minus")}>
          <Play className="size-3 fill-current" />
          {split && mode === "build" ? "Run build" : "Run"}
        </button>
      )}
      {split && (
        <button
          ref={trigger}
          type="button"
          onClick={() => {
            if (!open) refresh();
            setOpen(!open);
          }}
          disabled={workspace.status === "setup"}
          aria-label="Run options"
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(outline, "-ml-px h-7 w-6 rounded-l-none px-0", open && "bg-raised-hover")}
        >
          <ChevronDown className={cn("size-3.5 text-mute transition-transform duration-150", open && "rotate-180")} />
        </button>
      )}
      {open && (
        <div role="menu" onKeyDown={(e) => navigate(e, () => close(true))} className={cn(menu, "w-[280px]")}>
          {options.map((o) => {
            const selected = o.mode === mode;
            return (
              <button key={o.mode} type="button" role="menuitemradio" aria-checked={selected} data-item data-current={selected || undefined} onClick={() => pick(o.mode)} className={cn(item, "items-start py-1.5")}>
                <span className="min-w-0 flex-1">
                  <span className="block text-ink">{modeNames[o.mode]}</span>
                  <span className="mt-0.5 block truncate font-mono text-[11.5px] text-mute">{o.command}</span>
                </span>
                {selected && <Check className="mt-0.5 size-3.5 shrink-0 text-ink" strokeWidth={2.25} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ShareTarget({ workspace, preview, share }: { workspace: Workspace; preview?: Preview; share: Share }) {
  const [open, setOpen] = useState(false);
  const [ports, setPorts] = useState<OpenPort[] | null>(null);
  const [custom, setCustom] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const live = preview?.state === "starting" || preview?.state === "running";
  const app = live ? preview : undefined;
  const mode = app?.mode ?? workspace.run ?? "dev";
  const close = (refocus = false) => {
    setOpen(false);
    setCustom("");
    if (refocus) trigger.current?.focus();
  };
  useDismiss(root, open, close);

  useEffect(() => {
    if (!open) return;
    setPorts(null);
    window.simpleton.ports(workspace.id).then(setPorts, () => setPorts([]));
  }, [open, workspace.id]);

  useEffect(() => {
    if (open && ports) root.current?.querySelector<HTMLElement>("[data-current]")?.focus();
  }, [open, ports]);

  const choose = (port: number | null) => {
    close(true);
    window.simpleton.retarget(workspace.id, port);
  };

  const others = (ports ?? []).filter((p) => p.port !== app?.port);
  if (share.port && share.port !== app?.port && !others.some((p) => p.port === share.port)) others.unshift({ port: share.port, name: "Port" });
  const typed = Number(custom);
  const valid = Number.isInteger(typed) && typed > 0 && typed < 65536;
  const label = share.port ? `:${share.port}` : app ? (app.mode === "build" ? "Build" : "Dev") : "App";

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Choose what this link shows"
        className={cn("flex h-6 items-center gap-0.5 rounded-md pl-1.5 pr-1 font-mono text-[11.5px] text-mute outline-none hover:bg-ink/[0.06] hover:text-ink focus-visible:bg-ink/[0.06]", open && "bg-ink/[0.06] text-ink")}
      >
        {label}
        <ChevronDown className={cn("size-3 transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" onKeyDown={(e) => navigate(e, () => close(true))} className={cn(menu, "w-[272px]")}>
          <TargetItem selected={!share.port} title={modeNames[mode]} detail={app ? `localhost:${app.port}` : "Not running"} onClick={() => choose(null)} />
          {ports === null ? (
            <div className="flex h-8 items-center px-2">
              <Loader className="text-mute" />
            </div>
          ) : (
            others.map((p) => <TargetItem key={p.port} selected={share.port === p.port} title={p.name} detail={`localhost:${p.port}`} onClick={() => choose(p.port)} />)
          )}
          <div className="mx-1 my-1 h-px bg-ink/[0.06]" />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) choose(typed);
            }}
            className="flex h-8 items-center gap-2.5 px-2 text-[13px]"
          >
            <span className="flex-1 text-soft">Other port</span>
            <input
              data-item
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 5))}
              inputMode="numeric"
              placeholder="8080"
              aria-label="Port"
              className="h-6 w-[68px] rounded-md border border-ink/[0.09] bg-surface px-1.5 font-mono text-[12px] tabular-nums outline-none placeholder:text-ink/25 focus:border-ink/25"
            />
            <button type="submit" disabled={!valid} aria-label="Share this port" className="grid size-6 place-items-center rounded-md text-mute hover:bg-ink/[0.06] hover:text-ink disabled:opacity-30">
              <Check className="size-3.5" strokeWidth={2.25} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function TargetItem({ selected, title, detail, onClick }: { selected: boolean; title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={selected} data-item data-current={selected || undefined} onClick={onClick} className={cn(item, "h-8")}>
      <span className={cn("shrink-0", selected ? "text-ink" : "text-soft")}>{title}</span>
      <span className="min-w-0 flex-1 truncate text-right font-mono text-[11.5px] text-mute">{detail}</span>
      <span className="grid size-3.5 shrink-0 place-items-center">{selected && <Check className="size-3.5 text-ink" strokeWidth={2.25} />}</span>
    </button>
  );
}

function stored(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

function store(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    return;
  }
}

function Section({ id, title, meta, grow, children }: { id: string; title: string; meta?: ReactNode; grow?: boolean; children: ReactNode }) {
  const key = `simpleton.section.${id}`;
  const [open, setOpen] = useState(() => stored(key, true));
  const toggle = () => {
    setOpen(!open);
    store(key, !open);
  };
  return (
    <section className={cn("border-b border-line", open && grow && "flex min-h-0 flex-1 flex-col")}>
      <button type="button" onClick={toggle} aria-expanded={open} className="flex h-10 w-full shrink-0 items-center gap-1.5 px-3 text-left hover:bg-panel">
        <ChevronRight className={cn("size-3.5 text-mute transition-transform", open && "rotate-90")} />
        <span className="text-[12.5px] font-semibold">{title}</span>
        {meta && <span className="ml-auto flex items-center">{meta}</span>}
      </button>
      {open && <div className={cn("px-4 pb-4", grow && "min-h-0 flex-1 overflow-y-auto px-2 pb-2")}>{children}</div>}
    </section>
  );
}

const imageUrl = (path: string) => `simpleton-image://local${path.split("/").map(encodeURIComponent).join("/")}`;

function Screenshots({ workspace }: { workspace: Workspace }) {
  const [paths, setPaths] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      window.simpleton.shots(workspace.id).then(
        (next) => alive && setPaths((current) => (current.join("\n") === next.join("\n") ? current : next)),
        () => undefined,
      );
    load();
    const timer = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [workspace.id]);

  const remove = (path: string) => {
    setPaths((current) => current.filter((p) => p !== path));
    if (open === path) setOpen(null);
    window.simpleton.deleteShot(workspace.id, path).catch(() => undefined);
  };

  if (!paths.length) return null;

  return (
    <Section id="screenshots" title="Screenshots" meta={<span className="text-[12px] tabular-nums text-mute">{paths.length}</span>}>
      <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto">
        {paths.map((path) => (
          <div key={path} className="group/thumb relative">
            <button type="button" onClick={() => setOpen(path)} title={path.slice(path.lastIndexOf("/") + 1)} className="block aspect-[16/10] w-full overflow-hidden rounded-md border border-line bg-panel transition-[border-color] hover:border-ink/25">
              <img src={imageUrl(path)} alt="" loading="lazy" className="size-full object-cover object-top" />
            </button>
            <button
              type="button"
              onClick={() => remove(path)}
              aria-label="Delete screenshot"
              title="Delete"
              className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 focus-visible:opacity-100 group-hover/thumb:opacity-100"
            >
              <X className="size-3" strokeWidth={2.5} />
            </button>
          </div>
        ))}
      </div>
      {open && <Annotator path={open} items={paths} onNavigate={setOpen} onClose={() => setOpen(null)} />}
    </Section>
  );
}

type FilesTab = "changes" | "all";

const filesTabs: { id: FilesTab; label: string }[] = [
  { id: "changes", label: "Changes" },
  { id: "all", label: "All files" },
];

const filesTabKey = "simpleton.section.files.tab";

function readFilesTab(): FilesTab {
  try {
    return localStorage.getItem(filesTabKey) === "all" ? "all" : "changes";
  } catch {
    return "changes";
  }
}

function Files({ workspace, files, tree, activeFile, onOpenFile, onFileMenu }: { workspace: Workspace; files: FileChange[] | null; tree: string[]; activeFile: string; onOpenFile: (path: string) => void; onFileMenu: (path: string, target: FileTarget) => void }) {
  const key = "simpleton.section.changes";
  const [open, setOpen] = useState(() => stored(key, true));
  const [tab, setTabState] = useState(readFilesTab);
  const t = totals(files ?? []);

  const show = (next: boolean) => {
    setOpen(next);
    store(key, next);
  };

  const pick = (next: FilesTab) => {
    setTabState(next);
    show(true);
    try {
      localStorage.setItem(filesTabKey, next);
    } catch {
      return;
    }
  };

  return (
    <section className={cn("border-b border-line", open && "flex min-h-0 flex-1 flex-col")}>
      <div className="flex h-10 w-full shrink-0 items-center gap-1 px-3">
        <button type="button" onClick={() => show(!open)} aria-expanded={open} aria-label={open ? "Collapse" : "Expand"} className="-ml-0.5 grid size-5 place-items-center rounded hover:bg-ink/[0.06]">
          <ChevronRight className={cn("size-3.5 text-mute transition-transform", open && "rotate-90")} />
        </button>
        <div role="tablist" className="flex items-center gap-0.5">
          {filesTabs.map(({ id, label }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => pick(id)} className={cn("h-6 rounded-md px-2 text-[12.5px] font-semibold", tab === id ? "bg-ink/[0.06] text-ink" : "text-mute hover:text-ink")}>
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto flex items-center">
          {tab === "changes" && files && files.length > 0 && <Stat added={t.added} removed={t.removed} />}
          {tab === "all" && tree.length > 0 && <span className="text-[12px] tabular-nums text-mute">{tree.length}</span>}
        </span>
      </div>
      {open && (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2">
          {tab === "changes" && (
            <>
              {files && files.length > 0 && (
                <ul>
                  {files.map((f) => {
                    const slash = f.path.lastIndexOf("/");
                    return (
                      <li key={f.path}>
                        <button
                          type="button"
                          onClick={() => onOpenFile(f.path)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            onFileMenu(f.path, { exists: f.status !== "deleted" });
                          }}
                          title={f.path} className={cn("flex h-7 w-full items-center gap-2 rounded-md px-2 text-left font-mono text-[12px]", activeFile === f.path ? "bg-ink/[0.06]" : "hover:bg-ink/[0.04]")}>
                          <FileIcon path={f.path} />
                          <span className={cn("shrink-0 truncate", f.status === "deleted" && "line-through")}>{f.path.slice(slash + 1)}</span>
                          <span className="min-w-0 flex-1 truncate text-[11.5px] text-mute">{slash > 0 ? f.path.slice(0, slash) : ""}</span>
                          <Stat added={f.added} removed={f.removed} className="text-[11.5px]" />
                          <ChangeIcon status={f.status} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {files && files.length === 0 && <p className="px-2 text-[12.5px] text-mute">No changes yet</p>}
            </>
          )}
          {tab === "all" && <FileTree id={workspace.id} files={tree} changes={files ?? []} active={activeFile} onOpen={onOpenFile} onMenu={onFileMenu} />}
        </div>
      )}
    </section>
  );
}

function PrButton({ workspace, pending }: { workspace: Workspace; pending: Pending | null }) {
  const busy = workspace.status === "working" || workspace.status === "setup";

  if (workspace.prState === "merged" || workspace.status === "merged") {
    const archive = () => window.simpleton.removeWorkspace(workspace.id);
    return (
      <button type="button" onClick={archive} disabled={busy} className={cn(outline, size)}>
        <Archive className="size-3.5" />
        Archive
      </button>
    );
  }

  if (workspace.direct) {
    const clean = !!pending && !pending.dirty && pending.ahead === 0;
    return (
      <button type="button" onClick={() => window.simpleton.send(workspace.id, `Commit any uncommitted changes and push them to ${workspace.branch}.`)} disabled={busy || clean} className={cn(primary, size)}>
        <ArrowUpFromLine className="size-3.5" />
        Push changes
      </button>
    );
  }

  const open = !!workspace.prUrl && workspace.prState !== "closed";

  if (open && pending && !pending.dirty && pending.ahead === 0) {
    return (
      <button type="button" onClick={() => window.open(workspace.prUrl)} className={cn(primary, size)}>
        <GitPullRequest className="size-3.5" />
        View PR
      </button>
    );
  }

  const message = open
    ? "Commit any uncommitted changes and push them to the open pull request for this branch."
    : `Commit the changes, push this branch and open a pull request against ${workspace.base.replace(/^origin\//, "")} with gh. Write a clear title and description, then reply with the pull request link.`;
  const Icon = open ? ArrowUpFromLine : GitPullRequest;

  return (
    <button type="button" onClick={() => window.simpleton.send(workspace.id, message)} disabled={busy} className={cn(primary, size)}>
      <Icon className="size-3.5" />
      {open ? "Push changes" : "Create PR"}
    </button>
  );
}

function LinkRow({ icon, label, detail, trailing, muted, onClick, disabled, children }: { icon: ReactNode; label: string; detail?: string; trailing?: ReactNode; muted?: boolean; onClick: () => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <div className="group relative -mx-2">
      <button type="button" onClick={onClick} disabled={disabled} className={cn("flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[12.5px] hover:bg-ink/[0.04] disabled:hover:bg-transparent")}>
        <span className="grid size-4 shrink-0 place-items-center">{icon}</span>
        <span className={cn("shrink-0 font-medium", muted && "font-normal text-mute group-hover:text-ink")}>{label}</span>
        {detail && <span className="min-w-0 truncate font-mono text-[12px] text-mute">{detail}</span>}
        {trailing && <span className="ml-auto flex shrink-0 items-center gap-1 text-[12px] text-mute group-hover:text-ink">{trailing}</span>}
      </button>
      {children}
    </div>
  );
}

function Links({ workspace, preview, share, onRun }: { workspace: Workspace; preview?: Preview; share?: Share; onRun: (mode?: RunMode) => void }) {
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const live = preview?.state === "starting" || preview?.state === "running";

  const create = async () => {
    setCreating(true);
    try {
      if (live || share?.port) return await window.simpleton.share(workspace.id);
      const [found] = await window.simpleton.ports(workspace.id);
      if (found) return await window.simpleton.share(workspace.id, found.port);
      onRun();
      await window.simpleton.share(workspace.id);
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!share) return;
    await navigator.clipboard.writeText(share.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!live && !workspace.prUrl && !share) {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <span className="grid size-9 place-items-center rounded-full bg-stage">
          <Link className="size-4 text-mute" />
        </span>
        <p className="mt-2.5 text-[12.5px] text-mute">No links yet</p>
        <button type="button" onClick={create} disabled={creating || workspace.status === "setup"} className={cn(outline, size, "mt-3 disabled:opacity-100")}>
          {creating ? <Loader /> : <Link className="size-3.5" />}
          {creating ? "Creating link" : "Create share link"}
        </button>
      </div>
    );
  }

  return (
    <div>
      {live && (
        <LinkRow
          icon={preview.state === "running" ? <Dot className="bg-ready" /> : <Loader className="text-mute" />}
          label="App"
          detail={`localhost:${preview.port}${preview.mode === "build" ? " · Build" : ""}`}
          trailing={preview.state === "running" && <ArrowUpRight className="size-3.5" />}
          disabled={preview.state !== "running"}
          onClick={() => window.open(preview.url)}
        />
      )}
      {workspace.prUrl && (
        <LinkRow
          icon={workspace.prState === "merged" ? <GitMerge className="size-3.5 text-done" /> : <GitPullRequest className={cn("size-3.5", workspace.prState === "closed" ? "text-minus" : "text-ready")} />}
          label="Pull request"
          detail={`#${/\/pull\/(\d+)/.exec(workspace.prUrl)?.[1] ?? ""}${workspace.prState === "merged" ? " · Merged" : workspace.prState === "closed" ? " · Closed" : ""}`}
          trailing={<ArrowUpRight className="size-3.5" />}
          onClick={() => window.open(workspace.prUrl)}
        />
      )}
      {share ? (
        <div className="group -mx-2 flex h-8 items-center rounded-md pr-1 hover:bg-ink/[0.04]">
          <button type="button" onClick={share.status === "error" ? create : copy} className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-2 pr-1.5 text-left text-[12.5px]">
            <span className="grid size-4 shrink-0 place-items-center">
              {share.status === "connecting" ? <Loader className="text-mute" /> : <Link className={cn("size-3.5", share.status === "live" ? "text-ready" : "text-minus")} />}
            </span>
            <span className="shrink-0 font-medium">Share</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-mute">{share.status === "error" ? share.error : share.url.replace("https://", "")}</span>
            <span className="flex shrink-0 items-center gap-1 text-[12px] text-mute group-hover:text-ink">
              {share.status === "error" ? (
                "Retry"
              ) : copied ? (
                <>
                  <Check className="size-3.5 text-ready" />
                  Copied
                </>
              ) : (
                <Copy className="size-3.5" />
              )}
            </span>
          </button>
          <ShareTarget workspace={workspace} preview={preview} share={share} />
          <button
            type="button"
            onClick={() => window.simpleton.unshare(workspace.id)}
            aria-label="Stop sharing"
            title="Stop sharing"
            className="ml-0.5 grid size-6 shrink-0 place-items-center rounded-md text-mute opacity-0 transition-opacity hover:bg-ink/[0.06] hover:text-minus focus-visible:opacity-100 group-hover:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <LinkRow
          icon={creating ? <Loader className="text-mute" /> : <Link className="size-3.5 text-mute" />}
          label={creating ? "Creating link" : "Create share link"}
          muted
          disabled={creating}
          onClick={create}
        />
      )}
    </div>
  );
}

export function WorkspaceSide({
  workspace,
  preview,
  share,
  files,
  pending,
  tree,
  activeFile,
  terminalOpen,
  onOpenFile,
  onFileMenu,
  onRun,
  onToggleTerminal,
  onCollapse,
}: {
  workspace: Workspace;
  preview?: Preview;
  share?: Share;
  files: FileChange[] | null;
  pending: Pending | null;
  tree: string[];
  activeFile: string;
  terminalOpen: boolean;
  onOpenFile: (path: string) => void;
  onFileMenu: (path: string, target: FileTarget) => void;
  onRun: (mode?: RunMode) => void;
  onToggleTerminal: () => void;
  onCollapse: () => void;
}) {
  const { width, resize, reset } = useWidth(
    "simpleton.width.right",
    () => Math.min(480, Math.max(360, window.innerWidth * 0.34)),
    320,
    () => Math.min(720, window.innerWidth * 0.6),
  );
  return (
    <aside className="relative flex h-full shrink-0 flex-col border-l border-line" style={{ width }}>
      <ResizeHandle edge="left" width={width} onResize={resize} onReset={reset} />
      <div className="drag flex h-12 shrink-0 items-center gap-1.5 px-3 shadow-[inset_0_-1px_0_var(--color-line)]">
        <button type="button" onClick={onCollapse} aria-label="Hide sidebar" className={cn(ghost, "size-7")}>
          <PanelRight className="size-4" />
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={onToggleTerminal} disabled={workspace.status === "setup"} aria-pressed={terminalOpen} className={cn(ghost, "h-7 px-2 text-[12.5px]", terminalOpen && "bg-ink/[0.06] text-ink")}>
            <SquareTerminal className="size-3.5" />
            Terminal
          </button>
          <RunButton workspace={workspace} preview={preview} onRun={onRun} />
          <PrButton workspace={workspace} pending={pending} />
        </div>
      </div>

      <Section
        id="links"
        title="Links"
        meta={
          share?.status === "live" && (
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-ready">
              <Dot className="bg-ready" />
              Live
            </span>
          )
        }
      >
        <Links workspace={workspace} preview={preview} share={share} onRun={onRun} />
      </Section>

      <Screenshots key={workspace.id} workspace={workspace} />

      <Files workspace={workspace} files={files} tree={tree} activeFile={activeFile} onOpenFile={onOpenFile} onFileMenu={onFileMenu} />
    </aside>
  );
}
