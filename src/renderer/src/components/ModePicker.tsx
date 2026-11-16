import { defaultModes, modes, type Agent } from "@shared/types";
import { Select } from "@/components/ui";

const key = (agent: Agent) => `simpleton.mode.${agent}`;

export function lastMode(agent: Agent) {
  try {
    const saved = localStorage.getItem(key(agent));
    return saved && modes[agent].some((m) => m.id === saved) ? saved : defaultModes[agent];
  } catch {
    return defaultModes[agent];
  }
}

export function rememberMode(agent: Agent, mode: string) {
  try {
    localStorage.setItem(key(agent), mode);
  } catch {
    return;
  }
}

export function ModePicker({ agent, value, onChange }: { agent: Agent; value?: string; onChange: (mode: string) => void }) {
  const current = value || defaultModes[agent];
  const options = modes[agent].map((m) => ({ value: m.id, label: m.label }));
  if (!options.some((o) => o.value === current)) options.unshift({ value: current, label: current });
  return <Select value={current} onChange={onChange} options={options} />;
}
