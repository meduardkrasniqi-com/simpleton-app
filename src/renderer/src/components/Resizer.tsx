import { useState, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

function read(key: string) {
  try {
    return Number(localStorage.getItem(key)) || null;
  } catch {
    return null;
  }
}

function write(key: string, value: number | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {
    return;
  }
}

export function useWidth(key: string, initial: () => number, min: number, max: () => number) {
  const clamp = (value: number) => Math.round(Math.min(Math.max(value, min), Math.max(min, max())));
  const [width, setWidth] = useState(() => clamp(read(key) ?? initial()));

  const resize = (value: number) => {
    const next = clamp(value);
    setWidth(next);
    write(key, next);
  };

  const reset = () => {
    write(key, null);
    setWidth(clamp(initial()));
  };

  return { width, resize, reset };
}

export function ResizeHandle({ edge, width, onResize, onReset }: { edge: "left" | "right"; width: number; onResize: (width: number) => void; onReset: () => void }) {
  const [dragging, setDragging] = useState(false);

  const start = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    setDragging(true);
    document.body.style.cursor = "col-resize";

    const move = (event: globalThis.PointerEvent) => onResize(startWidth + (edge === "right" ? event.clientX - startX : startX - event.clientX));
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDragging(false);
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  return (
    <div role="separator" aria-orientation="vertical" aria-label="Resize sidebar" onPointerDown={start} onDoubleClick={onReset} className={cn("no-drag group absolute inset-y-0 z-20 w-2 cursor-col-resize", edge === "right" ? "-right-1" : "-left-1")}>
      <div className={cn("mx-auto h-full w-[2px] transition-colors", dragging ? "bg-ink/20" : "group-hover:bg-ink/10")} />
    </div>
  );
}
