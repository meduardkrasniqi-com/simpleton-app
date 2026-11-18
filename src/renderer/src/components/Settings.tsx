import { Bell, Camera, ChevronsUpDown, FolderGit2, Monitor, Moon, Sun } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import type { Agent, AppState, Theme } from "@shared/types";
import { useAgentChoices, type Choice } from "@/components/RunSettings";
import { chime } from "@/lib/chime";
import { useModels } from "@/lib/useModels";
import { agents, cn } from "@/lib/utils";

const tabs = [
  { id: "appearance", label: "Appearance" },
  { id: "agents", label: "Agents" },
  { id: "repositories", label: "Repositories" },
] as const;

type Tab = (typeof tabs)[number]["id"];

const tabKey = "simpleton.settings.tab";

function readTab(): Tab {
  try {
    const saved = localStorage.getItem(tabKey);
    return tabs.find((t) => t.id === saved)?.id ?? "appearance";
  } catch {
    return "appearance";
  }
}

export function Settings({ state }: { state: AppState }) {
  const [tab, setTabState] = useState<Tab>(readTab);

  const setTab = (next: Tab) => {
    setTabState(next);
    try {
      localStorage.setItem(tabKey, next);
    } catch {
      return;
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="titlebar drag h-12 shrink-0" />
      <div className="min-h-0 flex-1 overflow-y-auto px-10 pb-10 pt-4">
        <div className="mx-auto max-w-[640px]">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Settings</h1>
          <div role="tablist" aria-label="Settings" className="mt-5 flex gap-5 border-b border-line">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative -mb-px h-9 text-[13.5px] transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-[1.5px] after:rounded-full",
                  tab === t.id ? "font-medium text-ink after:bg-ink" : "text-mute hover:text-ink",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div key={tab} role="tabpanel" className="animate-rise pt-7">
            {tab === "appearance" ? <Appearance theme={state.theme} /> : tab === "agents" ? <Agents state={state} /> : <Repositories state={state} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-ink" : "bg-ink/[0.15]")}>
      <span className={cn("absolute top-0.5 left-0.5 size-4 rounded-full bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform", on && "translate-x-4")} />
    </button>
  );
}

function Section({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="mb-8 last:mb-0">
      <h2 className="mb-3 flex items-baseline gap-2 text-[13px] font-semibold">
        {title}
        {aside && <span className="font-mono text-[11.5px] font-normal text-mute">{aside}</span>}
      </h2>
      {children}
    </section>
  );
}

const palettes = {
  light: { bg: "#ffffff", side: "#f4f4f5", bar: "#e4e4e7", ink: "#0a0a0a", box: "#ffffff", line: "#e4e4e7" },
  dark: { bg: "#161616", side: "#1c1c1c", bar: "#2e2e2e", ink: "#ededed", box: "#1f1f1f", line: "#2e2e2e" },
};

function Window({ palette, style }: { palette: (typeof palettes)["light"]; style?: CSSProperties }) {
  return (
    <div className="absolute inset-0 flex" style={{ background: palette.bg, ...style }}>
      <div className="flex w-[30%] flex-col gap-[5px] px-[7px] pt-[14px]" style={{ background: palette.side, borderRight: `1px solid ${palette.line}` }}>
        <span className="h-[4px] w-[70%] rounded-full" style={{ background: palette.bar }} />
        <span className="h-[4px] w-[85%] rounded-full" style={{ background: palette.bar }} />
        <span className="h-[4px] w-[55%] rounded-full" style={{ background: palette.bar }} />
      </div>
      <div className="flex flex-1 flex-col px-[10px] pt-[16px]">
        <span className="h-[5px] w-[55%] rounded-full" style={{ background: palette.ink, opacity: 0.85 }} />
        <span className="mt-[8px] h-[26px] rounded-[4px]" style={{ background: palette.box, border: `1px solid ${palette.line}` }} />
        <span className="mt-[8px] h-[4px] w-[70%] rounded-full" style={{ background: palette.bar }} />
        <span className="mt-[4px] h-[4px] w-[45%] rounded-full" style={{ background: palette.bar }} />
      </div>
    </div>
  );
}

const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

function Appearance({ theme }: { theme: Theme }) {
  return (
    <Section title="Theme">
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
        {themes.map(({ value, label, icon: Icon }) => {
          const selected = theme === value;
          return (
            <button key={value} type="button" role="radio" aria-checked={selected} onClick={() => window.simpleton.setTheme(value)} className="group text-left outline-none">
              <span
                className={cn(
                  "relative block aspect-[16/10] overflow-hidden rounded-[10px] transition-shadow",
                  selected ? "shadow-[0_0_0_2px_var(--color-ink)]" : "shadow-[0_0_0_1px_var(--color-line)] group-hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-ink)_25%,transparent)] group-focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-ink)_40%,transparent)]",
                )}
              >
                <Window palette={palettes[value === "dark" ? "dark" : "light"]} />
                {value === "system" && <Window palette={palettes.dark} style={{ clipPath: "polygon(60% 0, 100% 0, 100% 100%, 40% 100%)" }} />}
              </span>
              <span className={cn("mt-2 flex items-center gap-1.5 text-[13px]", selected ? "font-medium text-ink" : "text-soft")}>
                <Icon className="size-3.5" />
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

function Select({ choice }: { choice: Choice }) {
  return (
    <div className="relative">
      <select
        value={choice.value}
        onChange={(e) => choice.onChange(e.target.value)}
        aria-label={choice.label}
        className="h-8 w-[200px] cursor-default appearance-none truncate rounded-[7px] border border-ink/[0.09] bg-raised pl-2.5 pr-7 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.05)] outline-none transition-colors hover:border-ink/[0.16] focus-visible:border-ink/30"
      >
        {choice.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-mute" />
    </div>
  );
}

function AgentDefaults({ agent, state, version }: { agent: Agent; state: AppState; version?: string }) {
  const choices = useAgentChoices(agent, state.defaults[agent], (settings) => window.simpleton.setAgentDefaults(agent, settings));
  return (
    <Section title={agents[agent]} aside={version}>
      <div className="divide-y divide-line rounded-xl border border-line bg-raised">
        {choices.map((choice) => {
          const Icon = choice.icon;
          return (
            <div key={choice.label} className="flex h-12 items-center gap-3 px-4">
              <Icon className="size-[15px] shrink-0 text-mute" strokeWidth={1.75} />
              <span className="flex-1 text-[13.5px]">{choice.label}</span>
              <Select choice={choice} />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Agents({ state }: { state: AppState }) {
  const catalog = useModels();
  const list = Object.keys(agents) as Agent[];
  return (
    <>
      <Section title="Default agent">
        <div role="radiogroup" aria-label="Default agent" className="inline-flex rounded-[9px] bg-ink/[0.05] p-[3px]">
          {list.map((agent) => (
            <button
              key={agent}
              type="button"
              role="radio"
              aria-checked={state.agent === agent}
              onClick={() => window.simpleton.setDefaultAgent(agent)}
              className={cn("h-7 rounded-[7px] px-3.5 text-[13px] transition-colors", state.agent === agent ? "bg-raised font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "text-mute hover:text-ink")}
            >
              {agents[agent]}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Behavior">
        <div className="divide-y divide-line rounded-xl border border-line bg-raised">
          <label className="flex h-12 cursor-default items-center gap-3 px-4">
            <Camera className="size-[15px] shrink-0 text-mute" strokeWidth={1.75} />
            <span className="flex-1 text-[13.5px]">Screenshot visual changes</span>
            <Switch on={state.screenshots} label="Screenshot visual changes" onChange={(on) => window.simpleton.setScreenshots(on)} />
          </label>
          <label className="flex h-12 cursor-default items-center gap-3 px-4">
            <Bell className="size-[15px] shrink-0 text-mute" strokeWidth={1.75} />
            <span className="flex-1 text-[13.5px]">Play a sound when an agent finishes</span>
            <Switch
              on={state.sound}
              label="Play a sound when an agent finishes"
              onChange={(on) => {
                if (on) chime();
                window.simpleton.setSound(on);
              }}
            />
          </label>
        </div>
      </Section>
      {list.map((agent) => (
        <AgentDefaults key={agent} agent={agent} state={state} version={catalog?.versions[agent]} />
      ))}
    </>
  );
}

function Repositories({ state }: { state: AppState }) {
  if (!state.repos.length) return <p className="text-[13.5px] text-mute">No repositories yet</p>;
  return (
    <div className="divide-y divide-line rounded-xl border border-line bg-raised">
      {state.repos.map((repo) => {
        const on = repo.worktrees !== false;
        return (
          <div key={repo.id} className="flex h-14 items-center gap-3 px-4">
            <FolderGit2 className="size-[15px] shrink-0 text-mute" strokeWidth={1.75} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px]">{repo.name}</span>
              <span className="block truncate font-mono text-[11.5px] text-mute">{repo.path}</span>
            </span>
            <span className="shrink-0 text-[12.5px] text-mute">{on ? "New worktree per task" : "Current branch"}</span>
            <Switch on={on} label={`New worktree per task in ${repo.name}`} onChange={(next) => window.simpleton.setRepoWorktrees(repo.id, next)} />
          </div>
        );
      })}
    </div>
  );
}
