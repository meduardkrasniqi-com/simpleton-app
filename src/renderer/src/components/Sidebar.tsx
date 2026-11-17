import { AppWindow, Archive, ChevronRight, FolderGit2, FolderPlus, House, Link, LogOut, Monitor, Moon, Plus, Sun, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AppState, Preview, Share, Theme, User, Workspace } from "@shared/types";
import { ResizeHandle, useWidth } from "@/components/Resizer";
import { StatusIcon } from "@/components/ui";
import { cn, displayName, subtitle } from "@/lib/utils";

const merged = (w: Workspace) => w.status === "merged" || w.prState === "merged";

const row = "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13.5px]";

function Item({ children, active, onClick, className }: { children: ReactNode; active?: boolean; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={cn(row, active ? "bg-ink/[0.07] font-medium" : "hover:bg-ink/[0.04]", className)}>
      {children}
    </button>
  );
}

const themes = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

function ThemePicker({ value }: { value: Theme }) {
  return (
    <div role="radiogroup" aria-label="Theme" className="flex shrink-0 items-center rounded-md bg-ink/[0.05] p-0.5">
      {themes.map(({ value: option, label, icon: Icon }) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          aria-label={label}
          title={label}
          onClick={() => window.simpleton.setTheme(option)}
          className={cn("grid size-6 place-items-center rounded-[5px] transition-colors", value === option ? "bg-raised text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "text-mute hover:text-ink")}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

function Avatar({ user }: { user: User }) {
  const [failed, setFailed] = useState(false);
  if (user.image && !failed) {
    return <img src={user.image} alt="" onError={() => setFailed(true)} className="size-5 shrink-0 rounded-full bg-ink/[0.06]" />;
  }
  return <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ink/[0.08] text-[11px] font-semibold text-soft">{(user.name || user.email).charAt(0).toUpperCase()}</span>;
}

function UserMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative mt-1">
      {open && (
        <div role="menu" className="absolute inset-x-0 bottom-full mb-1 rounded-lg border border-line bg-raised p-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
          <button type="button" role="menuitem" onClick={() => window.simpleton.logout()} className={cn(row, "hover:bg-ink/[0.05]")}>
            <LogOut className="size-4 text-mute" />
            Sign out
          </button>
        </div>
      )}
      <Item onClick={() => setOpen((o) => !o)} active={open} className="min-w-0">
        <Avatar user={user} />
        <span className="min-w-0 flex-1 truncate" title={user.email}>
          {user.name || user.email}
        </span>
      </Item>
    </div>
  );
}

function Indicators({ preview, share }: { preview?: Preview; share?: Share }) {
  const server = preview && (preview.state === "starting" || preview.state === "running");
  if (!server && !share) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 group-hover/ws:invisible">
      {server && (
        <span title={preview.state === "running" ? `Dev server on localhost:${preview.port}` : "Dev server starting"}>
          <AppWindow className={cn("size-3.5", preview.state === "running" ? "text-ready" : "animate-pulse text-mute")} />
        </span>
      )}
      {share && (
        <span title={share.status === "live" ? `Shared at ${share.url.replace("https://", "")}` : share.status === "error" ? "Share link offline" : "Share link connecting"}>
          <Link className={cn("size-3.5", share.status === "live" ? "text-ready" : share.status === "error" ? "text-minus" : "animate-pulse text-mute")} />
        </span>
      )}
    </span>
  );
}

const collapsedKey = "simpleton.collapsed";

function readCollapsed() {
  try {
    const saved = JSON.parse(localStorage.getItem(collapsedKey) ?? "[]");
    return new Set<string>(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set<string>();
  }
}

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      try {
        localStorage.setItem(collapsedKey, JSON.stringify([...next]));
      } catch {
        return next;
      }
      return next;
    });
  return { collapsed, toggle };
}

export function Sidebar({ state, user, active, onSelect, onNewTask }: { state: AppState; user: User; active: string; onSelect: (id: string) => void; onNewTask: (repoId: string) => void }) {
  const { width, resize, reset } = useWidth(
    "simpleton.width.left",
    () => 260,
    200,
    () => 420,
  );

  const { collapsed, toggle } = useCollapsed();

  const removeWorkspace = (w: Workspace) => {
    if (merged(w) || confirm(`Delete ${displayName(w)}? The worktree and branch ${w.branch} will be removed.`)) window.simpleton.removeWorkspace(w.id);
  };

  const removeRepo = (id: string, name: string) => {
    if (confirm(`Remove ${name} and delete all of its workspaces?`)) window.simpleton.removeRepo(id);
  };

  return (
    <aside className="relative flex shrink-0 flex-col border-r border-ink/[0.06] bg-sidebar" style={{ width }}>
      <ResizeHandle edge="right" width={width} onResize={resize} onReset={reset} />
      <div className="drag h-12 shrink-0" />
      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 pb-2.5">
        <Item active={active === "home"} onClick={() => onSelect("home")}>
          <House className="size-4 text-mute" />
          Home
        </Item>
        <div className="mt-4 space-y-4">
          {state.repos.map((repo) => (
            <div key={repo.id} className="group/repo">
              <div className="group/head flex h-7 items-center gap-0.5 text-[12.5px] font-semibold text-mute">
                <button type="button" onClick={() => toggle(repo.id)} aria-expanded={!collapsed.has(repo.id)} title={repo.path} className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md pl-2 text-left hover:text-ink">
                  <span className="relative grid size-3.5 shrink-0 place-items-center">
                    <FolderGit2 className="size-3.5 transition-opacity group-hover/head:opacity-0" />
                    <ChevronRight className={cn("absolute size-3.5 opacity-0 transition-[opacity,transform] group-hover/head:opacity-100", !collapsed.has(repo.id) && "rotate-90")} />
                  </span>
                  <span className="min-w-0 truncate">{repo.name}</span>
                </button>
                <button type="button" onClick={() => removeRepo(repo.id, repo.name)} aria-label={`Remove ${repo.name}`} className="hidden size-6 place-items-center rounded hover:bg-ink/[0.06] group-hover/head:grid">
                  <X className="size-3.5" />
                </button>
                <button type="button" onClick={() => onNewTask(repo.id)} aria-label={`New task in ${repo.name}`} className="grid size-6 place-items-center rounded hover:bg-ink/[0.06]">
                  <Plus className="size-3.5" />
                </button>
              </div>
              <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", collapsed.has(repo.id) ? "grid-rows-[0fr]" : "grid-rows-[1fr]")}>
                <ul inert={collapsed.has(repo.id)} className="min-h-0 space-y-px overflow-hidden pt-0.5">
                  {state.workspaces
                    .filter((w) => w.repoId === repo.id)
                    .map((w) => (
                      <li key={w.id} className="group/ws relative">
                        <button
                          type="button"
                          onClick={() => onSelect(w.id)}
                          aria-current={active === w.id ? "page" : undefined}
                          title={`${w.branch}\n${w.task}`}
                          className={cn("flex w-full items-start gap-2.5 rounded-md px-2 py-[7px] text-left", active === w.id ? "bg-ink/[0.07]" : "hover:bg-ink/[0.04]")}
                        >
                          <span className="grid h-[18px] shrink-0 place-items-center">
                            <StatusIcon workspace={w} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 group-hover/ws:pr-6">
                              <span className={cn("min-w-0 flex-1 truncate text-[13.5px] leading-[18px]", active === w.id && "font-medium", merged(w) && "text-mute")}>{displayName(w)}</span>
                              <Indicators preview={state.previews[w.id]} share={state.shares[w.id]} />
                            </span>
                            <span className="mt-px block truncate text-[12px] leading-4 text-mute">{subtitle(w)}</span>
                          </span>
                        </button>
                        <button type="button" onClick={() => removeWorkspace(w)} aria-label={`${merged(w) ? "Archive" : "Delete"} ${displayName(w)}`} title={merged(w) ? "Archive" : "Delete"} className={cn("absolute right-1 top-1 hidden size-6 place-items-center rounded text-mute hover:bg-ink/[0.06] group-hover/ws:grid", merged(w) ? "hover:text-ink" : "hover:text-minus")}>
                          {merged(w) ? <Archive className="size-3.5" /> : <Trash2 className="size-3.5" />}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-auto flex items-center gap-2 pt-4">
          <Item onClick={() => window.simpleton.addRepo()} className="min-w-0 flex-1">
            <FolderPlus className="size-4 shrink-0 text-mute" />
            <span className="truncate">Add repository</span>
          </Item>
          <ThemePicker value={state.theme} />
        </div>
        <UserMenu user={user} />
      </nav>
    </aside>
  );
}
