import { Check, LoaderCircle, RotateCw, X } from "lucide-react";
import type { SetupStep, Workspace } from "@shared/types";
import { outline, primary } from "@/components/ui";
import { agents, cn } from "@/lib/utils";

const order: SetupStep[] = ["fetch", "worktree", "env", "agent"];

function label(step: SetupStep, workspace: Workspace) {
  if (step === "fetch") return workspace.base ? `Fetched ${workspace.base}` : "Fetching latest from origin";
  if (step === "worktree") return "Creating worktree";
  if (step === "env") return "Copying environment files";
  return `Starting ${agents[workspace.agent]}`;
}

export function WorkspaceSetup({ workspace }: { workspace: Workspace }) {
  const setup = workspace.setup ?? { step: "agent" as const };
  const current = order.indexOf(setup.step);
  const failed = !!setup.error;

  const remove = () => {
    if (confirm(`Delete ${workspace.branch}?`)) window.simpleton.removeWorkspace(workspace.id);
  };

  return (
    <div className="mt-6">
      <ol className="space-y-0.5">
        {order.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step} className={cn("flex h-7 items-center gap-2.5 text-[13.5px] transition-colors", done ? "text-soft" : active ? (failed ? "text-minus" : "text-ink") : "text-mute/60")}>
              <span className="grid size-4 shrink-0 place-items-center">
                {done ? (
                  <Check className="size-3.5 text-ready" strokeWidth={2.5} />
                ) : active ? (
                  failed ? (
                    <X className="size-3.5" strokeWidth={2.5} />
                  ) : (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  )
                ) : (
                  <span className="size-1.5 rounded-full bg-current" />
                )}
              </span>
              <span className="truncate">{label(step, workspace)}</span>
              {step === "worktree" && (done || active) && <span className="min-w-0 truncate font-mono text-[12px] text-mute">{workspace.branch}</span>}
            </li>
          );
        })}
      </ol>
      {failed && (
        <div className="ml-[26px] mt-3">
          <pre className="selectable max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-stage px-3 py-2 font-mono text-[12px] leading-[1.5] text-soft">{setup.error}</pre>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => window.simpleton.retrySetup(workspace.id)} className={cn(primary, "h-7 px-2.5 text-[12.5px]")}>
              <RotateCw className="size-3.5" />
              Retry
            </button>
            <button type="button" onClick={remove} className={cn(outline, "h-7 px-2.5 text-[12.5px]")}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
