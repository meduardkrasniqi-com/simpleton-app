import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const brand = ["#ff8a3d", "#6b7bff", "#f0508a"];

export function Loader({ className, colorful, "aria-label": label }: { className?: string; colorful?: boolean; "aria-label"?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("loader size-3.5 shrink-0", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path className="loader-track" d="M8 6.5v11M16 8.5c0 4.5-8 3.5-8 9" />
      <path className="loader-flow" d="M8 6.5v11" pathLength={1} />
      <path className="loader-flow" d="M16 8.5c0 4.5-8 3.5-8 9" pathLength={1} />
      <circle className="loader-node" cx="8" cy="6.5" r="2.7" style={{ animationDelay: "0ms", fill: colorful ? brand[0] : undefined }} />
      <circle className="loader-node" cx="16" cy="8.5" r="2.7" style={{ animationDelay: "160ms", fill: colorful ? brand[1] : undefined }} />
      <circle className="loader-node" cx="8" cy="17.5" r="2.7" style={{ animationDelay: "720ms", fill: colorful ? brand[2] : undefined }} />
    </svg>
  );
}

const verbs = [
  "Simplifying",
  "Untangling",
  "Whittling",
  "Tinkering",
  "Noodling",
  "Mulling it over",
  "Sifting",
  "Branching out",
  "Connecting dots",
  "Sanding the edges",
  "Tidying up",
  "Chasing threads",
  "Lining things up",
  "Weighing options",
  "Sketching",
  "Cross-checking",
];

const started = new Map<string, number>();

function useElapsed(id: string) {
  const [now, setNow] = useState(Date.now);
  if (!started.has(id)) started.set(id, Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.floor((now - started.get(id)!) / 1000));
}

function elapsedLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function Activity({ id, className }: { id: string; className?: string }) {
  const seconds = useElapsed(id);
  const [index, setIndex] = useState(() => Math.floor(Math.random() * verbs.length));

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1 + Math.floor(Math.random() * (verbs.length - 1))) % verbs.length), 3600);
    return () => clearInterval(timer);
  }, []);

  return (
    <div role="status" className={cn("flex h-6 items-center gap-2 text-[12.5px]", className)}>
      <Loader colorful className="size-4" />
      <span key={index} className="shimmer animate-rise font-medium">
        {verbs[index]}…
      </span>
      <span className="font-mono text-[11.5px] tabular-nums text-mute/70">{elapsedLabel(seconds)}</span>
    </div>
  );
}
