import { Check, ListTodo, MessageCircleQuestion, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Detail, Entry, Question, Reply } from "@shared/types";
import { Markdown } from "@/components/Markdown";
import { ghost, outline, primary } from "@/components/ui";
import { cn } from "@/lib/utils";

type ToolEntry = Extract<Entry, { kind: "tool" }>;
type QuestionEntry = Extract<Entry, { kind: "question" }>;
type PlanEntry = Extract<Entry, { kind: "plan" }>;

const card = "overflow-hidden rounded-xl border border-ink/[0.1] bg-raised shadow-[0_1px_2px_rgba(0,0,0,0.04)]";
const small = "h-7 px-3 text-[12.5px]";

const rowStyles = { add: "bg-plus/[0.09]", del: "bg-minus/[0.08]", ctx: "", gap: "bg-panel text-mute" };
const signs = { add: "+", del: "−", ctx: " ", gap: " " };

function DetailView({ detail }: { detail: Detail }) {
  if (detail.kind === "diff") {
    return (
      <div className="selectable max-h-72 overflow-auto rounded-lg border border-line py-1 font-mono text-[12px] leading-[1.6]">
        {detail.lines.map((line, i) => (
          <div key={i} className={cn("flex min-w-fit whitespace-pre pr-3", rowStyles[line.kind])}>
            <span className="w-6 shrink-0 select-none text-center text-mute">{signs[line.kind]}</span>
            <span>{line.text || " "}</span>
          </div>
        ))}
      </div>
    );
  }
  return <pre className="selectable max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-panel px-3 py-2.5 font-mono text-[12px] leading-[1.6] text-ink">{detail.text}</pre>;
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 items-center gap-2 px-3.5 pb-3.5">{children}</div>;
}

export function ApprovalCard({ entry, icon: Icon, onReply }: { entry: ToolEntry; icon: LucideIcon; onReply: (reply: Reply) => void }) {
  const [sent, setSent] = useState(false);
  const reply = (value: Reply) => {
    if (sent) return;
    setSent(true);
    onReply(value);
  };
  const detail = entry.approval?.detail;
  const showTarget = !(detail?.kind === "command" && detail.text === entry.target);
  return (
    <div className={card}>
      <div className="flex min-w-0 items-center gap-2 px-3.5 pt-3 text-[13px]">
        <Icon className="size-3.5 shrink-0 text-ask" />
        <span className="shrink-0 font-medium">{entry.verb}</span>
        {showTarget && entry.target && (
          <span className="selectable min-w-0 truncate font-mono text-[12px] text-mute" title={entry.target}>
            {entry.target}
          </span>
        )}
      </div>
      {entry.approval?.reason && <p className="selectable px-3.5 pt-1.5 text-[12.5px] leading-[1.5] text-mute">{entry.approval.reason}</p>}
      {detail && (
        <div className="px-3.5 pt-2.5">
          <DetailView detail={detail} />
        </div>
      )}
      <div className="pt-3">
        <Actions>
          <button type="button" disabled={sent} onClick={() => reply({ kind: "allow" })} className={cn(primary, small, "shrink-0")}>
            Allow
          </button>
          {entry.approval?.always && (
            <button type="button" disabled={sent} onClick={() => reply({ kind: "allow", always: true })} title={entry.approval.always} className={cn(outline, small, "min-w-0 shrink")}>
              <span className="truncate">{entry.approval.always}</span>
            </button>
          )}
          <button type="button" disabled={sent} onClick={() => reply({ kind: "deny" })} className={cn(ghost, small, "shrink-0")}>
            Deny
          </button>
        </Actions>
      </div>
    </div>
  );
}

function Options({ question, value, other, onPick, onOther }: { question: Question; value: string[]; other: string; onPick: (label: string) => void; onOther: (text: string) => void }) {
  return (
    <div className="mt-2.5 flex flex-col gap-1">
      {question.options.map((option) => {
        const active = value.includes(option.label);
        return (
          <button
            key={option.label}
            type="button"
            onClick={() => onPick(option.label)}
            className={cn("flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors", active ? "border-ask/50 bg-ask/[0.06]" : "border-line hover:border-ink/[0.16] hover:bg-ink/[0.02]")}
          >
            <span className={cn("mt-[3px] grid size-3.5 shrink-0 place-items-center border", question.multiSelect ? "rounded-[4px]" : "rounded-full", active ? "border-ask bg-ask text-surface" : "border-ink/25")}>
              {active && (question.multiSelect ? <Check className="size-2.5" strokeWidth={3} /> : <span className="size-1.5 rounded-full bg-surface" />)}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium leading-[1.45]">{option.label}</span>
              {option.description && <span className="block text-[12.5px] leading-[1.45] text-mute">{option.description}</span>}
            </span>
          </button>
        );
      })}
      <input
        value={other}
        onChange={(e) => onOther(e.target.value)}
        placeholder="Other"
        className={cn("h-9 rounded-lg border bg-transparent px-3 text-[13px] outline-none placeholder:text-mute", other.trim() ? "border-ask/50" : "border-line focus:border-ink/[0.2]")}
      />
    </div>
  );
}

export function QuestionCard({ entry, onReply }: { entry: QuestionEntry; onReply: (reply: Reply) => void }) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [others, setOthers] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  const answerFor = (q: Question) => [...(picked[q.question] ?? []), ...(others[q.question]?.trim() ? [others[q.question].trim()] : [])].join(", ");
  const complete = entry.questions.every((q) => answerFor(q));
  const instant = entry.questions.length === 1 && !entry.questions[0].multiSelect;

  const reply = (value: Reply) => {
    if (sent) return;
    setSent(true);
    onReply(value);
  };

  const submit = () => {
    if (!complete) return;
    reply({ kind: "answer", answers: Object.fromEntries(entry.questions.map((q) => [q.question, answerFor(q)])) });
  };

  const pick = (q: Question, label: string) => {
    if (instant) return reply({ kind: "answer", answers: { [q.question]: label } });
    setPicked((current) => {
      const now = current[q.question] ?? [];
      const next = q.multiSelect ? (now.includes(label) ? now.filter((l) => l !== label) : [...now, label]) : [label];
      return { ...current, [q.question]: next };
    });
    if (!q.multiSelect) setOthers((current) => ({ ...current, [q.question]: "" }));
  };

  const setOther = (q: Question, text: string) => {
    setOthers((current) => ({ ...current, [q.question]: text }));
    if (!q.multiSelect && text.trim()) setPicked((current) => ({ ...current, [q.question]: [] }));
  };

  return (
    <div className={card}>
      <div className="flex flex-col gap-5 px-3.5 py-3.5">
        {entry.questions.map((q) => (
          <div key={q.question}>
            {q.header && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">{q.header}</p>}
            <p className="selectable text-[14px] font-medium leading-[1.45]">{q.question}</p>
            <Options question={q} value={picked[q.question] ?? []} other={others[q.question] ?? ""} onPick={(label) => pick(q, label)} onOther={(text) => setOther(q, text)} />
          </div>
        ))}
      </div>
      <Actions>
        {(!instant || others[entry.questions[0]?.question]?.trim()) && (
          <button type="button" disabled={!complete || sent} onClick={submit} className={cn(primary, small)}>
            Submit
          </button>
        )}
        <button type="button" disabled={sent} onClick={() => reply({ kind: "deny" })} className={cn(ghost, small)}>
          Skip
        </button>
      </Actions>
    </div>
  );
}

export function AnsweredQuestion({ entry }: { entry: QuestionEntry }) {
  return (
    <div className="flex flex-col gap-1.5">
      {entry.questions.map((q) => {
        const answer = entry.answers?.[q.question];
        return (
          <div key={q.question} className="flex gap-2 text-[12.5px] leading-[1.5]">
            <MessageCircleQuestion className="mt-[3px] size-3.5 shrink-0 text-mute" />
            <p className="selectable min-w-0">
              <span className="text-soft">{q.question}</span> <span className={cn("font-medium", answer ? "text-ink" : "text-mute")}>{answer ?? (entry.state === "declined" ? "Skipped" : "No answer")}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

const planStates: Record<PlanEntry["state"], string> = {
  pending: "",
  approved: "Approved",
  rejected: "Changes requested",
  cancelled: "Not answered",
};

export function PlanCard({ entry, modeLabel, onReply }: { entry: PlanEntry; modeLabel?: string; onReply: (reply: Reply) => void }) {
  const [sent, setSent] = useState(false);
  const pending = entry.state === "pending";
  const reply = (value: Reply) => {
    if (sent) return;
    setSent(true);
    onReply(value);
  };
  return (
    <div className={card}>
      <div className="flex items-center gap-2 px-3.5 pt-3 text-[13px]">
        <ListTodo className={cn("size-3.5 shrink-0", pending ? "text-ask" : "text-mute")} />
        <span className="font-medium">Plan</span>
        {!pending && <span className="ml-auto text-[12px] text-mute">{entry.state === "approved" && modeLabel ? `${planStates.approved} · ${modeLabel}` : planStates[entry.state]}</span>}
      </div>
      <div className={cn("px-3.5 pt-1", pending ? "max-h-[420px] overflow-y-auto pb-1" : "max-h-48 overflow-hidden pb-3.5 [mask-image:linear-gradient(to_bottom,black_70%,transparent)]")}>
        <Markdown text={entry.plan || "No plan text was provided."} />
      </div>
      {pending && (
        <div className="pt-2.5">
          <Actions>
            <button type="button" disabled={sent} onClick={() => reply({ kind: "plan", mode: "auto" })} className={cn(primary, small)}>
              Approve
            </button>
            <button type="button" disabled={sent} onClick={() => reply({ kind: "plan", mode: "default" })} className={cn(outline, small)}>
              Approve, ask first
            </button>
            <button type="button" disabled={sent} onClick={() => reply({ kind: "deny" })} className={cn(ghost, small)}>
              Keep planning
            </button>
          </Actions>
        </div>
      )}
    </div>
  );
}
