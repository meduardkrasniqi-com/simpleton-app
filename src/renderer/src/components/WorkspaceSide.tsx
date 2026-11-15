import { ArrowUpFromLine, ArrowUpRight, Check, ChevronRight, Copy, GitPullRequest, Link, LoaderCircle, PanelRight, Play, Square, SquareTerminal, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { FileChange, Preview, Workspace } from "@shared/types";
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

function PrButton({ workspace }: { workspace: Workspace }) {
  const [busy, setBusy] = useState(false);
  const [pushed, setPushed] = useState(false);
  const hasPr = !!workspace.prUrl;

  const run = async () => {
    setBusy(true);
    try {
      const result = await window.simpleton.createPr(workspace.id);
      if (result === "pushed") {
        setPushed(true);
        setTimeout(() => setPushed(false), 1500);
      }
    } finally {
      setBusy(false);
    }
  };

  const Icon = busy ? LoaderCircle : pushed ? Check : hasPr ? ArrowUpFromLine : GitPullRequest;
  const label = hasPr ? (busy ? "Pushing" : pushed ? "Pushed" : "Commit & push") : busy ? "Creating PR" : "Create PR";

  return (
    <button type="button" onClick={run} disabled={busy || workspace.status === "working"} className={cn(primary, size)}>
      <Icon className={cn("size-3.5", busy && "animate-spin")} />
      {label}
    </button>
  );
}

function LinkRow({ icon, label, detail, trailing, muted, onClick, disabled, children }: { icon: ReactNode; label: string; detail?: string; trailing?: ReactNode; muted?: boolean; onClick: () => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <div className="group relative -mx-2">
      <button type="button" onClick={onClick} disabled={disabled} className={cn("flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[12.5px] hover:bg-black/[0.04] disabled:hover:bg-transparent")}>
        <span className="grid size-4 shrink-0 place-items-center">{icon}</span>
        <span className={cn("shrink-0 font-medium", muted && "font-normal text-mute group-hover:text-ink")}>{label}</span>
        {detail && <span className="min-w-0 truncate font-mono text-[12px] text-mute">{detail}</span>}
        {trailing && <span className="ml-auto flex shrink-0 items-center gap-1 text-[12px] text-mute group-hover:text-ink">{trailing}</span>}
      </button>
      {children}
    </div>
  );
}

type Share = "off" | "creating" | "on";

const shares = new Map<string, Share>();

function useShare(id: string) {
  const [state, setStateRaw] = useState<Share>(() => shares.get(id) ?? "off");
  const setState = (next: Share) => {
    shares.set(id, next);
    setStateRaw(next);
  };
  useEffect(() => {
    if (state !== "creating") return;
    const timer = setTimeout(() => setState("on"), 1000);
    return () => clearTimeout(timer);
  });
  return [state, setState] as const;
}

function Links({ workspace, preview, share, setShare }: { workspace: Workspace; preview?: Preview; share: Share; setShare: (next: Share) => void }) {
  const [copied, setCopied] = useState(false);
  const live = preview?.state === "starting" || preview?.state === "running";
  const url = `https://${workspace.branch}.simpleton.io`;
  const creating = share === "creating";

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!live && !workspace.prUrl && share !== "on") {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <span className="grid size-9 place-items-center rounded-full bg-stage">
          <Link className="size-4 text-mute" />
        </span>
        <p className="mt-2.5 text-[12.5px] text-mute">No links yet</p>
        <button type="button" onClick={() => setShare("creating")} disabled={creating} className={cn(outline, size, "mt-3 disabled:opacity-100")}>
          {creating ? <LoaderCircle className="size-3.5 animate-spin" /> : <Link className="size-3.5" />}
          {creating ? "Creating link" : "Create share link"}
        </button>
      </div>
    );
  }

  return (
    <div>
      {live && (
        <LinkRow
          icon={preview.state === "running" ? <Dot className="bg-ready" /> : <LoaderCircle className="size-3.5 animate-spin text-mute" />}
          label="App"
          detail={`localhost:${preview.port}`}
          trailing={preview.state === "running" && <ArrowUpRight className="size-3.5" />}
          disabled={preview.state !== "running"}
          onClick={() => window.open(preview.url)}
        />
      )}
      {workspace.prUrl && (
        <LinkRow
          icon={<GitPullRequest className="size-3.5 text-ready" />}
          label="Pull request"
          detail={`#${/\/pull\/(\d+)/.exec(workspace.prUrl)?.[1] ?? ""}`}
          trailing={<ArrowUpRight className="size-3.5" />}
          onClick={() => window.open(workspace.prUrl)}
        />
      )}
      {share === "on" ? (
        <LinkRow
          icon={<Link className="size-3.5 text-ready" />}
          label="Share"
          detail={url.replace("https://", "")}
          trailing={
            copied ? (
              <>
                <Check className="size-3.5 text-ready" />
                Copied
              </>
            ) : (
              <Copy className="size-3.5" />
            )
          }
          onClick={copy}
        >
          <button
            type="button"
            onClick={() => setShare("off")}
            aria-label="Stop sharing"
            title="Stop sharing"
            className="absolute right-8 top-1.5 hidden size-5 place-items-center rounded bg-[#f5f5f5] text-mute hover:bg-[#ebebeb] hover:text-minus group-hover:grid"
          >
            <X className="size-3.5" />
          </button>
        </LinkRow>
      ) : (
        <LinkRow
          icon={creating ? <LoaderCircle className="size-3.5 animate-spin text-mute" /> : <Link className="size-3.5 text-mute" />}
          label={creating ? "Creating link" : "Create share link"}
          muted
          disabled={creating}
          onClick={() => setShare("creating")}
        />
      )}
    </div>
  );
}

export function WorkspaceSide({
  workspace,
  preview,
  files,
  activeFile,
  terminalOpen,
  onOpenFile,
  onRun,
  onToggleTerminal,
  onCollapse,
}: {
  workspace: Workspace;
  preview?: Preview;
  files: FileChange[] | null;
  activeFile: string;
  terminalOpen: boolean;
  onOpenFile: (path: string) => void;
  onRun: () => void;
  onToggleTerminal: () => void;
  onCollapse: () => void;
}) {
  const live = preview?.state === "starting" || preview?.state === "running";
  const [share, setShare] = useShare(workspace.id);
  const { width, resize, reset } = useWidth(
    "simpleton.width.right",
    () => Math.min(480, Math.max(360, window.innerWidth * 0.34)),
    320,
    () => Math.min(720, window.innerWidth * 0.6),
  );
  const t = totals(files ?? []);

  return (
    <aside className="relative flex h-full shrink-0 flex-col border-l border-line" style={{ width }}>
      <ResizeHandle edge="left" width={width} onResize={resize} onReset={reset} />
      <div className="drag flex h-12 shrink-0 items-center gap-1.5 px-3 shadow-[inset_0_-1px_0_var(--color-line)]">
        <button type="button" onClick={onCollapse} aria-label="Hide sidebar" className={cn(ghost, "size-7")}>
          <PanelRight className="size-4" />
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={onToggleTerminal} aria-pressed={terminalOpen} className={cn(ghost, "h-7 px-2 text-[12.5px]", terminalOpen && "bg-black/[0.06] text-ink")}>
            <SquareTerminal className="size-3.5" />
            Terminal
          </button>
          {live ? (
            <button type="button" onClick={() => window.simpleton.stopApp(workspace.id)} className={cn(outline, size)}>
              <Square className="size-2.5 fill-current" />
              Stop
            </button>
          ) : (
            <button type="button" onClick={onRun} className={cn(outline, size, preview?.state === "failed" && "text-minus")}>
              <Play className="size-3 fill-current" />
              Run
            </button>
          )}
          <PrButton workspace={workspace} />
        </div>
      </div>

      <Section
        id="links"
        title="Links"
        meta={
          share === "on" && (
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-ready">
              <Dot className="bg-ready" />
              Live
            </span>
          )
        }
      >
        <Links workspace={workspace} preview={preview} share={share} setShare={setShare} />
      </Section>

      <Section id="changes" title="Changes" grow meta={files && files.length > 0 && <Stat added={t.added} removed={t.removed} />}>
        {files && files.length > 0 && (
          <ul>
            {files.map((f) => (
              <li key={f.path}>
                <button type="button" onClick={() => onOpenFile(f.path)} title={f.path} className={cn("flex h-7 w-full items-center gap-2 rounded-md px-2 text-left", activeFile === f.path ? "bg-black/[0.06]" : "hover:bg-black/[0.04]")}>
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{f.path}</span>
                  <Stat added={f.added} removed={f.removed} className="text-[11.5px]" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {files && files.length === 0 && <p className="px-2 text-[12.5px] text-mute">No changes yet</p>}
      </Section>
    </aside>
  );
}
