import { FolderGit2, FolderPlus, House, Monitor, Moon, Plus, Sun, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import type { AppState, Theme, Workspace } from "@shared/types";
import { ResizeHandle, useWidth } from "@/components/Resizer";
import { Dot } from "@/components/ui";
import { cn, statuses } from "@/lib/utils";

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

export function Sidebar({ state, active, onSelect, onNewTask }: { state: AppState; active: string; onSelect: (id: string) => void; onNewTask: (repoId: string) => void }) {
  const { width, resize, reset } = useWidth(
    "simpleton.width.left",
    () => 260,
    200,
    () => 420,
  );

  const removeWorkspace = (w: Workspace) => {
    if (confirm(`Delete ${w.branch}? The worktree and branch will be removed.`)) window.simpleton.removeWorkspace(w.id);
  };

  const removeRepo = (id: string, name: string) => {
    if (confirm(`Remove ${name} and delete all of its workspaces?`)) window.simpleton.removeRepo(id);
  };

  return (
    <aside className="relative flex shrink-0 flex-col border-r border-ink/[0.06]" style={{ width }}>
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
              <div className="flex h-7 items-center gap-2 pl-2 text-[12.5px] font-semibold text-mute">
                <FolderGit2 className="size-3.5" />
                <span className="min-w-0 flex-1 truncate" title={repo.path}>
                  {repo.name}
                </span>
                <button type="button" onClick={() => removeRepo(repo.id, repo.name)} aria-label={`Remove ${repo.name}`} className="hidden size-6 place-items-center rounded hover:bg-ink/[0.06] group-hover/repo:grid">
                  <X className="size-3.5" />
                </button>
                <button type="button" onClick={() => onNewTask(repo.id)} aria-label={`New task in ${repo.name}`} className="grid size-6 place-items-center rounded hover:bg-ink/[0.06]">
                  <Plus className="size-3.5" />
                </button>
              </div>
              <ul className="mt-0.5 space-y-px">
                {state.workspaces
                  .filter((w) => w.repoId === repo.id)
                  .map((w) => (
                    <li key={w.id} className="group/ws relative">
                      <Item active={active === w.id} onClick={() => onSelect(w.id)} className="group-hover/ws:pr-8">
                        <Dot className={statuses[w.status].dot} />
                        <span className={cn("min-w-0 flex-1 truncate", w.status === "merged" && "text-mute")}>{w.branch}</span>
                      </Item>
                      <button
                        type="button"
                        onClick={() => removeWorkspace(w)}
                        aria-label={`Delete ${w.branch}`}
                        className="absolute right-1 top-1 hidden size-6 place-items-center rounded text-mute hover:bg-ink/[0.06] hover:text-minus group-hover/ws:grid"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
              </ul>
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
      </nav>
    </aside>
  );
}
