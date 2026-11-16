import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol, shell } from "electron";

export const scheme = "simpleton-image";

const types: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml" };

export const isImage = (path: string) => path.startsWith("/") && extname(path).toLowerCase() in types;

export function registerScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
}

export function handle() {
  protocol.handle(scheme, async (request) => {
    const path = decodeURIComponent(new URL(request.url).pathname);
    if (!isImage(path) || !(await stat(path).then((s) => s.isFile(), () => false))) return new Response(null, { status: 404 });
    const file = await net.fetch(pathToFileURL(path).toString());
    return new Response(file.body, { headers: { "content-type": types[extname(path).toLowerCase()], "cache-control": "no-store" } });
  });
}

export async function open(path: string) {
  if (isImage(path)) await shell.openPath(path);
}
