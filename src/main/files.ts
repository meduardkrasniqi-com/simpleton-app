import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { clipboard, ClipboardItem, dialog, Menu, protocol, shell, type BrowserWindow } from "electron";
import type { FileAction, FileTarget } from "@shared/types";
import { inside } from "./workspaces";

export const scheme = "simpleton-file";

const types: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".opus": "audio/ogg",
  ".pdf": "application/pdf",
};

export const privilege = { scheme, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } };

const body = (path: string, range?: { start: number; end: number }) => Readable.toWeb(createReadStream(path, range)) as unknown as ReadableStream;

export function handle() {
  protocol.handle(scheme, async (request) => {
    const url = new URL(request.url);
    const [, id, ...rest] = url.pathname.split("/");
    let full: string;
    try {
      full = inside(decodeURIComponent(id), rest.map(decodeURIComponent).join("/"));
    } catch {
      return new Response(null, { status: 403 });
    }
    const type = types[extname(full).toLowerCase()];
    const info = await stat(full).catch(() => null);
    if (!type || !info?.isFile()) return new Response(null, { status: 404 });
    const headers = { "content-type": type, "accept-ranges": "bytes", "cache-control": "no-store" };
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
    if (range && (range[1] || range[2])) {
      const size = info.size;
      const start = range[1] ? Number(range[1]) : Math.max(size - Number(range[2]), 0);
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
      return new Response(body(full, { start, end }), { status: 206, headers: { ...headers, "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${size}` } });
    }
    return new Response(body(full), { headers: { ...headers, "content-length": String(info.size) } });
  });
}

export async function info(id: string, path: string) {
  const found = await stat(inside(id, path));
  return { size: found.size, modified: found.mtimeMs };
}

export async function open(id: string, path: string) {
  const error = await shell.openPath(inside(id, path));
  if (error) throw new Error(error);
}

export function reveal(id: string, path: string) {
  shell.showItemInFolder(inside(id, path));
}

async function copy(full: string) {
  if (process.platform !== "darwin") return clipboard.writeText(full);
  await clipboard.write([new ClipboardItem({ 'electron application/osclipboard;format="public.file-url"': new Blob([pathToFileURL(full).href]), "text/plain": full })]);
}

async function trash(window: BrowserWindow | null, full: string) {
  const name = basename(full);
  const options = {
    type: "warning" as const,
    message: `Move ${name} to the Trash?`,
    buttons: ["Move to Trash", "Cancel"],
    defaultId: 0,
    cancelId: 1,
  };
  const { response } = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options);
  if (response !== 0) return false;
  await shell.trashItem(full);
  return true;
}

const fail = (title: string) => (error: unknown) => {
  dialog.showErrorBox(title, error instanceof Error ? error.message : String(error));
  return null;
};

export function menu(window: BrowserWindow | null, id: string, path: string, target: FileTarget) {
  const full = inside(id, path);
  const mac = process.platform === "darwin";
  const exists = target.exists !== false;
  return new Promise<FileAction | null>((done) => {
    let clicked = false;
    const act = (work: () => Promise<FileAction | null>) => () => {
      clicked = true;
      done(work().catch(fail("Something went wrong")));
    };
    const run = (action: FileAction, work?: () => unknown) => act(async () => (await work?.(), action));
    const items: Electron.MenuItemConstructorOptions[] = [
      ...(target.dir
        ? []
        : [
            { label: "Open Preview", click: run("preview") },
            ...(mac ? [{ label: "Quick Look", enabled: exists, click: run("quicklook", () => window?.previewFile(full)) }] : []),
            { label: "Open in Default App", enabled: exists, click: run("open", () => open(id, path)) },
          ]),
      { label: mac ? "Reveal in Finder" : "Show in Folder", enabled: exists, click: run("reveal", () => reveal(id, path)) },
      { type: "separator" },
      { label: "Copy", enabled: exists, click: run("copy", () => copy(full)) },
      { label: "Copy Path", click: run("copy-path", () => clipboard.writeText(full)) },
      { label: "Copy Relative Path", click: run("copy-relative-path", () => clipboard.writeText(path)) },
      { type: "separator" },
      { label: mac ? "Move to Trash" : "Delete", enabled: exists, click: act(() => trash(window, full).then((gone) => (gone ? "trash" : null), fail("Could not delete"))) },
    ];
    Menu.buildFromTemplate(items).popup({ window: window ?? undefined, callback: () => setTimeout(() => !clicked && done(null), 100) });
  });
}
