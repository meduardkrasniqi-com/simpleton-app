import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { app } from "electron";

const lsregister = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

const run = (file: string, args: string[]) => new Promise<void>((done) => execFile(file, args, () => done()));

export async function register() {
  if (!app.isPackaged || process.platform !== "darwin") return;
  const bundle = resolve(app.getPath("exe"), "../../..");
  if (!bundle.endsWith(".app") || bundle.includes("/AppTranslocation/")) return;
  const marker = join(app.getPath("userData"), "registered");
  const stamp = `${app.getVersion()} ${bundle}`;
  if ((await readFile(marker, "utf8").catch(() => "")) === stamp) return;
  await run(lsregister, ["-f", bundle]);
  await run("/usr/bin/mdimport", [bundle]);
  await writeFile(marker, stamp).catch(() => undefined);
}
