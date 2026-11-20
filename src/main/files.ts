import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";
import { protocol, shell } from "electron";
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
