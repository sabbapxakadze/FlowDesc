#!/usr/bin/env node
/**
 * Replaces the plain `pnpm --parallel ... dev` command. Spawns the same
 * three watch processes (contracts, api, web) itself instead of leaving
 * that to pnpm, specifically so it can watch each one's real stdout for
 * the line that actually means "this is ready" — not a fixed delay, not
 * a guess, the literal message each tool already prints when it's
 * genuinely listening. Everything each child prints is still forwarded
 * to this terminal, just prefixed with its service name.
 */
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { readFileSync } from "node:fs";
import { styleText } from "node:util";
import figlet from "figlet";

const isWindows = process.platform === "win32";

const services = [
  {
    name: "contracts",
    filter: "@flowdesc/contracts",
    color: "gray",
    readyPattern: /Found 0 errors\. Watching for file changes/,
  },
  {
    name: "api",
    filter: "@flowdesc/api",
    color: "cyan",
    readyPattern: /flowdesc-api listening/,
  },
  {
    name: "web",
    filter: "@flowdesc/web",
    color: "magenta",
    readyPattern: /Local:/,
  },
];

/** Real check, not a fake status line — actually opens a TCP connection
 * to whatever host:port DATABASE_URL points at and sees if anything
 * answers. Doesn't run a query, doesn't need credentials to just prove
 * "is Postgres reachable" — that's exactly what api's own boot would
 * discover the hard way on the first real request otherwise. */
function checkPostgresReachable() {
  return new Promise((resolve) => {
    let databaseUrl;
    try {
      const envText = readFileSync(new URL("../apps/api/.env", import.meta.url), "utf-8");
      const match = envText.match(/^DATABASE_URL=(.+)$/m);
      databaseUrl = match?.[1]?.trim();
    } catch {
      resolve(false);
      return;
    }
    if (!databaseUrl) {
      resolve(false);
      return;
    }

    let host, port;
    try {
      const url = new URL(databaseUrl);
      host = url.hostname;
      port = Number(url.port) || 5432;
    } catch {
      resolve(false);
      return;
    }

    const socket = connect({ host, port, timeout: 2000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function drawBox(lines) {
  const width = Math.max(...lines.map((l) => stripAnsi(l).length));
  const pad = (line) => {
    const visibleLen = stripAnsi(line).length;
    const left = Math.floor((width - visibleLen) / 2);
    const right = width - visibleLen - left;
    return " ".repeat(left) + line + " ".repeat(right);
  };
  const border = "═".repeat(width + 4);
  const out = [`╔${border}╗`];
  for (const line of lines) {
    out.push(`║  ${pad(line)}  ║`);
  }
  out.push(`╚${border}╝`);
  return out.join("\n");
}

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function printPrefixed(name, color, chunk) {
  const lines = chunk.toString().split("\n").filter((l) => l.trim().length > 0);
  for (const line of lines) {
    process.stdout.write(`${styleText(color, `[${name}]`.padEnd(11))} ${line}\n`);
  }
}

async function main() {
  const banner = figlet.textSync("FLOWDESC", { font: "ANSI Shadow" });
  console.log(styleText(["cyan", "bold"], banner));
  console.log(styleText("dim", "  starting the dev environment...\n"));

  const children = [];
  const ready = { contracts: false, api: false, web: false };
  let bannerPrinted = false;

  async function maybePrintReadyBanner() {
    if (bannerPrinted || !Object.values(ready).every(Boolean)) return;
    bannerPrinted = true;

    const postgresUp = await checkPostgresReachable();

    const lines = [
      ...banner.split("\n"),
      "",
      styleText(["green", "bold"], "-> DEV ENVIRONMENT READY <-"),
      "",
      [
        postgresUp
          ? styleText("green", "* Postgres reachable")
          : styleText("red", "* Postgres unreachable"),
        styleText("green", "* API ready"),
        styleText("green", "* Web ready"),
      ].join("   "),
      "",
      styleText("cyan", "http://localhost:5173") + styleText("dim", "  (web app)"),
      styleText("cyan", "http://localhost:4000") + styleText("dim", "  (api)"),
    ];

    console.log("\n" + styleText("green", drawBox(lines)) + "\n");
  }

  for (const service of services) {
    // pnpm.cmd is a batch script on Windows, not a real executable —
    // spawn() needs a shell to interpret it (a bare spawn fails with
    // EINVAL). Node deprecates passing a separate args *array* together
    // with shell:true (args aren't escaped, just concatenated) — so on
    // Windows the whole command is built as one string instead; on POSIX
    // it stays the normal command+argv-array form, no shell needed.
    const command = `pnpm --filter ${service.filter} dev`;
    const child = isWindows
      ? spawn(command, { stdio: ["ignore", "pipe", "pipe"], shell: true })
      : spawn("pnpm", ["--filter", service.filter, "dev"], { stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);

    const onData = (chunk) => {
      printPrefixed(service.name, service.color, chunk);
      // ANSI color codes can land *inside* a word Vite prints (e.g.
      // "Local" + reset-code + ":") — matching against the raw chunk
      // would silently never see "Local:" as one contiguous substring.
      if (!ready[service.name] && service.readyPattern.test(stripAnsi(chunk.toString()))) {
        ready[service.name] = true;
        console.log(styleText("green", `  ✓ ${service.name} ready`));
        void maybePrintReadyBanner();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
  }

  function shutdown() {
    console.log("\n" + styleText("dim", "  shutting down..."));
    for (const child of children) {
      // On Windows, child.kill() alone often only signals the immediate
      // child, not the grandchildren pnpm itself spawns (tsx, vite, tsc)
      // — the same process-tree gap this project has hit before.
      // taskkill /t kills the whole tree; plain SIGTERM is enough on POSIX.
      if (isWindows) {
        spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"]);
      } else {
        child.kill("SIGTERM");
      }
    }
    process.exitCode = 0;
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
