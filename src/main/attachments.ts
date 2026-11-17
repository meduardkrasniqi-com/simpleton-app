import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { app, dialog, type BrowserWindow } from "electron";

export function dir() {
  const path = join(app.getPath("userData"), "attachments");
  mkdirSync(path, { recursive: true });
  return path;
}

export async function save(name: string, bytes: Uint8Array) {
  const folder = join(dir(), randomUUID().slice(0, 8));
  await mkdir(folder, { recursive: true });
  const target = join(folder, basename(name).replace(/[^\w.-]+/g, "-") || "file");
  await writeFile(target, Buffer.from(bytes));
  return target;
}

export async function pick(window: BrowserWindow | null) {
  const options = { title: "Attach files", properties: ["openFile" as const, "multiSelections" as const] };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  return result.canceled ? [] : result.filePaths;
}
