import { cn } from "@/lib/utils";

const button = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] font-medium transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";

export const primary = cn(button, "bg-ink text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(0,0,0,0.16)] hover:bg-[#262626]");

export const outline = cn(button, "border border-black/[0.09] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:border-black/[0.14] hover:bg-[#f7f7f7]");

export const ghost = cn(button, "text-soft hover:bg-black/[0.05] hover:text-ink");

export function Stat({ added, removed, className }: { added: number; removed: number; className?: string }) {
  return (
    <span className={cn("shrink-0 font-mono text-[12px] tabular-nums", className)}>
      <span className="text-plus">+{added}</span> <span className="text-minus">−{removed}</span>
    </span>
  );
}

export function Dot({ className }: { className: string }) {
  return <span className={cn("size-[7px] shrink-0 rounded-full", className)} />;
}

export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="7" fill="#0a0a0a" />
      <path d="M8 7v10M16 10.5c0 3.5-8 2.5-8 6.5" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="6.5" r="2.1" fill="#ffffff" />
      <circle cx="8" cy="17.5" r="2.1" fill="#ffffff" />
      <circle cx="16" cy="8.5" r="2.1" fill="#4ade80" />
    </svg>
  );
}
