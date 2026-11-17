import { ArrowUp, Bot, FolderGit2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Agent, AgentSettings, Repo, Workspace } from "@shared/types";
import { AttachButton, useAttachments, withAttachments } from "@/components/Attachments";
import { PromptBox } from "@/components/PromptBox";
import { lastMode, rememberMode, RunSettings, useAgentChoices } from "@/components/RunSettings";
import { useModels } from "@/lib/useModels";
import { agents, cn } from "@/lib/utils";

export function Composer({ repos, repoId, tall, onCreated }: { repos: Repo[]; repoId?: string; tall?: boolean; onCreated: (workspace: Workspace) => void }) {
  const [task, setTask] = useState("");
  const [repo, setRepo] = useState(repoId ?? repos[0]?.id ?? "");
  const [agent, setAgentState] = useState<Agent>("claude-code");
  const [settings, setSettingsState] = useState<AgentSettings>(() => ({ mode: lastMode("claude-code") }));

  const setAgent = (next: Agent) => {
    setAgentState(next);
    setSettingsState({ mode: lastMode(next) });
  };

  const setSettings = (next: AgentSettings) => {
    if (next.mode && next.mode !== settings.mode) rememberMode(agent, next.mode);
    setSettingsState(next);
  };
  const catalog = useModels();
  const agentLabel = (a: Agent) => (catalog?.versions[a] ? `${agents[a]} ${catalog.versions[a]}` : agents[a]);
  const agentChoices = useAgentChoices(agent, settings, setSettings);
  const choices = [
    { label: "Repository", icon: FolderGit2, value: repo, options: repos.map((r) => ({ value: r.id, label: r.name })), onChange: setRepo },
    { label: "Agent", icon: Bot, value: agent, options: (Object.keys(agents) as Agent[]).map((a) => ({ value: a, label: agentLabel(a) })), onChange: (a: string) => setAgent(a as Agent), inSummary: false },
    ...agentChoices,
  ];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const attachments = useAttachments();

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
      const workspace = await window.simpleton.createWorkspace({ repoId: repo, task: withAttachments(task, attachments.paths), agent, ...settings });
      setTask("");
      attachments.clear();
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
      <PromptBox
        value={task}
        onChange={setTask}
        onKeyDown={onKeyDown}
        placeholder="Describe a task"
        inputRef={input}
        side="bottom"
        source={`${repo}:${agent}`}
        files={() => window.simpleton.repoFiles(repo)}
        commands={agent === "claude-code" ? () => window.simpleton.commands(agent, repo) : undefined}
        className={tall ? "max-h-[50vh] min-h-[9em]" : "max-h-60 min-h-[3em]"}
        attachments={attachments}
      >
        <div className="-ml-1 mt-2 flex items-center gap-2">
          <AttachButton attachments={attachments} />
          <RunSettings choices={choices} />
          <button
            type="button"
            onClick={submit}
            disabled={!task.trim() || busy}
            aria-label="Start task"
            className={cn("ml-auto grid size-7 shrink-0 place-items-center rounded-md bg-ink text-surface transition-opacity", (!task.trim() || busy) && "opacity-30")}
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </PromptBox>
      {error && <p className="selectable mt-2 text-[12.5px] text-minus">{error}</p>}
    </div>
  );
}
