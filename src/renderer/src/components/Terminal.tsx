import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import type { TermKind } from "@shared/types";
import { isDark, onSchemeChange } from "@/lib/useDark";

const light = {
  background: "#ffffff",
  foreground: "#0a0a0a",
  cursor: "#0a0a0a",
  cursorAccent: "#ffffff",
  selectionBackground: "rgba(10, 10, 10, 0.14)",
  black: "#24292f",
  red: "#cf222e",
  green: "#116329",
  yellow: "#9a6700",
  blue: "#0969da",
  magenta: "#8250df",
  cyan: "#1b7c83",
  white: "#6e7781",
  brightBlack: "#57606a",
  brightRed: "#a40e26",
  brightGreen: "#1a7f37",
  brightYellow: "#7d4e00",
  brightBlue: "#218bff",
  brightMagenta: "#a475f9",
  brightCyan: "#3192aa",
  brightWhite: "#8c959f",
};

const dark = {
  background: "#161616",
  foreground: "#ededed",
  cursor: "#ededed",
  cursorAccent: "#161616",
  selectionBackground: "rgba(237, 237, 237, 0.2)",
  black: "#484f58",
  red: "#ff7b72",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#b1bac4",
  brightBlack: "#6e7681",
  brightRed: "#ffa198",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#f0f6fc",
};

export function Terminal({ workspaceId, kind, active }: { workspaceId: string; kind: TermKind; active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<{ term: XTerm; fit: () => void } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const term = new XTerm({ theme: isDark() ? dark : light, fontFamily: '"SF Mono", ui-monospace, Menlo, monospace', fontSize: 12, lineHeight: 1.25, cursorBlink: kind === "shell", scrollback: 5000, allowProposedApi: false });
    const fitter = new FitAddon();
    term.loadAddon(fitter);
    term.open(el);

    let alive = true;
    let ready = false;
    let seen = 0;
    const queued: { data: string; end: number }[] = [];

    const fit = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      fitter.fit();
      if (ready) window.simpleton.resizeTerminal(workspaceId, kind, term.cols, term.rows);
    };

    const off = window.simpleton.onTerminal((event) => {
      if (event.workspaceId !== workspaceId || event.kind !== kind) return;
      if (!ready) return void queued.push(event);
      if (event.end > seen) term.write(event.data);
      seen = Math.max(seen, event.end);
    });

    const input = term.onData((data) => window.simpleton.writeTerminal(workspaceId, kind, data));

    fit();
    window.simpleton.openTerminal(workspaceId, kind, term.cols, term.rows).then((snapshot) => {
      if (!alive) return;
      term.write(snapshot.buffer);
      seen = snapshot.end;
      ready = true;
      for (const event of queued.splice(0)) {
        if (event.end > seen) term.write(event.data);
        seen = Math.max(seen, event.end);
      }
      fit();
    });

    const scheme = onSchemeChange((value) => (term.options.theme = value ? dark : light));
    const observer = new ResizeObserver(() => fit());
    observer.observe(el);
    handle.current = { term, fit };

    return () => {
      alive = false;
      scheme();
      observer.disconnect();
      input.dispose();
      off();
      term.dispose();
      handle.current = null;
    };
  }, [workspaceId, kind]);

  useEffect(() => {
    if (!active || !handle.current) return;
    handle.current.fit();
    handle.current.term.focus();
  }, [active]);

  return <div ref={host} className="h-full w-full" />;
}
