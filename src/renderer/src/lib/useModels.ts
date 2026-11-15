import { useEffect, useState } from "react";
import type { ModelCatalog } from "@shared/types";

export function useModels() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);

  useEffect(() => {
    let alive = true;
    window.simpleton
      .models()
      .then((c) => alive && setCatalog(c))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return catalog;
}
