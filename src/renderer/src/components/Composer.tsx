import { ArrowUp, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Agent, Repo, Workspace } from "@shared/types";
import { agents, cn } from "@/lib/utils";

const chip = "relative inline-flex h-7 items-center rounded-md border border-line bg-white text-[12.5px] font-medium text-soft hover:border-black/[0.14]";

function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: { value: T; label: string }[] }) {
  return (
    <span className={chip}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="h-full appearance-none bg-transparent pl-2 pr-6 outline-none">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 size-3.5 text-mute" />
    </span>
  );
}

export function Composer({ repos, repoId, onCreated }: { repos: Repo[]; repoId?: string; onCreated: (workspace: Workspace) => void }) {
  const [task, setTask] = useState("");
  const [repo, setRepo] = useState(repoId ?? repos[0]?.id ?? "");
  const [agent, setAgent] = useState<Agent>("claude-code");
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
      const workspace = await window.simpleton.createWorkspace({ repoId: repo, task, agent });
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
      <div className="rounded-xl border border-black/[0.1] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-within:border-black/[0.2]">
        <textarea ref={input} value={task} onChange={(e) => setTask(e.target.value)} onKeyDown={onKeyDown} placeholder="Describe a task" rows={2} className="block w-full resize-none bg-transparent px-1 text-[14px] leading-[1.5] outline-none placeholder:text-mute" />
        <div className="mt-2 flex items-center gap-2">
          <Select value={repo} onChange={setRepo} options={repos.map((r) => ({ value: r.id, label: r.name }))} />
          <Select value={agent} onChange={setAgent} options={(Object.keys(agents) as Agent[]).map((a) => ({ value: a, label: agents[a] }))} />
          <button type="button" onClick={submit} disabled={!task.trim() || busy} aria-label="Start task" className={cn("ml-auto grid size-7 place-items-center rounded-md bg-ink text-white transition-opacity", (!task.trim() || busy) && "opacity-30")}>
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
      {error && <p className="selectable mt-2 text-[12.5px] text-minus">{error}</p>}
    </div>
  );
}
