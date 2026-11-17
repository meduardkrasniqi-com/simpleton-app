import { useCallback, useEffect, useState } from "react";
import type { Reports } from "@shared/types";

const seenKey = "simpleton.reports.seen";

function readSeen() {
  try {
    return Number(localStorage.getItem(seenKey)) || 0;
  } catch {
    return 0;
  }
}

export function useReports() {
  const [reports, setReports] = useState<Reports | null>(null);
  const [seen, setSeen] = useState(readSeen);

  useEffect(() => {
    let alive = true;
    window.simpleton.reports().then((r) => alive && setReports(r));
    const off = window.simpleton.onReports(setReports);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const latest = Math.max(0, ...(reports?.reports ?? []).filter((r) => r.state === "ready").map((r) => r.createdAt));

  const markSeen = useCallback(() => {
    if (latest <= seen) return;
    setSeen(latest);
    try {
      localStorage.setItem(seenKey, String(latest));
    } catch {
      return;
    }
  }, [latest, seen]);

  return { reports, unread: latest > seen, markSeen };
}
