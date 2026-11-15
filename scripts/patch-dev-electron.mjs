import { execFileSync } from "node:child_process";
import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const lsregister = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

if (process.platform === "darwin") {
  const root = resolve("node_modules/electron");
  const original = `${root}/dist/Electron.app`;
  const bundle = `${root}/dist/Simpleton.app`;

  if (existsSync(original)) {
    rmSync(bundle, { recursive: true, force: true });
    renameSync(original, bundle);
    try {
      execFileSync(lsregister, ["-u", original], { stdio: "ignore" });
    } catch {}
  }

  if (existsSync(bundle)) {
    const plist = `${bundle}/Contents/Info.plist`;
    for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
      execFileSync("plutil", ["-replace", key, "-string", "Simpleton", plist]);
    }
    execFileSync("plutil", ["-replace", "CFBundleIdentifier", "-string", "io.simpleton.app.dev", plist]);
    execFileSync("plutil", ["-replace", "CFBundleURLTypes", "-json", JSON.stringify([{ CFBundleURLName: "Simpleton", CFBundleURLSchemes: ["simpleton"] }]), plist]);
    writeFileSync(`${root}/path.txt`, "Simpleton.app/Contents/MacOS/Electron");
    try {
      execFileSync("codesign", ["--force", "--deep", "--sign", "-", bundle], { stdio: "ignore" });
    } catch {}
    execFileSync(lsregister, ["-f", bundle]);
  }
}
