import { AppWindow, Archive, ChartNoAxesColumn, ChevronRight, Folder, FolderGit2, FolderOpen, FolderPlus, House, Link, LogOut, Plus, Settings, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { AppState, Group, Preview, Share, User, Workspace } from "@shared/types";
import { ResizeHandle, useWidth } from "@/components/Resizer";
import { StatusIcon } from "@/components/ui";
import { cn, displayName } from "@/lib/utils";

const merged = (w: Workspace) => w.status === "merged" || w.prState === "merged";

const row = "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13.5px]";

function Item({ children, active, onClick, className }: { children: ReactNode; active?: boolean; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={cn(row, active ? "bg-ink/[0.07] font-medium" : "hover:bg-ink/[0.04]", className)}>
      {children}
    </button>
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
    <div ref={ref} className="relative mt-px">
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
          <AppWindow className={cn("size-3.5 text-mute", preview.state !== "running" && "animate-pulse")} />
        </span>
      )}
      {share && (
        <span title={share.status === "live" ? `Shared at ${share.url.replace("https://", "")}` : share.status === "error" ? "Share link offline" : "Share link connecting"}>
          <Link className={cn("size-3.5", share.status === "error" ? "text-minus" : "text-mute", share.status === "connecting" && "animate-pulse")} />
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

type Dragged = { kind: "repo" | "group" | "workspace"; id: string; repoId: string };

type Where = "before" | "after" | "inside";

type Target = { kind: Dragged["kind"]; id: string; where: Where };

function Marker({ where }: { where?: Where }) {
  if (where === "before") return <span className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded-full bg-ask" />;
  if (where === "after") return <span className="pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-ask" />;
  if (where === "inside") return <span className="pointer-events-none absolute inset-0 rounded-md ring-[1.5px] ring-inset ring-ask" />;
  return null;
}

function NameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name?.trim() || null);
  };
  return (
    <input
      ref={ref}
      defaultValue={initial}
      aria-label="Group name"
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(e.currentTarget.value);
        if (e.key === "Escape") finish(null);
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
      className="h-6 min-w-0 flex-1 rounded border border-line bg-surface px-1.5 text-[13px] font-medium text-ink outline-none focus:border-ask"
    />
  );
}

function half(e: DragEvent<HTMLElement>): Where {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function move<T extends { id: string }>(items: T[], id: string, target: string | null, where: Where, change?: (item: T) => T) {
  const item = items.find((x) => x.id === id);
  if (!item) return items;
  const rest = items.filter((x) => x.id !== id);
  const next = change ? change(item) : item;
  const index = target ? rest.findIndex((x) => x.id === target) : -1;
  if (index === -1) return [...rest, next];
  rest.splice(where === "after" ? index + 1 : index, 0, next);
  return rest;
}

export function Sidebar({ state, user, active, unread, unreadChats, onSelect, onNewTask }: { state: AppState; user: User; active: string; unread: boolean; unreadChats: Set<string>; onSelect: (id: string) => void; onNewTask: (repoId: string, groupId?: string) => void }) {
  const { width, resize, reset } = useWidth(
    "simpleton.width.left",
    () => 260,
    200,
    () => 420,
  );

  const { collapsed, toggle } = useCollapsed();
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [naming, setNaming] = useState<{ repoId: string } | { groupId: string } | null>(null);

  const removeWorkspace = (w: Workspace) => {
    const warning = w.direct ? `Delete ${displayName(w)}? Your files on ${w.branch} stay as they are.` : `Delete ${displayName(w)}? The worktree and branch ${w.branch} will be removed.`;
    if (merged(w) || confirm(warning)) window.simpleton.removeWorkspace(w.id);
  };

  const removeRepo = (id: string, name: string) => {
    if (confirm(`Remove ${name} and delete all of its workspaces?`)) window.simpleton.removeRepo(id);
  };

  const groupIds = new Set(state.groups.map((g) => g.id));
  const groupOf = (w: Workspace) => (w.groupId && groupIds.has(w.groupId) ? w.groupId : undefined);

  const start = (e: DragEvent<HTMLElement>, item: Dragged) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.id);
    setDragged(item);
  };

  const end = () => {
    setDragged(null);
    setTarget(null);
  };

  const accepts = (kind: Dragged["kind"], repoId: string) => {
    if (!dragged) return null;
    if (dragged.kind === "repo") return kind === "repo" ? "edge" : null;
    if (dragged.repoId !== repoId) return null;
    if (dragged.kind === "group") return kind === "group" ? "edge" : null;
    return kind === "workspace" ? "edge" : "inside";
  };

  const over = (e: DragEvent<HTMLElement>, kind: Dragged["kind"], id: string, repoId: string) => {
    const mode = accepts(kind, repoId);
    if (!mode || !dragged || dragged.id === id) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const where = mode === "inside" ? "inside" : half(e);
    if (target?.id !== id || target.where !== where) setTarget({ kind, id, where });
  };

  const drop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const item = dragged;
    const at = target;
    end();
    if (!item || !at) return;
    if (item.kind === "repo") {
      window.simpleton.arrange({ repos: move(state.repos, item.id, at.id, at.where).map((r) => r.id) });
    } else if (item.kind === "group") {
      window.simpleton.arrange({ groups: move(state.groups, item.id, at.id, at.where).map((g) => g.id) });
    } else {
      const groupId = at.kind === "group" ? at.id : at.kind === "repo" ? undefined : groupOf(state.workspaces.find((w) => w.id === at.id)!);
      const next = move(state.workspaces, item.id, at.kind === "workspace" ? at.id : null, at.where, (w) => ({ ...w, groupId }));
      window.simpleton.arrange({ workspaces: next.map((w) => ({ id: w.id, groupId: w.groupId })) });
    }
  };

  const marker = (kind: Dragged["kind"], id: string) => (target?.kind === kind && target.id === id ? target.where : undefined);

  const createGroup = async (repoId: string, name: string | null) => {
    setNaming(null);
    if (!name) return;
    if (collapsed.has(repoId)) toggle(repoId);
    await window.simpleton.createGroup(repoId, name);
  };

  const renameGroup = (group: Group, name: string | null) => {
    setNaming(null);
    if (name && name !== group.name) window.simpleton.renameGroup(group.id, name);
  };

  const workspaceRow = (w: Workspace) => (
    <li
      key={w.id}
      draggable
      onDragStart={(e) => start(e, { kind: "workspace", id: w.id, repoId: w.repoId })}
      onDragEnd={end}
      onDragOver={(e) => over(e, "workspace", w.id, w.repoId)}
      onDrop={drop}
      className={cn("group/ws relative", dragged?.id === w.id && "opacity-40")}
    >
      <button
        type="button"
        onClick={() => onSelect(w.id)}
        aria-current={active === w.id ? "page" : undefined}
        title={`${w.branch}\n${w.task}`}
        className={cn("flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left", active === w.id ? "bg-ink/[0.07]" : "hover:bg-ink/[0.04]")}
      >
        <span className="grid size-4 shrink-0 place-items-center">
          <StatusIcon workspace={w} />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2 group-hover/ws:pr-6">
          <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", active === w.id && "font-medium", unreadChats.has(w.id) && "font-semibold text-ink", merged(w) && "text-mute")}>{displayName(w)}</span>
          <Indicators preview={state.previews[w.id]} share={state.shares[w.id]} />
        </span>
      </button>
      <button type="button" onClick={() => removeWorkspace(w)} aria-label={`${merged(w) ? "Archive" : "Delete"} ${displayName(w)}`} title={merged(w) ? "Archive" : "Delete"} className={cn("absolute right-1 top-1 hidden size-6 place-items-center rounded text-mute hover:bg-ink/[0.06] group-hover/ws:grid", merged(w) ? "hover:text-ink" : "hover:text-minus")}>
        {merged(w) ? <Archive className="size-3.5" /> : <Trash2 className="size-3.5" />}
      </button>
      <Marker where={marker("workspace", w.id)} />
    </li>
  );

  const groupBlock = (group: Group, items: Workspace[]) => {
    const open = !collapsed.has(group.id);
    const renaming = naming && "groupId" in naming && naming.groupId === group.id;
    return (
      <li key={group.id} className={cn(dragged?.id === group.id && "opacity-40")}>
        <div
          draggable={!renaming}
          onDragStart={(e) => start(e, { kind: "group", id: group.id, repoId: group.repoId })}
          onDragEnd={end}
          onDragOver={(e) => over(e, "group", group.id, group.repoId)}
          onDrop={drop}
          className="group/group relative flex h-8 items-center gap-0.5 rounded-md hover:bg-ink/[0.04]"
        >
          {renaming ? (
            <span className="flex min-w-0 flex-1 items-center gap-2.5 pl-2 pr-1">
              <FolderOpen className="size-4 shrink-0 text-soft" />
              <NameInput initial={group.name} onDone={(name) => renameGroup(group, name)} />
            </span>
          ) : (
            <button type="button" onClick={() => toggle(group.id)} onDoubleClick={() => setNaming({ groupId: group.id })} aria-expanded={open} className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-2 text-left">
              <span className="relative grid size-4 shrink-0 place-items-center text-soft">
                {open ? <FolderOpen className="size-4 transition-opacity group-hover/group:opacity-0" /> : <Folder className="size-4 transition-opacity group-hover/group:opacity-0" />}
                <ChevronRight className={cn("absolute size-3.5 opacity-0 transition-[opacity,transform] group-hover/group:opacity-100", open && "rotate-90")} />
              </span>
              <span className="min-w-0 truncate text-[13.5px]">{group.name}</span>
              {!open && items.length > 0 && <span className="shrink-0 text-[12px] tabular-nums text-mute">{items.length}</span>}
            </button>
          )}
          {!renaming && (
            <>
              <button type="button" onClick={() => window.simpleton.removeGroup(group.id)} aria-label={`Remove group ${group.name}`} title="Remove group" className="hidden size-6 place-items-center rounded text-mute hover:bg-ink/[0.06] hover:text-ink group-hover/group:grid">
                <X className="size-3.5" />
              </button>
              <button type="button" onClick={() => onNewTask(group.repoId, group.id)} aria-label={`New task in ${group.name}`} className="mr-1 hidden size-6 place-items-center rounded text-mute hover:bg-ink/[0.06] hover:text-ink group-hover/group:grid">
                <Plus className="size-3.5" />
              </button>
            </>
          )}
          <Marker where={marker("group", group.id)} />
        </div>
        <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <ul inert={!open} className="ml-[15px] min-h-0 space-y-px overflow-hidden border-l border-ink/[0.08] pl-1.5">
            {items.map(workspaceRow)}
          </ul>
        </div>
      </li>
    );
  };

  return (
    <aside className="relative flex shrink-0 flex-col border-r border-ink/[0.06] bg-sidebar" style={{ width }}>
      <ResizeHandle edge="right" width={width} onResize={resize} onReset={reset} />
      <div className="titlebar drag h-12 shrink-0" />
      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 pb-2.5">
        <Item active={active === "home"} onClick={() => onSelect("home")}>
          <House className="size-4 text-mute" />
          Home
        </Item>
        <Item active={active === "reports"} onClick={() => onSelect("reports")} className="mt-px">
          <ChartNoAxesColumn className="size-4 text-mute" />
          <span className="flex-1">Reports</span>
          {unread && active !== "reports" && <span aria-label="New report" className="size-[7px] rounded-full bg-ask" />}
        </Item>
        <Item onClick={() => window.simpleton.addRepo()} className="mt-px">
          <FolderPlus className="size-4 shrink-0 text-mute" />
          <span className="truncate">Add repository</span>
        </Item>
        <div className="mx-2 my-3 h-px bg-ink/[0.06]" />
        <p className="px-2 pb-1 text-[12px] font-medium text-mute">Workspaces</p>
        <div className="space-y-3">
          {state.repos.map((repo) => {
            const owned = state.workspaces.filter((w) => w.repoId === repo.id);
            const groups = state.groups.filter((g) => g.repoId === repo.id);
            const loose = owned.filter((w) => !groupOf(w));
            const adding = naming && "repoId" in naming && naming.repoId === repo.id;
            return (
              <div key={repo.id} className={cn("group/repo", dragged?.id === repo.id && "opacity-40")}>
                <div
                  draggable
                  onDragStart={(e) => start(e, { kind: "repo", id: repo.id, repoId: repo.id })}
                  onDragEnd={end}
                  onDragOver={(e) => over(e, "repo", repo.id, repo.id)}
                  onDrop={drop}
                  className="group/head relative flex h-7 items-center gap-0.5 rounded-md text-[12.5px] font-semibold text-mute"
                >
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
                  <button type="button" onClick={() => setNaming({ repoId: repo.id })} aria-label={`New group in ${repo.name}`} title="New group" className="hidden size-6 place-items-center rounded hover:bg-ink/[0.06] group-hover/head:grid">
                    <FolderPlus className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => onNewTask(repo.id)} aria-label={`New task in ${repo.name}`} className="grid size-6 place-items-center rounded hover:bg-ink/[0.06]">
                    <Plus className="size-3.5" />
                  </button>
                  <Marker where={marker("repo", repo.id)} />
                </div>
                <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", collapsed.has(repo.id) && !adding ? "grid-rows-[0fr]" : "grid-rows-[1fr]")}>
                  <ul inert={collapsed.has(repo.id) && !adding} className="min-h-0 space-y-px overflow-hidden pt-0.5">
                    {adding && (
                      <li className="flex h-8 items-center gap-2.5 pl-2 pr-1">
                        <Folder className="size-4 shrink-0 text-soft" />
                        <NameInput initial="" onDone={(name) => createGroup(repo.id, name)} />
                      </li>
                    )}
                    {groups.map((group) => groupBlock(group, owned.filter((w) => groupOf(w) === group.id)))}
                    {loose.map(workspaceRow)}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-auto pt-4" />
        <Item onClick={() => onSelect("settings")} active={active === "settings"}>
          <Settings className="size-4 shrink-0 text-mute" />
          Settings
        </Item>
        <UserMenu user={user} />
      </nav>
    </aside>
  );
}
