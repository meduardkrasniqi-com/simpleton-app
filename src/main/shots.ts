import { mkdirSync, writeFileSync } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import * as store from "./store";

const root = () => join(tmpdir(), "simpleton-shots");

const types = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

const written = new Map<string, string>();

export function dir(id: string) {
  const path = join(root(), id);
  mkdirSync(path, { recursive: true });
  return path;
}

export const appFile = (id: string) => join(dir(id), ".app-url");

export function publish(id: string, url: string) {
  if (written.get(id) === url) return;
  written.set(id, url);
  try {
    writeFileSync(appFile(id), url ? `${url}\n` : "");
  } catch {
    written.delete(id);
  }
}

export async function list(id: string) {
  const path = join(root(), id);
  const names = await readdir(path).catch(() => [] as string[]);
  const files = await Promise.all(
    names
      .filter((name) => !name.startsWith(".") && types.has(extname(name).toLowerCase()))
      .map(async (name) => {
        const file = join(path, name);
        const info = await stat(file).catch(() => null);
        return info?.isFile() ? { path: file, time: info.mtimeMs } : null;
      }),
  );
  return files
    .filter((file): file is { path: string; time: number } => file !== null)
    .sort((a, b) => b.time - a.time)
    .map((file) => file.path);
}

export async function remove(id: string, path: string) {
  const file = resolve(path);
  if (dirname(file) !== join(root(), id) || !types.has(extname(file).toLowerCase())) throw new Error("Not a screenshot of this workspace");
  await rm(file, { force: true });
}

export async function forget(id: string) {
  written.delete(id);
  await rm(join(root(), id), { recursive: true, force: true });
}

store.subscribe((state) => {
  for (const [id, preview] of Object.entries(state.previews)) publish(id, preview.state === "running" ? preview.url : "");
});
