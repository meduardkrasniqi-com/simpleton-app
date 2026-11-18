import { Check, Copy, RotateCw } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Report, ReportKind, Reports as ReportsData } from "@shared/types";
import { Loader } from "@/components/Loader";
import { ghost, primary } from "@/components/ui";
import { cn } from "@/lib/utils";

const cell = 10;
const gap = 2;
const step = cell + gap;
const gutter = 28;

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const parse = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const shift = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const format = (date: Date, options: Intl.DateTimeFormatOptions) => date.toLocaleDateString("en-US", options);

const runs = (n: number) => `${n} ${n === 1 ? "run" : "runs"}`;

const contributions = (n: number) => `${n} ${n === 1 ? "contribution" : "contributions"}`;

const tones = ["color-mix(in srgb, var(--color-ink) 7%, transparent)", ...[28, 50, 74, 100].map((p) => `color-mix(in srgb, var(--color-ready) ${p}%, transparent)`)];

function useWeeks(ref: RefObject<HTMLDivElement | null>) {
  const [weeks, setWeeks] = useState(40);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWeeks(Math.max(8, Math.min(53, Math.floor((el.clientWidth - gutter + gap) / step))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return weeks;
}

function scale(counts: number[]) {
  const sorted = counts.filter((n) => n > 0).sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.floor((sorted.length - 1) * q)] ?? 0;
  const [q1, q2, q3] = [at(0.25), at(0.5), at(0.75)];
  return (n: number) => (n <= 0 ? 0 : n <= q1 ? 1 : n <= q2 ? 2 : n <= q3 ? 3 : 4);
}

type Hover = { key: string; count: number; col: number; row: number };

function Heatmap({ days, selected, onSelect }: { days: Record<string, number>; selected: string | null; onSelect: (key: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const weeks = useWeeks(ref);
  const [hover, setHover] = useState<Hover | null>(null);
  const today = startOfToday();
  const first = shift(today, -today.getDay() - (weeks - 1) * 7);

  const grid = useMemo(
    () =>
      Array.from({ length: weeks }, (_, col) =>
        Array.from({ length: 7 }, (_, row) => {
          const date = shift(first, col * 7 + row);
          const key = dayKey(date);
          return { date, key, count: days[key] ?? 0, future: date > today };
        }),
      ),
    [weeks, first.getTime(), today.getTime(), days],
  );

  const level = useMemo(() => scale(grid.flat().map((d) => d.count)), [grid]);
  const total = grid.flat().reduce((n, d) => n + d.count, 0);

  const months = grid.flatMap((column, col) => {
    const month = column[0].date.getMonth();
    const previous = col > 0 ? grid[col - 1][0].date.getMonth() : -1;
    return month !== previous ? [{ col, label: format(column[0].date, { month: "short" }) }] : [];
  });
  const labels = months.filter((m, i) => (i === 0 ? (months[1]?.col ?? weeks) - m.col >= 3 : true));

  return (
    <div className="rounded-xl border border-line bg-raised px-4 pb-3 pt-3.5">
      <p className="text-[13px]">
        <span className="font-semibold tabular-nums">{total.toLocaleString("en-US")}</span>
        <span className="text-mute"> {total === 1 ? "contribution" : "contributions"} since {format(first, { month: "long", year: "numeric" })}</span>
      </p>
      <div ref={ref} className="relative mt-3">
        <div className="relative h-4" style={{ marginLeft: gutter }}>
          {labels.map((m) => (
            <span key={m.col} className="absolute top-0 text-[11px] leading-none text-mute" style={{ left: m.col * step }}>
              {m.label}
            </span>
          ))}
        </div>
        <div className="flex">
          <div className="grid shrink-0 text-[10.5px] leading-none text-mute" style={{ width: gutter, gridTemplateRows: `repeat(7, ${cell}px)`, rowGap: gap }}>
            {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
              <span key={i} className="flex items-center">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-flow-col" style={{ gridTemplateRows: `repeat(7, ${cell}px)`, gridAutoColumns: cell, gap }} onPointerLeave={() => setHover(null)}>
            {grid.flatMap((column, col) =>
              column.map((d, row) =>
                d.future ? (
                  <span key={d.key} />
                ) : (
                  <button
                    key={d.key}
                    type="button"
                    disabled={!d.count}
                    onClick={() => onSelect(d.key)}
                    onPointerEnter={() => setHover({ key: d.key, count: d.count, col, row })}
                    onFocus={() => setHover({ key: d.key, count: d.count, col, row })}
                    onBlur={() => setHover(null)}
                    aria-label={`${d.count ? contributions(d.count) : "No contributions"} on ${format(d.date, { weekday: "long", month: "long", day: "numeric" })}`}
                    aria-pressed={selected === d.key}
                    className={cn("rounded-[2.5px] outline-offset-1 disabled:cursor-default", selected === d.key ? "outline-[1.5px] outline-ink outline-solid" : "focus-visible:outline-[1.5px] focus-visible:outline-ink/50 focus-visible:outline-solid")}
                    style={{ background: tones[level(d.count)] }}
                  />
                ),
              ),
            )}
          </div>
        </div>
        {hover && (
          <div
            className={cn("pointer-events-none absolute z-10 -translate-y-full whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[12px] text-surface shadow-[0_4px_12px_rgba(0,0,0,0.15)]", hover.col > weeks - 8 ? "-translate-x-full" : hover.col < 6 ? "" : "-translate-x-1/2")}
            style={{ left: gutter + hover.col * step + (hover.col > weeks - 8 ? cell : hover.col < 6 ? 0 : cell / 2), top: 16 + hover.row * step - 6 }}
          >
            <span className="font-medium">{hover.count ? contributions(hover.count) : "No contributions"}</span>
            <span className="opacity-70"> on {format(parse(hover.key), { weekday: "short", month: "short", day: "numeric" })}</span>
          </div>
        )}
        <div className="mt-2.5 flex items-center justify-end gap-[3px] text-[11px] text-mute">
          <span className="mr-1">Less</span>
          {tones.map((tone) => (
            <span key={tone} className="rounded-[2.5px]" style={{ width: cell, height: cell, background: tone }} />
          ))}
          <span className="ml-1">More</span>
        </div>
      </div>
    </div>
  );
}

function title(report: Pick<Report, "kind" | "start" | "end">) {
  const start = parse(report.start);
  const today = startOfToday();
  if (report.kind === "weekly") {
    const end = parse(report.end);
    const range = start.getMonth() === end.getMonth() ? `${format(start, { month: "short", day: "numeric" })} – ${end.getDate()}` : `${format(start, { month: "short", day: "numeric" })} – ${format(end, { month: "short", day: "numeric" })}`;
    const last = dayKey(shift(today, -(today.getDay() + 7))) === report.start;
    return { main: range, aside: last ? "Last week" : format(start, { year: "numeric" }) !== format(today, { year: "numeric" }) ? format(start, { year: "numeric" }) : undefined };
  }
  const full = format(start, { weekday: "long", month: "short", day: "numeric" });
  if (report.start === dayKey(today)) return { main: "Today", aside: full };
  if (report.start === dayKey(shift(today, -1))) return { main: "Yesterday", aside: full };
  return { main: full };
}

function statLine(report: Report) {
  const { tasks, runs: count, commits, prs, merged } = report.stats;
  return [tasks && `${tasks} ${tasks === 1 ? "task" : "tasks"}`, count && runs(count), commits && `${commits} ${commits === 1 ? "commit" : "commits"}`, prs && `${prs} ${prs === 1 ? "PR" : "PRs"} opened`, merged && `${merged} merged`].filter(Boolean).join(" · ");
}

function IconButton({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={cn(ghost, "size-7 rounded-md p-0 text-mute")}>
      {children}
    </button>
  );
}

function ReportCard({ report, highlighted, cardRef }: { report: Report; highlighted: boolean; cardRef: (el: HTMLElement | null) => void }) {
  const [copied, setCopied] = useState(false);
  const { main, aside } = title(report);
  const writing = report.state === "writing";

  const copy = async () => {
    await navigator.clipboard.writeText([aside && report.kind === "daily" ? aside : main, ...report.bullets.map((b) => `- ${b}`)].join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <article ref={cardRef} className={cn("group scroll-mt-4 rounded-xl border bg-raised px-4 pb-4 pt-3 transition-[border-color,box-shadow]", highlighted ? "border-ink/25 shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-ink)_6%,transparent)]" : "border-line")}>
      <header className="flex h-7 items-center gap-2">
        <h3 className="text-[14px] font-semibold tracking-[-0.01em]">{main}</h3>
        {aside && <span className="text-[12.5px] text-mute">{aside}</span>}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {report.bullets.length > 0 && (
            <IconButton label={copied ? "Copied" : "Copy"} onClick={copy}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </IconButton>
          )}
          <IconButton label="Rewrite" onClick={() => window.simpleton.writeReport(report.kind, report.start)} disabled={writing}>
            <RotateCw className="size-3.5" />
          </IconButton>
        </div>
      </header>
      <p className="text-[12.5px] text-mute">{statLine(report)}</p>
      {writing && !report.bullets.length ? (
        <p className="mt-3 flex items-center gap-2 text-[13.5px]">
          <Loader className="text-mute" />
          <span className="shimmer">Writing report</span>
        </p>
      ) : (
        <ul className={cn("selectable mt-3 space-y-1.5 text-[13.5px] leading-5 transition-opacity", writing && "opacity-40")}>
          {report.bullets.map((bullet, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-[7.5px] size-[5px] shrink-0 rounded-full bg-ink/30" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Pending({ day, count, cardRef }: { day: string; count: number; cardRef: (el: HTMLElement | null) => void }) {
  const { main, aside } = title({ kind: "daily", start: day, end: day });
  return (
    <article ref={cardRef} className="scroll-mt-4 rounded-xl border border-ink/25 bg-raised px-4 py-3 shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-ink)_6%,transparent)]">
      <header className="flex h-7 items-center gap-2">
        <h3 className="text-[14px] font-semibold tracking-[-0.01em]">{main}</h3>
        {aside && <span className="text-[12.5px] text-mute">{aside}</span>}
        <button type="button" onClick={() => window.simpleton.writeReport("daily", day)} className={cn(primary, "ml-auto h-7 px-3 text-[12.5px]")}>
          Write report
        </button>
      </header>
      <p className="text-[12.5px] text-mute">{contributions(count)}</p>
    </article>
  );
}

const kinds: { id: ReportKind; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
];

const tabKey = "simpleton.reports.tab";

function readTab(): ReportKind {
  try {
    return localStorage.getItem(tabKey) === "weekly" ? "weekly" : "daily";
  } catch {
    return "daily";
  }
}

export function Reports({ data, onSeen }: { data: ReportsData; onSeen: () => void }) {
  const [tab, setTabState] = useState<ReportKind>(readTab);
  const [selected, setSelected] = useState<string | null>(null);
  const cards = useRef(new Map<string, HTMLElement>());

  useEffect(onSeen, [onSeen]);

  const setTab = (next: ReportKind) => {
    setTabState(next);
    try {
      localStorage.setItem(tabKey, next);
    } catch {
      return;
    }
  };

  const select = (key: string) => {
    if (selected === key) return setSelected(null);
    setTab("daily");
    setSelected(key);
  };

  useEffect(() => {
    if (selected) cards.current.get(selected)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected, tab]);

  const list = data.reports.filter((r) => r.kind === tab);
  const missing = tab === "daily" && selected && !list.some((r) => r.start === selected) ? selected : null;
  const bind = (key: string) => (el: HTMLElement | null) => {
    if (el) cards.current.set(key, el);
    else cards.current.delete(key);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="titlebar drag h-12 shrink-0" />
      <div className="min-h-0 flex-1 overflow-y-auto px-10 pb-10 pt-4">
        <div className="mx-auto max-w-[640px]">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Reports</h1>
          <div className="mt-5">
            <Heatmap days={data.days} selected={selected} onSelect={select} />
          </div>
          <div role="tablist" aria-label="Report type" className="mt-8 inline-flex rounded-[9px] bg-ink/[0.05] p-[3px]">
            {kinds.map((k) => (
              <button
                key={k.id}
                type="button"
                role="tab"
                aria-selected={tab === k.id}
                onClick={() => setTab(k.id)}
                className={cn("h-7 rounded-[7px] px-3.5 text-[13px] transition-colors", tab === k.id ? "bg-raised font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "text-mute hover:text-ink")}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div key={tab} role="tabpanel" className="mt-4 animate-rise space-y-3">
            {missing && <Pending day={missing} count={data.days[missing] ?? 0} cardRef={bind(missing)} />}
            {list.map((r) => (
              <ReportCard key={r.id} report={r} highlighted={tab === "daily" && selected === r.start} cardRef={bind(r.start)} />
            ))}
            {!list.length && !missing && <p className="py-6 text-center text-[13px] text-mute">No {tab} reports yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
