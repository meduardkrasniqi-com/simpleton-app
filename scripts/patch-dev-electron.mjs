import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

if (process.platform === "darwin") {
  const bundle = resolve("node_modules/electron/dist/Electron.app");
  const plist = `${bundle}/Contents/Info.plist`;
  if (existsSync(plist)) {
    for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
      execFileSync("plutil", ["-replace", key, "-string", "Simpleton", plist]);
    }
    execFileSync("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", ["-f", bundle]);
  }
}
