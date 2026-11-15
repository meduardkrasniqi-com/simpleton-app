import { chmodSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const prebuilds = resolve("node_modules/node-pty/prebuilds");
if (existsSync(prebuilds)) {
  for (const dir of readdirSync(prebuilds)) {
    const helper = join(prebuilds, dir, "spawn-helper");
    if (existsSync(helper)) chmodSync(helper, 0o755);
  }
}
