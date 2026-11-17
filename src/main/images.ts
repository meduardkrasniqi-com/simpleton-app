import { readFile, stat, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";
import { clipboard, ClipboardItem, dialog, net, protocol, shell, type BrowserWindow } from "electron";

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

export async function read(path: string) {
  if (!isImage(path) || extname(path).toLowerCase() === ".svg") throw new Error("Not an image");
  return new Uint8Array(await readFile(path));
}

export async function copy(bytes: Uint8Array) {
  await clipboard.write([new ClipboardItem({ "image/png": new Blob([Buffer.from(bytes)], { type: "image/png" }) })]);
}

export async function save(window: BrowserWindow | null, suggested: string, bytes: Uint8Array) {
  const options = { defaultPath: suggested, filters: [{ name: "PNG image", extensions: ["png"] }] };
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return null;
  const target = extname(result.filePath).toLowerCase() === ".png" ? result.filePath : `${result.filePath}.png`;
  await writeFile(target, Buffer.from(bytes));
  return target;
}
