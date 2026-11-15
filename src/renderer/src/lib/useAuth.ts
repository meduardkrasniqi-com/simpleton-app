import { useEffect, useState } from "react";
import type { Auth } from "@shared/types";

export function useAuth() {
  const [auth, setAuth] = useState<Auth | null>(null);

  useEffect(() => {
    let alive = true;
    window.simpleton.auth().then((a) => alive && setAuth(a));
    const off = window.simpleton.onAuth(setAuth);
    return () => {
      alive = false;
      off();
    };
  }, []);

  return auth;
}
