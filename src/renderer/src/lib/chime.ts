import { useEffect, useRef } from "react";
import type { AppState, Status } from "@shared/types";

let context: AudioContext | null = null;

export function chime() {
  try {
    context ??= new AudioContext();
    const ctx = context;
    if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
    const start = ctx.currentTime + 0.02;
    [
      { freq: 1318.5, at: 0 },
      { freq: 1760, at: 0.11 },
    ].forEach(({ freq, at }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = start + at;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  } catch {
    return;
  }
}

const finished: Status[] = ["ready", "input"];

export function useFinishChime(state: AppState | null) {
  const previous = useRef<Map<string, Status> | null>(null);

  useEffect(() => {
    if (!state) return;
    const next = new Map(state.workspaces.map((w) => [w.id, w.status]));
    const before = previous.current;
    previous.current = next;
    if (!before || !state.sound) return;
    const done = state.workspaces.some((w) => before.get(w.id) === "working" && finished.includes(w.status));
    if (done) chime();
  }, [state]);
}
