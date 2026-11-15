import type { Agent, AgentSettings } from "@shared/types";
import { Select } from "@/components/ui";
import { useModels } from "@/lib/useModels";

const effortLabels: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
  ultra: "Ultra",
};

export function ModelPicker({ agent, value, onChange }: { agent: Agent; value: AgentSettings; onChange: (value: AgentSettings) => void }) {
  const catalog = useModels();
  if (!catalog) return null;

  const models = catalog.models[agent];
  const defaults = catalog.defaults[agent];
  const model = value.model ?? defaults.model ?? "";
  const selected = models.find((m) => m.id === model);
  const efforts = selected?.efforts.length ? selected.efforts : [...new Set(models.flatMap((m) => m.efforts))];
  const defaultEffort = defaults.effort ?? selected?.defaultEffort;
  const effort = value.effort ?? defaultEffort ?? "";

  const modelOptions = models.map((m) => ({ value: m.id, label: m.label }));
  if (!model) modelOptions.unshift({ value: "", label: "Default model" });
  else if (!selected) modelOptions.unshift({ value: model, label: model });

  const effortOptions = efforts.map((e) => ({ value: e, label: effortLabels[e] ?? e }));
  if (!effort) effortOptions.unshift({ value: "", label: "Default effort" });
  else if (!efforts.includes(effort)) effortOptions.unshift({ value: effort, label: effortLabels[effort] ?? effort });

  const setModel = (id: string) => {
    const next = models.find((m) => m.id === id);
    const keepEffort = value.effort && (!next?.efforts.length || next.efforts.includes(value.effort));
    onChange({ model: id && id !== defaults.model ? id : undefined, effort: keepEffort ? value.effort : undefined });
  };

  const setEffort = (e: string) => onChange({ ...value, effort: e && e !== defaultEffort ? e : undefined });

  return (
    <>
      <Select value={model} onChange={setModel} options={modelOptions} />
      {effortOptions.length > 0 && <Select value={effort} onChange={setEffort} options={effortOptions} />}
    </>
  );
}
