import { FolderOpen, RotateCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { FileChange, Repo, Workspace } from "@shared/types";
import { Dot, ghost, Stat } from "@/components/ui";
import { agents, cn, statuses, totals } from "@/lib/utils";

export function WorkspaceView({ workspace, repo, onDeleted }: { workspace: Workspace; repo?: Repo; onDeleted: () => void }) {
  const [files, setFiles] = useState<FileChange[] | null>(null);

  const refresh = useCallback(() => {
    window.simpleton
      .changes(workspace.id)
      .then(setFiles)
      .catch(() => setFiles([]));
  }, [workspace.id]);

  useEffect(() => {
    setFiles(null);
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const remove = async () => {
    if (!confirm(`Delete ${workspace.branch}? The worktree and branch will be removed.`)) return;
    await window.simpleton.removeWorkspace(workspace.id);
    onDeleted();
  };

  const t = totals(files ?? []);

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-12 shrink-0 items-center gap-3 border-b border-line px-5">
        <Dot className={statuses[workspace.status].dot} />
        <p className="min-w-0 truncate text-[13.5px] font-semibold">
          {workspace.branch}
          <span className="ml-2 font-normal text-mute">{repo?.name}</span>
        </p>
        <span className="text-[12.5px] text-mute">{agents[workspace.agent]}</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => window.simpleton.reveal(workspace.id)} className={cn(ghost, "h-7 px-2 text-[12.5px]")}>
            <FolderOpen className="size-3.5" />
            Reveal
          </button>
          <button type="button" onClick={remove} aria-label="Delete workspace" className={cn(ghost, "h-7 px-2 hover:text-minus")}>
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-10 py-8">
        <div className="mx-auto max-w-[720px]">
          <p className="selectable ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl bg-stage px-4 py-2.5 text-[14px] leading-[1.5]">{workspace.task}</p>
          <section className="mt-8">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-semibold">Changes</p>
              {files && files.length > 0 && <Stat added={t.added} removed={t.removed} />}
              <button type="button" onClick={refresh} aria-label="Refresh changes" className={cn(ghost, "ml-auto size-7")}>
                <RotateCw className="size-3.5" />
              </button>
            </div>
            {files && files.length > 0 && (
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
                {files.map((f) => (
                  <li key={f.path} className="flex items-center gap-3 px-3.5 py-2">
                    <span className="selectable min-w-0 flex-1 truncate font-mono text-[12.5px]">{f.path}</span>
                    <Stat added={f.added} removed={f.removed} />
                  </li>
                ))}
              </ul>
            )}
            {files && files.length === 0 && <p className="mt-2 text-[13px] text-mute">No changes yet</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
