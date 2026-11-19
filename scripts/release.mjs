import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";

const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });
const read = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

const { version, productName } = JSON.parse(readFileSync("package.json", "utf8"));
const tag = `v${version}`;
const repo = "simpleton-io/simpleton";
const legacy = "simpleton-io/releases";
const archs = ["arm64", "x64"];
const file = (arch, ext) => `${productName}-${version}-${arch}.${ext}`;
const hash = (name, algorithm, encoding) => createHash(algorithm).update(readFileSync(`dist/${name}`)).digest(encoding);

delete process.env.ELECTRON_RUN_AS_NODE;

const head = read("git rev-parse HEAD");
if (!read(`git branch -r --contains ${head}`)) {
  console.error("Push this commit to GitHub first, so the release tag can point at it.");
  process.exit(1);
}

if (!process.argv.includes("--skip-build")) {
  run("rm -rf dist && npm run build");
  run("npx electron-builder --mac --publish never", {
    APPLE_KEYCHAIN_PROFILE: process.env.APPLE_KEYCHAIN_PROFILE || "simpleton",
  });
}

for (const dir of ["dist/mac", "dist/mac-arm64"]) {
  try {
    execFileSync("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", ["-u", `${dir}/${productName}.app`], { stdio: "ignore" });
  } catch {}
  rmSync(dir, { recursive: true, force: true });
}

const entries = archs.flatMap((arch) => ["zip", "dmg"].map((ext) => file(arch, ext)));
const latest = [
  `version: ${version}`,
  "files:",
  ...entries.flatMap((name) => [
    `  - url: ${name}`,
    `    sha512: ${hash(name, "sha512", "base64")}`,
    `    size: ${statSync(`dist/${name}`).size}`,
  ]),
  `path: ${file("arm64", "zip")}`,
  `sha512: ${hash(file("arm64", "zip"), "sha512", "base64")}`,
  `releaseDate: '${new Date().toISOString()}'`,
  "",
].join("\n");
writeFileSync("dist/latest-mac.yml", latest);

const stable = archs.map((arch) => {
  const name = `${productName}-${arch}.dmg`;
  copyFileSync(`dist/${file(arch, "dmg")}`, `dist/${name}`);
  return name;
});
const assets = [...entries, ...entries.map((name) => `${name}.blockmap`), ...stable, "latest-mac.yml"].map((name) => `dist/${name}`);
function publish(target, extra = []) {
  let exists = true;
  try {
    read(`gh release view ${tag} -R ${target} --json tagName`);
  } catch {
    exists = false;
  }
  if (exists) execFileSync("gh", ["release", "upload", tag, ...assets, "-R", target, "--clobber"], { stdio: "inherit" });
  else execFileSync("gh", ["release", "create", tag, ...assets, "-R", target, "--title", version, "--notes", "", "--latest", ...extra], { stdio: "inherit" });
}

publish(repo, ["--target", head]);
publish(legacy);

const cask = `cask "simpleton" do
  arch arm: "arm64", intel: "x64"

  version "${version}"
  sha256 arm:   "${hash(file("arm64", "zip"), "sha256", "hex")}",
         intel: "${hash(file("x64", "zip"), "sha256", "hex")}"

  url "https://github.com/${repo}/releases/download/v#{version}/${productName}-#{version}-#{arch}.zip"
  name "Simpleton"
  desc "Run coding agents in parallel, share live links, open PRs in one click"
  homepage "https://www.simpleton.io"

  auto_updates true
  depends_on macos: ">= :ventura"

  app "Simpleton.app"

  zap trash: [
    "~/Library/Application Support/Simpleton",
    "~/Library/Preferences/io.simpleton.app.plist",
    "~/Library/Saved Application State/io.simpleton.app.savedState",
  ]
end
`;

const path = "repos/simpleton-io/homebrew-tap/contents/Casks/simpleton.rb";
let current = "";
try {
  current = read(`gh api ${path} --jq .sha`);
} catch {}
const body = JSON.stringify({
  message: `simpleton ${version}`,
  content: Buffer.from(cask).toString("base64"),
  ...(current ? { sha: current } : {}),
});
execSync(`gh api -X PUT ${path} --input -`, { input: body, stdio: ["pipe", "ignore", "inherit"] });
try {
  execFileSync("gh", ["workflow", "run", "linux.yml", "-R", repo, "--ref", "main"], { stdio: "inherit" });
} catch {
  console.log("Couldn't start the Linux build. Run the Linux release workflow on GitHub.");
}
console.log(`\nReleased ${version}. brew install --cask simpleton-io/tap/simpleton`);
