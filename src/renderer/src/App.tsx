import { useState } from "react";
import { Home } from "@/components/Home";
import { Login } from "@/components/Login";
import { Sidebar } from "@/components/Sidebar";
import { WorkspaceView } from "@/components/WorkspaceView";
import { useAppState } from "@/lib/useAppState";
import { useAuth } from "@/lib/useAuth";

export function App() {
  const state = useAppState();
  const auth = useAuth();
  const [active, setActive] = useState("home");
  const [repoId, setRepoId] = useState<string>();

  if (!state || !auth) return null;
  if (auth.status === "loading") return <div className="drag h-full bg-surface" />;
  if (auth.status !== "signed-in" || !auth.user) return <Login auth={auth} />;

  const workspace = state.workspaces.find((w) => w.id === active);

  const newTask = (id: string) => {
    setRepoId(id);
    setActive("home");
  };

  return (
    <div className="flex h-full">
      <Sidebar state={state} user={auth.user} active={workspace ? active : "home"} onSelect={setActive} onNewTask={newTask} />
      <main className="min-w-0 flex-1 bg-surface">
        {workspace ? (
          <WorkspaceView key={workspace.id} workspace={workspace} preview={state.previews[workspace.id]} share={state.shares[workspace.id]} />
        ) : (
          <div className="flex h-full flex-col">
            <div className="drag h-12 shrink-0" />
            <div className="min-h-0 flex-1">
              <Home state={state} repoId={repoId} onOpen={setActive} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
