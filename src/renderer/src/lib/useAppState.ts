import { useEffect, useState } from "react";
import type { AppState } from "@shared/types";

export function useAppState() {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    let alive = true;
    window.simpleton.state().then((s) => alive && setState(s));
    const off = window.simpleton.onState(setState);
    return () => {
      alive = false;
      off();
    };
  }, []);

  return state;
}
