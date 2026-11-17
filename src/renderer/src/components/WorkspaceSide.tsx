import { Archive, ArrowUpFromLine, ArrowUpRight, Check, ChevronRight, Copy, GitMerge, GitPullRequest, Link, PanelRight, Play, Square, SquareTerminal, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { FileChange, Pending, Preview, Share, Workspace } from "@shared/types";
import { ChangeLetter, changeTone, FileIcon } from "@/components/FileIcon";
import { FileTree } from "@/components/FileTree";
import { Loader } from "@/components/Loader";
import { ResizeHandle, useWidth } from "@/components/Resizer";
import { Dot, ghost, outline, primary, Stat } from "@/components/ui";
import { cn, totals } from "@/lib/utils";

const size = "h-7 px-2.5 text-[12.5px]";

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

function Files({ workspace, files, tree, activeFile, onOpenFile }: { workspace: Workspace; files: FileChange[] | null; tree: string[]; activeFile: string; onOpenFile: (path: string) => void }) {
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
                        <button type="button" onClick={() => onOpenFile(f.path)} title={f.path} className={cn("flex h-7 w-full items-center gap-2 rounded-md px-2 text-left font-mono text-[12px]", activeFile === f.path ? "bg-ink/[0.06]" : "hover:bg-ink/[0.04]")}>
                          <FileIcon path={f.path} />
                          <span className={cn("shrink-0 truncate", changeTone(f.status), f.status === "deleted" && "line-through")}>{f.path.slice(slash + 1)}</span>
                          <span className="min-w-0 flex-1 truncate text-[11.5px] text-mute">{slash > 0 ? f.path.slice(0, slash) : ""}</span>
                          <Stat added={f.added} removed={f.removed} className="text-[11.5px]" />
                          <ChangeLetter status={f.status} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {files && files.length === 0 && <p className="px-2 text-[12.5px] text-mute">No changes yet</p>}
            </>
          )}
          {tab === "all" && <FileTree id={workspace.id} files={tree} changes={files ?? []} active={activeFile} onOpen={onOpenFile} />}
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

function Links({ workspace, preview, share, onRun }: { workspace: Workspace; preview?: Preview; share?: Share; onRun: () => void }) {
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const live = preview?.state === "starting" || preview?.state === "running";

  const create = async () => {
    setCreating(true);
    if (!live) onRun();
    try {
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
          detail={`localhost:${preview.port}`}
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
        <LinkRow
          icon={
            share.status === "connecting" ? (
              <Loader className="text-mute" />
            ) : (
              <Link className={cn("size-3.5", share.status === "live" ? "text-ready" : "text-minus")} />
            )
          }
          label="Share"
          detail={share.status === "error" ? share.error : share.url.replace("https://", "")}
          trailing={
            share.status === "error" ? (
              "Retry"
            ) : copied ? (
              <>
                <Check className="size-3.5 text-ready" />
                Copied
              </>
            ) : (
              <Copy className="size-3.5" />
            )
          }
          onClick={share.status === "error" ? create : copy}
        >
          <button
            type="button"
            onClick={() => window.simpleton.unshare(workspace.id)}
            aria-label="Stop sharing"
            title="Stop sharing"
            className="absolute right-8 top-1.5 hidden size-5 place-items-center rounded bg-[color-mix(in_oklab,var(--color-ink)_4%,var(--color-surface))] text-mute hover:bg-[color-mix(in_oklab,var(--color-ink)_9%,var(--color-surface))] hover:text-minus group-hover:grid"
          >
            <X className="size-3.5" />
          </button>
        </LinkRow>
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
  onRun: () => void;
  onToggleTerminal: () => void;
  onCollapse: () => void;
}) {
  const live = preview?.state === "starting" || preview?.state === "running";
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
          {live ? (
            <button type="button" onClick={() => window.simpleton.stopApp(workspace.id)} className={cn(outline, size)}>
              <Square className="size-2.5 fill-current" />
              Stop
            </button>
          ) : (
            <button type="button" onClick={onRun} disabled={workspace.status === "setup"} className={cn(outline, size, preview?.state === "failed" && "text-minus")}>
              <Play className="size-3 fill-current" />
              Run
            </button>
          )}
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

      <Files workspace={workspace} files={files} tree={tree} activeFile={activeFile} onOpenFile={onOpenFile} />
    </aside>
  );
}
