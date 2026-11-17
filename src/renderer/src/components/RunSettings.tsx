import { Check, ChevronDown, ChevronLeft, ChevronRight, Cpu, Gauge, ShieldCheck, type LucideIcon } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { defaultModes, modes, type Agent, type AgentSettings } from "@shared/types";
import { useModels } from "@/lib/useModels";
import { cn } from "@/lib/utils";

export type Choice = {
  label: string;
  icon: LucideIcon;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  inSummary?: boolean;
};

const effortLabels: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
  ultra: "Ultra",
};

export function useAgentChoices(agent: Agent, value: AgentSettings, onChange: (value: AgentSettings) => void): Choice[] {
  const catalog = useModels();
  const choices: Choice[] = [];

  if (catalog) {
    const models = catalog.models[agent];
    const defaults = catalog.defaults[agent];
    const model = value.model ?? defaults.model ?? "";
    const selected = models.find((m) => m.id === model);
    const efforts = selected?.efforts.length ? selected.efforts : [...new Set(models.flatMap((m) => m.efforts))];
    const defaultEffort = defaults.effort ?? selected?.defaultEffort;
    const effort = value.effort ?? defaultEffort ?? "";

    const modelOptions = models.map((m) => ({ value: m.id, label: m.label }));
    if (!model) modelOptions.unshift({ value: "", label: "Default" });
    else if (!selected) modelOptions.unshift({ value: model, label: model });

    const effortOptions = efforts.map((e) => ({ value: e, label: effortLabels[e] ?? e }));
    if (!effort) effortOptions.unshift({ value: "", label: "Default" });
    else if (!efforts.includes(effort)) effortOptions.unshift({ value: effort, label: effortLabels[effort] ?? effort });

    choices.push({
      label: "Model",
      icon: Cpu,
      value: model,
      options: modelOptions,
      onChange: (id) => {
        const next = models.find((m) => m.id === id);
        const keepEffort = value.effort && (!next?.efforts.length || next.efforts.includes(value.effort));
        onChange({ ...value, model: id && id !== defaults.model ? id : undefined, effort: keepEffort ? value.effort : undefined });
      },
    });

    if (effortOptions.length > 0) {
      choices.push({
        label: "Effort",
        icon: Gauge,
        value: effort,
        options: effortOptions,
        onChange: (e) => onChange({ ...value, effort: e && e !== defaultEffort ? e : undefined }),
      });
    }
  }

  const mode = value.mode || defaultModes[agent];
  const modeOptions = modes[agent].map((m) => ({ value: m.id, label: m.label }));
  if (!modeOptions.some((o) => o.value === mode)) modeOptions.unshift({ value: mode, label: mode });
  choices.push({
    label: "Mode",
    icon: ShieldCheck,
    value: mode,
    options: modeOptions,
    onChange: (m) => onChange({ ...value, mode: m }),
    inSummary: mode !== defaultModes[agent],
  });

  return choices;
}

const labelOf = (c: Choice) => c.options.find((o) => o.value === c.value)?.label ?? c.value;

const row = "flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2 text-left text-[13px] outline-none transition-colors hover:bg-ink/[0.06] focus-visible:bg-ink/[0.06]";

export function RunSettings({ choices, side = "bottom" }: { choices: Choice[]; side?: "top" | "bottom" }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const [back, setBack] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = (refocus = false) => {
    setOpen(false);
    setView(null);
    setBack(false);
    if (refocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const items = panel.current?.querySelectorAll<HTMLButtonElement>("[data-item]");
    const current = panel.current?.querySelector<HTMLButtonElement>("[data-current]");
    (current ?? items?.[0])?.focus();
  }, [open, view]);

  const goBack = () => {
    setView(null);
    setBack(true);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [...(panel.current?.querySelectorAll<HTMLButtonElement>("[data-item]") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (e.key === "ArrowRight" && !view && index >= 0) {
      e.preventDefault();
      items[index].click();
    } else if ((e.key === "ArrowLeft" || e.key === "Backspace") && view) {
      e.preventDefault();
      goBack();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (view) goBack();
      else close(true);
    }
  };

  const summary = choices.filter((c) => c.inSummary !== false);
  const active = choices.find((c) => c.label === view);

  return (
    <div ref={root} className="relative min-w-0">
      <button
        ref={trigger}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "group flex h-7 max-w-full items-center gap-1 rounded-[7px] pl-2 pr-1.5 text-[12.5px] outline-none transition-colors hover:bg-ink/[0.05] focus-visible:bg-ink/[0.05]",
          open && "bg-ink/[0.05]",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          {summary.map((c, i) => (
            <Fragment key={c.label}>
              {i > 0 && <span className="text-ink/20">·</span>}
              <span className={cn("truncate", i === 0 ? "font-medium text-ink/85" : "text-soft")}>{labelOf(c)}</span>
            </Fragment>
          ))}
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-mute transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && (
        <div
          ref={panel}
          role="menu"
          onKeyDown={onKeyDown}
          className={cn(
            "absolute left-0 z-50 w-[272px] rounded-[11px] border border-ink/[0.08] bg-menu p-1 shadow-[0_16px_40px_-8px_rgba(0,0,0,0.22),0_4px_10px_-2px_rgba(0,0,0,0.08)] animate-pop",
            side === "top" ? "bottom-full mb-1.5 origin-bottom-left" : "top-full mt-1.5 origin-top-left",
          )}
        >
          {active ? (
            <div key={active.label} className="animate-slide-in">
              <button type="button" data-item onClick={goBack} className={cn(row, "h-7 gap-1 px-1.5 text-[12px] font-medium text-mute hover:text-ink")}>
                <ChevronLeft className="size-3.5" />
                {active.label}
              </button>
              <div className="mx-1 my-1 h-px bg-ink/[0.06]" />
              <div className="max-h-[300px] overflow-y-auto">
                {active.options.map((o) => {
                  const selected = o.value === active.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      data-item
                      data-current={selected || undefined}
                      onClick={() => {
                        active.onChange(o.value);
                        goBack();
                      }}
                      className={cn(row, selected ? "text-ink" : "text-soft hover:text-ink")}
                    >
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {selected && <Check className="size-3.5 shrink-0 text-ink" strokeWidth={2.25} />}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div key="root" className={back ? "animate-slide-back" : undefined}>
              {choices.map((c) => {
                const Icon = c.icon;
                return (
                  <button key={c.label} type="button" role="menuitem" data-item onClick={() => setView(c.label)} className={cn(row, "group/row text-ink")}>
                    <Icon className="size-[15px] shrink-0 text-mute" strokeWidth={1.75} />
                    <span className="shrink-0">{c.label}</span>
                    <span className="min-w-0 flex-1 truncate text-right text-mute">{labelOf(c)}</span>
                    <ChevronRight className="size-3.5 shrink-0 text-ink/25 group-hover/row:text-mute" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
