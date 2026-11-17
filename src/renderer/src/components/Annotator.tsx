import { ArrowUpRight, Ban, Check, Copy, Crop, Download, ExternalLink, MousePointer2, PenLine, Redo2, Square, Type, Undo2, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader } from "@/components/Loader";
import { cn } from "@/lib/utils";

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
type Shape = ({ kind: "arrow" | "box"; a: Pt; b: Pt } | { kind: "pen"; points: Pt[] } | { kind: "text"; at: Pt; text: string } | { kind: "step"; at: Pt; n: number }) & { id: string; color: string };
type Draft = Extract<Shape, { kind: "arrow" | "box" | "pen" }>;
type Tool = "select" | "crop" | "arrow" | "box" | "pen" | "text" | "step";
type Doc = { shapes: Shape[]; crop: Rect };
type Handle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w" | "move";
type Layout = { width: number; height: number; ox: number; oy: number; pad: number; radius: number };
type Editing = { id?: string; at: Pt; text: string; color: string };
type Drag = { kind: "draw" } | { kind: "move"; id: string; last: Pt; before: Doc; moved: boolean } | { kind: "crop"; handle: Handle | null; start: Pt; rect: Rect };

const font = 'system-ui, -apple-system, "SF Pro Text", sans-serif';

const colors = ["#ff3b30", "#ffcc00", "#34c759", "#0a84ff", "#ffffff", "#111111"];

const backdrops = [
  { name: "Simpleton", stops: ["#ff8a3d", "#f0508a", "#6b7bff"] },
  { name: "Sky", stops: ["#9ecbff", "#3b82f6", "#1e3a8a"] },
  { name: "Dusk", stops: ["#fbcfe8", "#a855f7", "#3b0764"] },
  { name: "Sunset", stops: ["#fde68a", "#fb7185", "#881337"] },
  { name: "Mint", stops: ["#bbf7d0", "#14b8a6", "#134e4a"] },
  { name: "Graphite", stops: ["#71717a", "#27272a", "#09090b"] },
  { name: "Paper", stops: ["#ffffff", "#f4f4f5", "#d4d4d8"] },
];

const paddings = [0.05, 0.085, 0.13];

const tools: { id: Tool; icon: LucideIcon | null; label: string; key: string }[] = [
  { id: "select", icon: MousePointer2, label: "Select", key: "V" },
  { id: "crop", icon: Crop, label: "Crop", key: "C" },
  { id: "arrow", icon: ArrowUpRight, label: "Arrow", key: "A" },
  { id: "box", icon: Square, label: "Box", key: "R" },
  { id: "pen", icon: PenLine, label: "Pen", key: "P" },
  { id: "text", icon: Type, label: "Text", key: "T" },
  { id: "step", icon: null, label: "Step number", key: "N" },
];

const prefsKey = "simpleton.annotate";

function readPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(prefsKey) ?? "{}") as { backdrop?: number; padding?: number; color?: string };
    return { backdrop: typeof saved.backdrop === "number" ? saved.backdrop : -1, padding: typeof saved.padding === "number" ? saved.padding : 1, color: colors.includes(saved.color ?? "") ? saved.color! : colors[0] };
  } catch {
    return { backdrop: -1, padding: 1, color: colors[0] };
  }
}

function writePrefs(prefs: { backdrop: number; padding: number; color: string }) {
  try {
    localStorage.setItem(prefsKey, JSON.stringify(prefs));
  } catch {
    return;
  }
}

const light = (color: string) => color === "#ffffff" || color === "#ffcc00";

const uid = () => Math.random().toString(36).slice(2, 10);

const textSize = (unit: number) => unit * 5.4;

const stepRadius = (unit: number) => unit * 3.1;

let measurer: CanvasRenderingContext2D | null = null;

function measure(text: string, size: number) {
  measurer ??= document.createElement("canvas").getContext("2d");
  if (!measurer) return 0;
  measurer.font = `700 ${size}px ${font}`;
  return Math.max(...text.split("\n").map((line) => measurer!.measureText(line || " ").width));
}

function bounds(shape: Shape, unit: number): Rect {
  switch (shape.kind) {
    case "arrow":
    case "box": {
      const x = Math.min(shape.a.x, shape.b.x);
      const y = Math.min(shape.a.y, shape.b.y);
      return { x, y, w: Math.abs(shape.a.x - shape.b.x), h: Math.abs(shape.a.y - shape.b.y) };
    }
    case "pen": {
      const xs = shape.points.map((p) => p.x);
      const ys = shape.points.map((p) => p.y);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    case "text": {
      const size = textSize(unit);
      return { x: shape.at.x, y: shape.at.y, w: measure(shape.text, size), h: shape.text.split("\n").length * size * 1.25 };
    }
    case "step": {
      const r = stepRadius(unit);
      return { x: shape.at.x - r, y: shape.at.y - r, w: r * 2, h: r * 2 };
    }
  }
}

function toSegment(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function hit(shape: Shape, p: Pt, unit: number, tolerance: number) {
  if (shape.kind === "arrow") return toSegment(p, shape.a, shape.b) <= tolerance + unit * 2;
  if (shape.kind === "pen") return shape.points.some((point, i) => toSegment(p, point, shape.points[i + 1] ?? point) <= tolerance + unit);
  const r = bounds(shape, unit);
  const inside = (pad: number) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
  if (shape.kind === "box") {
    const edge = tolerance + unit;
    return inside(edge) && !(p.x > r.x + edge && p.x < r.x + r.w - edge && p.y > r.y + edge && p.y < r.y + r.h - edge);
  }
  return inside(tolerance);
}

function shift(shape: Shape, dx: number, dy: number): Shape {
  const by = (p: Pt) => ({ x: p.x + dx, y: p.y + dy });
  switch (shape.kind) {
    case "arrow":
    case "box":
      return { ...shape, a: by(shape.a), b: by(shape.b) };
    case "pen":
      return { ...shape, points: shape.points.map(by) };
    default:
      return { ...shape, at: by(shape.at) };
  }
}

function shadow(ctx: CanvasRenderingContext2D, unit: number) {
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = unit * 1.4;
  ctx.shadowOffsetY = unit * 0.35;
}

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, unit: number) {
  ctx.save();
  ctx.fillStyle = shape.color;
  ctx.strokeStyle = shape.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (shape.kind) {
    case "arrow": {
      const { a, b } = shape;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < 1) break;
      const ux = (b.x - a.x) / length;
      const uy = (b.y - a.y) / length;
      const width = unit * 1.7;
      const head = Math.min(width * 3.6, length * 0.55);
      const wing = Math.min(width * 1.9, head * 0.62);
      const neck = { x: b.x - ux * head, y: b.y - uy * head };
      const side = (p: Pt, d: number) => ({ x: p.x - uy * d, y: p.y + ux * d });
      const points = [side(a, width * 0.28), side(neck, width * 0.55), side(neck, wing), b, side(neck, -wing), side(neck, -width * 0.55), side(a, -width * 0.28)];
      ctx.beginPath();
      points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      shadow(ctx, unit);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.lineWidth = unit * 0.5;
      ctx.stroke();
      break;
    }
    case "box": {
      const r = bounds(shape, unit);
      ctx.lineWidth = unit;
      shadow(ctx, unit);
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(unit * 1.4, r.w / 2, r.h / 2));
      ctx.stroke();
      break;
    }
    case "pen": {
      const points = shape.points;
      ctx.lineWidth = unit;
      shadow(ctx, unit);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      if (points.length === 1) ctx.lineTo(points[0].x + 0.01, points[0].y);
      for (let i = 1; i < points.length - 1; i++) {
        const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
        ctx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
      }
      if (points.length > 1) ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.stroke();
      break;
    }
    case "text": {
      const size = textSize(unit);
      ctx.font = `700 ${size}px ${font}`;
      ctx.textBaseline = "top";
      ctx.lineWidth = size * 0.15;
      ctx.strokeStyle = light(shape.color) ? "rgba(0, 0, 0, 0.82)" : "#ffffff";
      shape.text.split("\n").forEach((line, i) => {
        const y = shape.at.y + i * size * 1.25 + size * 0.06;
        ctx.strokeText(line, shape.at.x, y);
        ctx.fillText(line, shape.at.x, y);
      });
      break;
    }
    case "step": {
      const r = stepRadius(unit);
      shadow(ctx, unit);
      ctx.beginPath();
      ctx.arc(shape.at.x, shape.at.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.lineWidth = unit * 0.45;
      ctx.strokeStyle = light(shape.color) ? "rgba(0, 0, 0, 0.25)" : "#ffffff";
      ctx.stroke();
      ctx.fillStyle = light(shape.color) ? "#111111" : "#ffffff";
      ctx.font = `700 ${r * 1.12}px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(shape.n), shape.at.x, shape.at.y + r * 0.05);
      break;
    }
  }
  ctx.restore();
}

function drawBackdrop(ctx: CanvasRenderingContext2D, index: number, width: number, height: number) {
  const stops = backdrops[index].stops;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  stops.forEach((color, i) => gradient.addColorStop(i / (stops.length - 1), color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(width * 0.18, height * 0.08, 0, width * 0.18, height * 0.08, Math.max(width, height) * 0.85);
  glow.addColorStop(0, "rgba(255, 255, 255, 0.28)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function rounded(bitmap: ImageBitmap, crop: Rect, radius: number) {
  const canvas = document.createElement("canvas");
  canvas.width = crop.w;
  canvas.height = crop.h;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.roundRect(0, 0, crop.w, crop.h, radius);
  ctx.clip();
  ctx.drawImage(bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  return canvas;
}

function layoutFor(crop: Rect, backdrop: number, padding: number): Layout {
  const pad = backdrop >= 0 ? Math.round(Math.max(crop.w, crop.h) * paddings[padding]) : 0;
  const radius = backdrop >= 0 ? Math.max(6, Math.round(Math.max(crop.w, crop.h) * 0.012)) : 0;
  return { width: crop.w + pad * 2, height: crop.h + pad * 2, ox: pad - crop.x, oy: pad - crop.y, pad, radius };
}

function render(ctx: CanvasRenderingContext2D, bitmap: ImageBitmap, layout: Layout, crop: Rect, backdrop: number, framed: HTMLCanvasElement | null, shapes: Shape[], unit: number) {
  ctx.clearRect(0, 0, layout.width, layout.height);
  if (backdrop >= 0 && framed) {
    drawBackdrop(ctx, backdrop, layout.width, layout.height);
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.32)";
    ctx.shadowBlur = layout.pad * 0.45;
    ctx.shadowOffsetY = layout.pad * 0.12;
    ctx.drawImage(framed, layout.pad, layout.pad);
    ctx.restore();
  } else {
    ctx.drawImage(bitmap, crop.x, crop.y, crop.w, crop.h, layout.ox + crop.x, layout.oy + crop.y, crop.w, crop.h);
  }
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(layout.ox + crop.x, layout.oy + crop.y, crop.w, crop.h, layout.radius);
  ctx.clip();
  ctx.translate(layout.ox, layout.oy);
  shapes.forEach((shape) => drawShape(ctx, shape, unit));
  ctx.restore();
}

function handleAt(r: Rect, p: Pt, tolerance: number): Handle | null {
  const near = (a: number, b: number) => Math.abs(a - b) <= tolerance;
  const inX = p.x >= r.x - tolerance && p.x <= r.x + r.w + tolerance;
  const inY = p.y >= r.y - tolerance && p.y <= r.y + r.h + tolerance;
  const left = near(p.x, r.x);
  const right = near(p.x, r.x + r.w);
  const top = near(p.y, r.y);
  const bottom = near(p.y, r.y + r.h);
  if (top && left) return "nw";
  if (top && right) return "ne";
  if (bottom && left) return "sw";
  if (bottom && right) return "se";
  if (top && inX) return "n";
  if (bottom && inX) return "s";
  if (left && inY) return "w";
  if (right && inY) return "e";
  if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) return "move";
  return null;
}

const cursors: Record<Handle, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", move: "move" };

function resizeCrop(rect: Rect, handle: Handle | null, start: Pt, p: Pt, width: number, height: number): Rect {
  const clampX = (x: number) => Math.max(0, Math.min(width, x));
  const clampY = (y: number) => Math.max(0, Math.min(height, y));
  if (handle === "move") {
    const x = Math.max(0, Math.min(width - rect.w, rect.x + p.x - start.x));
    const y = Math.max(0, Math.min(height - rect.h, rect.y + p.y - start.y));
    return { ...rect, x: Math.round(x), y: Math.round(y) };
  }
  let x1 = rect.x;
  let y1 = rect.y;
  let x2 = rect.x + rect.w;
  let y2 = rect.y + rect.h;
  if (!handle) {
    x1 = start.x;
    y1 = start.y;
    x2 = p.x;
    y2 = p.y;
  } else {
    if (handle.includes("w")) x1 = p.x;
    if (handle.includes("e")) x2 = p.x;
    if (handle.includes("n")) y1 = p.y;
    if (handle.includes("s")) y2 = p.y;
  }
  const left = Math.round(clampX(Math.min(x1, x2)));
  const top = Math.round(clampY(Math.min(y1, y2)));
  return { x: left, y: top, w: Math.max(1, Math.round(clampX(Math.max(x1, x2))) - left), h: Math.max(1, Math.round(clampY(Math.max(y1, y2))) - top) };
}

function StepIcon() {
  return <span className="grid size-[17px] place-items-center rounded-full border-[1.75px] border-current text-[9.5px] font-bold leading-none">1</span>;
}

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tip relative flex">
      {children}
      <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/90 px-2 py-1 text-[11.5px] font-medium text-white opacity-0 shadow-lg transition-opacity delay-300 group-hover/tip:opacity-100">{label}</span>
    </span>
  );
}

const pill = "flex items-center gap-0.5 rounded-xl border border-white/[0.08] bg-[#1c1c1f]/95 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl";

const iconButton = "grid size-8 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30";

const divider = <span className="mx-1 h-5 w-px bg-white/10" />;

export function Annotator({ path, onClose }: { path: string; onClose: () => void }) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [failed, setFailed] = useState(false);
  const [doc, setDoc] = useState<Doc>({ shapes: [], crop: { x: 0, y: 0, w: 1, h: 1 } });
  const [past, setPast] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);
  const [tool, setToolState] = useState<Tool>("arrow");
  const [prefs, setPrefsState] = useState(readPrefs);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cropDraft, setCropDraft] = useState<Rect | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [cursor, setCursor] = useState("crosshair");
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [done, setDone] = useState<"copied" | "saved" | null>(null);
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState<Doc | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef<Draft | null>(null);
  const editingRef = useRef<Editing | null>(null);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  const updateDraft = (next: Draft | null) => {
    draftRef.current = next;
    setDraft(next);
  };

  const setPrefs = (change: Partial<typeof prefs>) =>
    setPrefsState((current) => {
      const next = { ...current, ...change };
      writePrefs(next);
      return next;
    });

  useEffect(() => {
    let alive = true;
    window.simpleton
      .readImage(path)
      .then((bytes) => createImageBitmap(new Blob([bytes as BlobPart])))
      .then((image) => {
        if (!alive) return image.close();
        setBitmap(image);
        setDoc({ shapes: [], crop: { x: 0, y: 0, w: image.width, h: image.height } });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [path]);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setStage({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cropping = tool === "crop" && !!cropDraft;
  const unit = bitmap ? Math.max(2, Math.min(18, Math.max(bitmap.width, bitmap.height) * 0.0042)) : 4;
  const layout = useMemo<Layout>(() => {
    if (!bitmap) return { width: 1, height: 1, ox: 0, oy: 0, pad: 0, radius: 0 };
    if (cropping) return { width: bitmap.width, height: bitmap.height, ox: 0, oy: 0, pad: 0, radius: 0 };
    return layoutFor(doc.crop, prefs.backdrop, prefs.padding);
  }, [bitmap, cropping, doc.crop, prefs.backdrop, prefs.padding]);
  const framed = useMemo(() => (bitmap && !cropping && prefs.backdrop >= 0 ? rounded(bitmap, doc.crop, layout.radius) : null), [bitmap, cropping, prefs.backdrop, doc.crop, layout.radius]);
  const scale = stage.w && stage.h ? Math.min((stage.w - 64) / layout.width, (stage.h - 32) / layout.height, 1) : 0;
  const tolerance = 7 / (scale || 1);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || !bitmap) return;
    el.width = layout.width;
    el.height = layout.height;
    const visible = doc.shapes.filter((s) => s.id !== editing?.id);
    if (cropping) {
      ctx.clearRect(0, 0, layout.width, layout.height);
      ctx.drawImage(bitmap, 0, 0);
      visible.forEach((s) => drawShape(ctx, s, unit));
      const r = cropDraft!;
      const line = 1 / scale;
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.beginPath();
      ctx.rect(0, 0, layout.width, layout.height);
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill("evenodd");
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = line;
      ctx.beginPath();
      for (const t of [1 / 3, 2 / 3]) {
        ctx.moveTo(r.x + r.w * t, r.y);
        ctx.lineTo(r.x + r.w * t, r.y + r.h);
        ctx.moveTo(r.x, r.y + r.h * t);
        ctx.lineTo(r.x + r.w, r.y + r.h * t);
      }
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = line * 1.5;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      const arm = Math.min(18 * line, r.w / 2, r.h / 2);
      ctx.lineWidth = line * 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const [cx, cy, sx, sy] of [
        [r.x, r.y, 1, 1],
        [r.x + r.w, r.y, -1, 1],
        [r.x, r.y + r.h, 1, -1],
        [r.x + r.w, r.y + r.h, -1, -1],
      ]) {
        ctx.moveTo(cx + sx * arm, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + sy * arm);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
    render(ctx, bitmap, layout, doc.crop, prefs.backdrop, framed, draft ? [...visible, draft] : visible, unit);
    const chosen = selected ? doc.shapes.find((s) => s.id === selected) : null;
    if (chosen && chosen.id !== editing?.id) {
      const r = bounds(chosen, unit);
      const pad = unit * 1.5 + 4 / scale;
      ctx.save();
      ctx.translate(layout.ox, layout.oy);
      ctx.strokeStyle = "#0a84ff";
      ctx.lineWidth = 1.5 / scale;
      ctx.setLineDash([5 / scale, 4 / scale]);
      ctx.strokeRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2);
      ctx.restore();
    }
  }, [bitmap, layout, doc, draft, selected, editing?.id, cropping, cropDraft, framed, prefs.backdrop, unit, scale]);

  const commit = useCallback(
    (next: Doc) => {
      setPast((p) => [...p, doc].slice(-100));
      setFuture([]);
      setDoc(next);
    },
    [doc],
  );

  const undo = () => {
    const previous = past[past.length - 1];
    if (!previous) return;
    setPast(past.slice(0, -1));
    setFuture([doc, ...future]);
    setDoc(previous);
    setSelected(null);
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past, doc]);
    setDoc(next);
    setSelected(null);
  };

  const applyCrop = () => {
    if (cropDraft && (cropDraft.x !== doc.crop.x || cropDraft.y !== doc.crop.y || cropDraft.w !== doc.crop.w || cropDraft.h !== doc.crop.h) && cropDraft.w >= 8 && cropDraft.h >= 8) commit({ ...doc, crop: cropDraft });
    setCropDraft(null);
  };

  const setTool = (next: Tool) => {
    if (tool === "crop" && next !== "crop") applyCrop();
    if (next === "crop" && bitmap) setCropDraft(doc.crop);
    setSelected(null);
    setToolState(next);
    setCursor(next === "select" ? "default" : next === "text" ? "text" : "crosshair");
  };

  const finishCrop = () => setTool("select");

  const cancelCrop = () => {
    setCropDraft(null);
    setToolState("select");
    setCursor("default");
  };

  const pick = (color: string) => {
    setPrefs({ color });
    if (editing) setEditing({ ...editing, color });
    if (selected) commit({ ...doc, shapes: doc.shapes.map((s) => (s.id === selected ? { ...s, color } : s)) });
  };

  const remove = () => {
    if (!selected) return;
    commit({ ...doc, shapes: doc.shapes.filter((s) => s.id !== selected) });
    setSelected(null);
  };

  const commitText = () => {
    if (!editing || editingRef.current !== editing) return;
    editingRef.current = null;
    const text = editing.text.replace(/\s+$/, "");
    const rest = doc.shapes.filter((s) => s.id !== editing.id);
    const existing = doc.shapes.find((s) => s.id === editing.id);
    if (!text) {
      if (existing) commit({ ...doc, shapes: rest });
    } else if (!existing || existing.kind !== "text" || existing.text !== text || existing.color !== editing.color) {
      const shape: Shape = { id: editing.id ?? uid(), kind: "text", at: editing.at, text, color: editing.color };
      const index = doc.shapes.findIndex((s) => s.id === editing.id);
      commit({ ...doc, shapes: index === -1 ? [...doc.shapes, shape] : doc.shapes.map((s) => (s.id === editing.id ? shape : s)) });
    }
    setEditing(null);
  };

  const point = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * layout.width - layout.ox;
    const y = ((e.clientY - r.top) / r.height) * layout.height - layout.oy;
    return { x, y };
  };

  const topmost = (p: Pt, kinds?: Shape["kind"][]) => [...doc.shapes].reverse().find((s) => (!kinds || kinds.includes(s.kind)) && hit(s, p, unit, tolerance));

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!bitmap || e.button !== 0) return;
    if (editing) return;
    const p = point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "crop" && cropDraft) {
      drag.current = { kind: "crop", handle: handleAt(cropDraft, p, tolerance * 1.5), start: p, rect: cropDraft };
      return;
    }
    if (tool === "select") {
      const target = topmost(p);
      setSelected(target?.id ?? null);
      if (target) drag.current = { kind: "move", id: target.id, last: p, before: doc, moved: false };
      return;
    }
    if (tool === "text") {
      const target = topmost(p, ["text"]);
      if (target?.kind === "text") setEditing({ id: target.id, at: target.at, text: target.text, color: target.color });
      else setEditing({ at: { x: p.x, y: p.y - textSize(unit) * 0.6 }, text: "", color: prefs.color });
      return;
    }
    if (tool === "step") {
      const n = Math.max(0, ...doc.shapes.map((s) => (s.kind === "step" ? s.n : 0))) + 1;
      commit({ ...doc, shapes: [...doc.shapes, { id: uid(), kind: "step", at: p, n, color: prefs.color }] });
      return;
    }
    const id = uid();
    updateDraft(tool === "pen" ? { id, kind: "pen", points: [p], color: prefs.color } : { id, kind: tool as "arrow" | "box", a: p, b: p, color: prefs.color });
    drag.current = { kind: "draw" };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!bitmap) return;
    const p = point(e);
    const current = drag.current;
    if (!current) {
      if (tool === "crop" && cropDraft) {
        const handle = handleAt(cropDraft, p, tolerance * 1.5);
        setCursor(handle ? cursors[handle] : "crosshair");
      } else if (tool === "select") setCursor(topmost(p) ? "move" : "default");
      return;
    }
    if (current.kind === "crop") setCropDraft(resizeCrop(current.rect, current.handle, current.start, p, bitmap.width, bitmap.height));
    else if (current.kind === "move") {
      const dx = p.x - current.last.x;
      const dy = p.y - current.last.y;
      current.last = p;
      current.moved = true;
      setDoc((d) => ({ ...d, shapes: d.shapes.map((s) => (s.id === current.id ? shift(s, dx, dy) : s)) }));
    } else {
      const d = draftRef.current;
      if (!d) return;
      if (d.kind !== "pen") updateDraft({ ...d, b: p });
      else {
        const last = d.points[d.points.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) >= unit * 0.35) updateDraft({ ...d, points: [...d.points, p] });
      }
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    const pending = draftRef.current;
    const end = point(e);
    const draft: Draft | null = !pending ? null : pending.kind === "pen" ? { ...pending, points: [...pending.points, end] } : { ...pending, b: end };
    if (current.kind === "move" && current.moved) {
      setPast((p) => [...p, current.before].slice(-100));
      setFuture([]);
    }
    if (current.kind === "draw" && draft) {
      const r = bounds(draft, unit);
      const big = draft.kind === "pen" ? draft.points.length > 1 : Math.hypot(r.w, r.h) > unit * 3;
      if (big) commit({ ...doc, shapes: [...doc.shapes, draft] });
      updateDraft(null);
    }
  };

  const output = async () => {
    if (!bitmap) return null;
    const crop = tool === "crop" && cropDraft ? cropDraft : doc.crop;
    const out = layoutFor(crop, prefs.backdrop, prefs.padding);
    const el = document.createElement("canvas");
    el.width = out.width;
    el.height = out.height;
    const ctx = el.getContext("2d")!;
    render(ctx, bitmap, out, crop, prefs.backdrop, prefs.backdrop >= 0 ? rounded(bitmap, crop, out.radius) : null, doc.shapes, unit);
    const blob = await new Promise<Blob | null>((resolve) => el.toBlob(resolve, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  };

  const flash = (kind: "copied" | "saved") => {
    setExported(doc);
    setDone(kind);
    setTimeout(() => setDone((d) => (d === kind ? null : d)), 1600);
  };

  const copy = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const bytes = await output();
      if (bytes) {
        await window.simpleton.copyImage(bytes);
        flash("copied");
      }
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const bytes = await output();
      const slash = path.lastIndexOf("/");
      const base = path.slice(slash + 1).replace(/\.[^.]+$/, "");
      if (bytes && (await window.simpleton.saveImage(`${path.slice(0, slash)}/${base}-annotated.png`, bytes))) flash("saved");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (past.length && doc !== exported && !confirm("Discard your annotations?")) return;
    onClose();
  };

  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keys.current = (e: KeyboardEvent) => {
    if (e.target === textarea.current) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    let handled = true;
    if (mod && key === "z") (e.shiftKey ? redo : undo)();
    else if (mod && key === "c") copy();
    else if (mod && key === "s") save();
    else if (e.key === "Escape") {
      if (tool === "crop") cancelCrop();
      else if (selected) setSelected(null);
      else close();
    } else if (e.key === "Enter" && tool === "crop") finishCrop();
    else if ((e.key === "Backspace" || e.key === "Delete") && selected) remove();
    else if (!mod && !e.altKey && tools.some((t) => t.key.toLowerCase() === key)) setTool(tools.find((t) => t.key.toLowerCase() === key)!.id);
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    if (editing) requestAnimationFrame(() => textarea.current?.focus());
  }, [editing?.id, editing?.at.x, editing?.at.y]);

  const size = textSize(unit) * scale;
  const editorStyle: CSSProperties | undefined = editing
    ? {
        left: (layout.ox + editing.at.x) * scale,
        top: (layout.oy + editing.at.y) * scale,
        width: Math.max(measure(editing.text || "M", textSize(unit)) * scale + size, size * 3),
        height: editing.text.split("\n").length * size * 1.25 + size * 0.2,
        fontSize: size,
        lineHeight: 1.25,
        color: editing.color,
        caretColor: editing.color,
        WebkitTextStroke: `${size * 0.15}px ${light(editing.color) ? "rgba(0, 0, 0, 0.82)" : "#ffffff"}`,
        paintOrder: "stroke fill",
        fontFamily: font,
      }
    : undefined;

  const shown = cropping ? cropDraft! : doc.crop;

  return createPortal(
    <div className="no-drag fixed inset-0 z-[60] flex animate-fade flex-col bg-[#0b0b0c]/[0.92] backdrop-blur-md">
      <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 pl-24 pr-3">
        <div className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 truncate text-[12.5px] font-medium text-white/50" title={path}>
            {path.slice(path.lastIndexOf("/") + 1)}
          </span>
          <button type="button" onClick={() => window.simpleton.openImage(path)} aria-label="Open in Preview" title="Open in Preview" className={cn(iconButton, "size-7 shrink-0")}>
            <ExternalLink className="size-3.5" />
          </button>
        </div>
        <div className={pill}>
          {tools.map(({ id, icon: Icon, label, key }) => (
            <Tip key={id} label={`${label}  ${key}`}>
              <button type="button" onClick={() => setTool(id)} aria-label={label} aria-pressed={tool === id} className={cn(iconButton, tool === id && "bg-white/[0.14] text-white hover:bg-white/[0.14]")}>
                {Icon ? <Icon className="size-[17px]" strokeWidth={2} /> : <StepIcon />}
              </button>
            </Tip>
          ))}
          {divider}
          <div role="radiogroup" aria-label="Color" className="flex items-center gap-0.5 px-0.5">
            {colors.map((color) => (
              <button key={color} type="button" role="radio" aria-checked={prefs.color === color} aria-label={color} onClick={() => pick(color)} className="grid size-7 place-items-center rounded-full">
                <span className={cn("size-[18px] rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] transition-transform", prefs.color === color ? "scale-100 ring-2 ring-white ring-offset-2 ring-offset-[#1c1c1f]" : "scale-90 hover:scale-100")} style={{ background: color }} />
              </button>
            ))}
          </div>
          {divider}
          <Tip label="Undo  ⌘Z">
            <button type="button" onClick={undo} disabled={!past.length} aria-label="Undo" className={iconButton}>
              <Undo2 className="size-[17px]" />
            </button>
          </Tip>
          <Tip label="Redo  ⇧⌘Z">
            <button type="button" onClick={redo} disabled={!future.length} aria-label="Redo" className={iconButton}>
              <Redo2 className="size-[17px]" />
            </button>
          </Tip>
        </div>
        <div className="flex items-center justify-end gap-1.5">
          <button type="button" onClick={copy} disabled={!bitmap} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-40">
            {done === "copied" ? <Check className="size-4 text-[#34c759]" /> : <Copy className="size-4" />}
            {done === "copied" ? "Copied" : "Copy"}
          </button>
          <button type="button" onClick={save} disabled={!bitmap} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium text-black shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-colors hover:bg-white/90 disabled:opacity-40">
            {done === "saved" ? <Check className="size-4 text-[#16a34a]" /> : <Download className="size-4" />}
            {done === "saved" ? "Saved" : "Save"}
          </button>
          <button type="button" onClick={close} aria-label="Close" className={cn(iconButton, "ml-1")}>
            <X className="size-[18px]" />
          </button>
        </div>
      </header>

      <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center">
        {!bitmap && !failed && <Loader className="size-6 text-white/50" />}
        {failed && <p className="text-[13px] text-white/60">Couldn't open this image</p>}
        {bitmap && scale > 0 && (
          <div className="relative animate-pop shadow-[0_24px_80px_rgba(0,0,0,0.55)]" style={{ width: layout.width * scale, height: layout.height * scale }}>
            <canvas
              ref={canvas}
              onDoubleClick={(e) => {
                if (tool !== "select") return;
                const target = topmost(point(e), ["text"]);
                if (target?.kind === "text") setEditing({ id: target.id, at: target.at, text: target.text, color: target.color });
              }}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} className="block size-full touch-none" style={{ cursor }} />
            {editing && editorStyle && (
              <textarea
                ref={textarea}
                value={editing.text}
                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                onBlur={commitText}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
                    e.preventDefault();
                    commitText();
                  }
                }}
                spellCheck={false}
                rows={1}
                className="absolute resize-none overflow-hidden whitespace-pre bg-transparent p-0 font-bold outline-none"
                style={editorStyle}
              />
            )}
          </div>
        )}
      </div>

      <footer className="flex h-20 shrink-0 items-center justify-center">
        {bitmap && tool === "crop" ? (
          <div className={cn(pill, "gap-1 px-1.5")}>
            <span className="px-2 font-mono text-[12px] tabular-nums text-white/55">
              {shown.w} × {shown.h}
            </span>
            {divider}
            <button type="button" onClick={() => setCropDraft({ x: 0, y: 0, w: bitmap.width, h: bitmap.height })} className="h-8 rounded-lg px-3 text-[13px] font-medium text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white">
              Reset
            </button>
            <button type="button" onClick={finishCrop} className="h-8 rounded-lg bg-white px-3.5 text-[13px] font-medium text-black transition-colors hover:bg-white/90">
              Done
            </button>
          </div>
        ) : (
          bitmap && (
            <div className={cn(pill, "gap-1.5 px-1.5")}>
              <div role="radiogroup" aria-label="Backdrop" className="flex items-center gap-1.5">
                <button type="button" role="radio" aria-checked={prefs.backdrop < 0} aria-label="No backdrop" title="No backdrop" onClick={() => setPrefs({ backdrop: -1 })} className={cn("grid size-7 place-items-center rounded-lg bg-white/[0.06] text-white/45 transition-shadow hover:text-white/80", prefs.backdrop < 0 && "text-white ring-2 ring-white ring-offset-2 ring-offset-[#1c1c1f]")}>
                  <Ban className="size-3.5" />
                </button>
                {backdrops.map((b, i) => (
                  <button
                    key={b.name}
                    type="button"
                    role="radio"
                    aria-checked={prefs.backdrop === i}
                    aria-label={b.name}
                    title={b.name}
                    onClick={() => setPrefs({ backdrop: i })}
                    className={cn("size-7 rounded-lg shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] transition-[box-shadow,transform] hover:scale-105", prefs.backdrop === i && "ring-2 ring-white ring-offset-2 ring-offset-[#1c1c1f]")}
                    style={{ background: `linear-gradient(135deg, ${b.stops.join(", ")})` }}
                  />
                ))}
              </div>
              {prefs.backdrop >= 0 && (
                <>
                  {divider}
                  <div role="radiogroup" aria-label="Padding" className="flex items-center rounded-lg bg-white/[0.06] p-0.5">
                    {["S", "M", "L"].map((label, i) => (
                      <button key={label} type="button" role="radio" aria-checked={prefs.padding === i} aria-label={`Padding ${label}`} onClick={() => setPrefs({ padding: i })} className={cn("h-6 w-7 rounded-md text-[12px] font-semibold transition-colors", prefs.padding === i ? "bg-white/[0.16] text-white" : "text-white/45 hover:text-white/80")}>
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        )}
      </footer>
    </div>,
    document.body,
  );
}
