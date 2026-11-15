import { useEffect, useState } from "react";
import type { Entry } from "@shared/types";

function merge(list: Entry[], entry: Entry) {
  const index = list.findIndex((e) => e.id === entry.id);
  if (index === -1) return [...list, entry];
  const next = list.slice();
  next[index] = entry;
  return next;
}

export function useTranscript(workspaceId: string) {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let alive = true;
    let loaded = false;
    const pending: Entry[] = [];

    const off = window.simpleton.onEntry(({ workspaceId: id, entry }) => {
      if (id !== workspaceId) return;
      if (!loaded) pending.push(entry);
      else setEntries((current) => merge(current ?? [], entry));
    });

    window.simpleton.transcript(workspaceId).then((list) => {
      if (!alive) return;
      loaded = true;
      setEntries(pending.reduce(merge, list));
    });

    return () => {
      alive = false;
      off();
    };
  }, [workspaceId]);

  return entries;
}
