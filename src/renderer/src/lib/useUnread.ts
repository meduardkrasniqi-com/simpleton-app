import { useEffect, useRef, useState } from "react";
import type { AppState, Status } from "@shared/types";

const unreadKey = "simpleton.unread";

const finished: Status[] = ["ready", "input"];

function readUnread() {
  try {
    const saved = JSON.parse(localStorage.getItem(unreadKey) ?? "[]");
    return new Set<string>(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set<string>();
  }
}

function save(ids: Set<string>) {
  try {
    localStorage.setItem(unreadKey, JSON.stringify([...ids]));
  } catch {
    return;
  }
}

export function useUnread(state: AppState | null, active: string) {
  const [unread, setUnread] = useState(readUnread);
  const previous = useRef<Map<string, Status> | null>(null);

  useEffect(() => {
    if (!state) return;
    const next = new Map(state.workspaces.map((w) => [w.id, w.status]));
    const before = previous.current;
    previous.current = next;
    setUnread((current) => {
      const updated = new Set([...current].filter((id) => next.has(id) && id !== active));
      if (before) {
        for (const w of state.workspaces) {
          if (w.id !== active && before.get(w.id) === "working" && finished.includes(w.status)) updated.add(w.id);
        }
      }
      if (updated.size === current.size && [...updated].every((id) => current.has(id))) return current;
      save(updated);
      return updated;
    });
  }, [state, active]);

  return unread;
}
