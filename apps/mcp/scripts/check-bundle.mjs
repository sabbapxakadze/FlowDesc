// Runs before `npm pack` / `npm publish` (the "prepack" script): refuses to make a package without the built program, so nobody can publish
// an empty or stale-looking tarball by forgetting `pnpm --filter flowdesc-mcp bundle`.
import { existsSync, readFileSync } from "node:fs";

const file = new URL("../bundle/index.js", import.meta.url);
if (!existsSync(file)) {
  console.error("bundle/index.js is missing. Run `pnpm --filter flowdesc-mcp bundle` first, then publish.");
  process.exit(1);
}
if (readFileSync(file, "utf8").includes("@flowdesc/contracts")) {
  console.error("bundle/index.js still imports @flowdesc/contracts, which is private and not on npm. The bundle step must inline it.");
  process.exit(1);
}
