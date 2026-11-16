import { execFileSync } from "node:child_process";
import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const lsregister = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

if (process.platform === "darwin") {
  const root = resolve("node_modules/electron");
  const bundle = `${root}/dist/Simpleton Dev.app`;

  for (const source of [`${root}/dist/Electron.app`, `${root}/dist/Simpleton.app`]) {
    if (!existsSync(source)) continue;
    rmSync(bundle, { recursive: true, force: true });
    renameSync(source, bundle);
    try {
      execFileSync(lsregister, ["-u", source], { stdio: "ignore" });
    } catch {}
    break;
  }

  if (existsSync(bundle)) {
    const plist = `${bundle}/Contents/Info.plist`;
    for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
      execFileSync("plutil", ["-replace", key, "-string", "Simpleton Dev", plist]);
    }
    execFileSync("plutil", ["-replace", "CFBundleIdentifier", "-string", "io.simpleton.app.dev", plist]);
    execFileSync("plutil", ["-replace", "CFBundleURLTypes", "-json", JSON.stringify([{ CFBundleURLName: "Simpleton", CFBundleURLSchemes: ["simpleton"] }]), plist]);
    writeFileSync(`${root}/path.txt`, "Simpleton Dev.app/Contents/MacOS/Electron");
    try {
      execFileSync("codesign", ["--force", "--deep", "--sign", "-", bundle], { stdio: "ignore" });
    } catch {}
    execFileSync(lsregister, ["-f", bundle]);
  }
}
