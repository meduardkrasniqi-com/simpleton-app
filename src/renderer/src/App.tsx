import { useCallback, useEffect, useState } from "react";
import { Home } from "@/components/Home";
import { Login } from "@/components/Login";
import { NewTask } from "@/components/NewTask";
import { Reports } from "@/components/Reports";
import { Settings } from "@/components/Settings";
import { Sidebar } from "@/components/Sidebar";
import { WorkspaceView } from "@/components/WorkspaceView";
import { useAppState } from "@/lib/useAppState";
import { useAuth } from "@/lib/useAuth";
import { useReports } from "@/lib/useReports";

export function App() {
  const state = useAppState();
  const auth = useAuth();
  const { reports, unread, markSeen } = useReports();
  const [active, setActive] = useState("home");
  const [creating, setCreating] = useState<string | null>(null);
  const closeNewTask = useCallback(() => setCreating(null), []);

  useEffect(() => window.simpleton.onOpenSettings(() => setActive("settings")), []);

  if (!state || !auth) return null;
  if (auth.status === "loading") return <div className="drag h-full bg-surface" />;
  if (auth.status !== "signed-in" || !auth.user) return <Login auth={auth} />;

  const workspace = state.workspaces.find((w) => w.id === active);
  const page = workspace ? active : active === "settings" || active === "reports" ? active : "home";

  return (
    <div className="flex h-full">
      <Sidebar state={state} user={auth.user} active={page} unread={unread} onSelect={setActive} onNewTask={setCreating} />
      <main className="min-w-0 flex-1 bg-surface">
        {workspace ? (
          <WorkspaceView key={workspace.id} workspace={workspace} preview={state.previews[workspace.id]} install={state.installs[workspace.id]} share={state.shares[workspace.id]} />
        ) : page === "settings" ? (
          <Settings state={state} />
        ) : page === "reports" ? (
          reports && <Reports data={reports} onSeen={markSeen} />
        ) : (
          <div className="flex h-full flex-col">
            <div className="drag h-12 shrink-0" />
            <div className="min-h-0 flex-1">
              <Home state={state} onOpen={setActive} />
            </div>
          </div>
        )}
      </main>
      {creating && (
        <NewTask
          state={state}
          repoId={creating}
          onClose={closeNewTask}
          onCreated={(w) => {
            setCreating(null);
            setActive(w.id);
          }}
        />
      )}
    </div>
  );
}
