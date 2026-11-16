import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Agent, AgentSettings, Repo, Workspace } from "@shared/types";
import { ModelPicker } from "@/components/ModelPicker";
import { lastMode, ModePicker, rememberMode } from "@/components/ModePicker";
import { Select } from "@/components/ui";
import { useModels } from "@/lib/useModels";
import { agents, cn } from "@/lib/utils";

export function Composer({ repos, repoId, onCreated }: { repos: Repo[]; repoId?: string; onCreated: (workspace: Workspace) => void }) {
  const [task, setTask] = useState("");
  const [repo, setRepo] = useState(repoId ?? repos[0]?.id ?? "");
  const [agent, setAgentState] = useState<Agent>("claude-code");
  const [settings, setSettings] = useState<AgentSettings>({});
  const [mode, setModeState] = useState(() => lastMode("claude-code"));

  const setAgent = (next: Agent) => {
    setAgentState(next);
    setSettings({});
    setModeState(lastMode(next));
  };

  const setMode = (next: string) => {
    setModeState(next);
    rememberMode(agent, next);
  };
  const catalog = useModels();
  const agentLabel = (a: Agent) => (catalog?.versions[a] ? `${agents[a]} ${catalog.versions[a]}` : agents[a]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (repoId) setRepo(repoId);
    input.current?.focus();
  }, [repoId]);

  useEffect(() => {
    if (!repos.some((r) => r.id === repo)) setRepo(repos[0]?.id ?? "");
  }, [repos, repo]);

  const submit = async () => {
    if (!task.trim() || !repo || busy) return;
    setBusy(true);
    setError(null);
    try {
      const workspace = await window.simpleton.createWorkspace({ repoId: repo, task, agent, ...settings, mode });
      setTask("");
      onCreated(workspace);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div>
      <div className="rounded-xl border border-ink/[0.1] bg-raised p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-within:border-ink/[0.2]">
        <textarea
          ref={input}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Describe a task"
          rows={2}
          className="block w-full resize-none bg-transparent px-1 text-[14px] leading-[1.5] outline-none placeholder:text-mute"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select value={repo} onChange={setRepo} options={repos.map((r) => ({ value: r.id, label: r.name }))} />
          <Select value={agent} onChange={setAgent} options={(Object.keys(agents) as Agent[]).map((a) => ({ value: a, label: agentLabel(a) }))} />
          <ModePicker agent={agent} value={mode} onChange={setMode} />
          <ModelPicker agent={agent} value={settings} onChange={setSettings} />
          <button
            type="button"
            onClick={submit}
            disabled={!task.trim() || busy}
            aria-label="Start task"
            className={cn("ml-auto grid size-7 place-items-center rounded-md bg-ink text-surface transition-opacity", (!task.trim() || busy) && "opacity-30")}
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
      {error && <p className="selectable mt-2 text-[12.5px] text-minus">{error}</p>}
    </div>
  );
}
