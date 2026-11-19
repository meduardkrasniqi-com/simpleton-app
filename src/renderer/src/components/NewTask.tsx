import { useEffect } from "react";
import type { AppState, Workspace } from "@shared/types";
import { Composer } from "@/components/Composer";

export function NewTask({ state, repoId, groupId, onClose, onCreated }: { state: AppState; repoId: string; groupId?: string; onClose: () => void; onCreated: (workspace: Workspace) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="no-drag fixed inset-0 z-50 flex animate-fade items-center justify-center bg-black/20 p-6 dark:bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="New task" className="w-[min(720px,100%)] animate-pop rounded-xl shadow-[0_24px_64px_-12px_rgba(0,0,0,0.3),0_4px_12px_rgba(0,0,0,0.08)]">
        <Composer state={state} repoId={repoId} groupId={groupId} tall onCreated={onCreated} />
      </div>
    </div>
  );
}
