import { ChevronRight, FolderPlus } from "lucide-react";
import type { AppState, Workspace } from "@shared/types";
import { Composer } from "@/components/Composer";
import { Dot, Mark, primary } from "@/components/ui";
import { agents, cn, homeGroups, statuses } from "@/lib/utils";

export function Home({ state, onOpen }: { state: AppState; onOpen: (id: string) => void }) {
  if (!state.repos.length) {
    return (
      <div className="grid h-full place-items-center">
        <div className="flex flex-col items-center">
          <Mark size={44} />
          <p className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">Add a repository to start</p>
          <button type="button" onClick={() => window.simpleton.addRepo()} className={cn(primary, "mt-6 h-9 px-4 text-[13.5px]")}>
            <FolderPlus className="size-4" />
            Add repository
          </button>
        </div>
      </div>
    );
  }

  const repoName = (w: Workspace) => state.repos.find((r) => r.id === w.repoId)?.name ?? "";

  return (
    <div className="h-full overflow-y-auto px-10 pb-10 pt-4">
      <div className="mx-auto max-w-[640px]">
        <p className="text-[22px] font-semibold tracking-[-0.02em]">What should we work on?</p>
        <div className="mt-4">
          <Composer repos={state.repos} onCreated={(w) => onOpen(w.id)} />
        </div>
        <div className="mt-8 space-y-5">
          {homeGroups.map((status) => {
            const items = state.workspaces.filter((w) => w.status === status);
            if (!items.length) return null;
            return (
              <section key={status}>
                <p className="flex items-center gap-2 text-[13px] font-semibold">
                  <Dot className={statuses[status].dot} />
                  {statuses[status].label}
                  <span className="font-normal text-mute">{items.length}</span>
                </p>
                <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-raised">
                  {items.map((w) => (
                    <li key={w.id}>
                      <button type="button" onClick={() => onOpen(w.id)} className="group flex w-full items-center gap-3 py-2 pl-3.5 pr-3 text-left hover:bg-panel">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium">
                            {w.branch}
                            <span className="ml-2 font-normal text-mute">{repoName(w)}</span>
                          </p>
                          <p className="truncate text-[12.5px] text-mute">
                            {agents[w.agent]} · {w.task}
                          </p>
                        </div>
                        <ChevronRight className="size-4 text-ink/25 group-hover:text-mute" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
