import { FolderGit2, FolderPlus, House, Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import type { AppState } from "@shared/types";
import { Dot } from "@/components/ui";
import { cn, statuses } from "@/lib/utils";

const row = "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13.5px]";

function Item({ children, active, onClick }: { children: ReactNode; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={cn(row, active ? "bg-black/[0.07] font-medium" : "hover:bg-black/[0.04]")}>
      {children}
    </button>
  );
}

export function Sidebar({ state, active, onSelect, onNewTask }: { state: AppState; active: string; onSelect: (id: string) => void; onNewTask: (repoId: string) => void }) {
  const removeRepo = (id: string, name: string) => {
    if (confirm(`Remove ${name} and delete all of its workspaces?`)) window.simpleton.removeRepo(id);
  };

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-black/[0.06]">
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
                <button type="button" onClick={() => removeRepo(repo.id, repo.name)} aria-label={`Remove ${repo.name}`} className="hidden size-6 place-items-center rounded hover:bg-black/[0.06] group-hover/repo:grid">
                  <X className="size-3.5" />
                </button>
                <button type="button" onClick={() => onNewTask(repo.id)} aria-label={`New task in ${repo.name}`} className="grid size-6 place-items-center rounded hover:bg-black/[0.06]">
                  <Plus className="size-3.5" />
                </button>
              </div>
              <ul className="mt-0.5 space-y-px">
                {state.workspaces
                  .filter((w) => w.repoId === repo.id)
                  .map((w) => (
                    <li key={w.id}>
                      <Item active={active === w.id} onClick={() => onSelect(w.id)}>
                        <Dot className={statuses[w.status].dot} />
                        <span className={cn("min-w-0 flex-1 truncate", w.status === "merged" && "text-mute")}>{w.branch}</span>
                      </Item>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-auto pt-4">
          <Item onClick={() => window.simpleton.addRepo()}>
            <FolderPlus className="size-4 text-mute" />
            Add repository
          </Item>
        </div>
      </nav>
    </aside>
  );
}
