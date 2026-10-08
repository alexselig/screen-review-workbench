import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { version } from "../../package.json";
import { serve } from "../server/index";
import { readRuntimeInfo, type RuntimeInfo } from "../server/runtime";
import { CAPTURE_USAGE, parseCaptureArgs, runCapture } from "./capture";
import { REPLY_USAGE, runReply } from "./reply";

export const VERSION = version;

export const HELP = `ScreenCheck ${version}: localhost design review with pin feedback.

Usage: screencheck <command> [options]

Commands:
  serve     Start the review server (default port 4173)
  status    Show whether a server is running and where
  reply     List open comments or reply to one
  mcp       Run the MCP server on stdio for coding agents
  capture   Take a full-page screenshot without mid-page footers

Run "screencheck <command> --help" for a command's options.
Data lives in ~/.screencheck (override with SCREENCHECK_DATA and
SCREENCHECK_PROJECTS).`;

const SERVE_USAGE = `Usage:
  screencheck serve [--port 4173] [--open]

Starts ScreenCheck on http://127.0.0.1:<port> (default $PORT, else 4173) and
records it in ~/.screencheck/server.json so other commands find it.
  --open    Open the review page in your browser`;

const STATUS_USAGE = `Usage:
  screencheck status

Prints the origin of the running server, or "not running" (exit 1).`;

const MCP_USAGE = `Usage:
  screencheck mcp [--url <origin>] [--author <name>]

Runs the ScreenCheck MCP server over stdio. Without --url it talks to the
running server recorded in ~/.screencheck/server.json.`;

export type McpModule = {
  runMcpServer(options?: { origin?: string; author?: string }): Promise<void>;
};

// The MCP server ships as its own module: dist/mcp/server.js in the package,
// src/mcp/server.ts when run from source.
const MCP_CANDIDATES = ["./mcp/server.js", "../mcp/server.ts"];

export async function loadMcpModule(
  candidates: readonly string[] = MCP_CANDIDATES,
  base: string = import.meta.url,
): Promise<McpModule> {
  for (const candidate of candidates) {
    const url = new URL(candidate, base);
    if (!existsSync(fileURLToPath(url))) continue;
    const loaded = (await import(url.href)) as Partial<McpModule>;
    if (typeof loaded.runMcpServer === "function") return loaded as McpModule;
  }
  throw new Error(
    "MCP server not built: this copy of ScreenCheck has no MCP module.",
  );
}

export function openCommand(platform: NodeJS.Platform = process.platform) {
  if (platform === "darwin") return { command: "open", args: [] };
  if (platform === "win32")
    return { command: "cmd", args: ["/c", "start", ""] };
  return { command: "xdg-open", args: [] };
}

function openBrowser(url: string) {
  const { command, args } = openCommand();
  const child = spawn(command, [...args, url], {
    detached: true,
    stdio: "ignore",
  });
  child.on("error", () => console.error(`Could not open a browser: ${url}`));
  child.unref();
}

export type CliIo = {
  log?: (line: string) => void;
  error?: (line: string) => void;
  env?: NodeJS.ProcessEnv;
  // Built client to serve; when missing the server falls back to Vite dev.
  clientRoot?: string;
  loadMcp?: () => Promise<McpModule>;
  readRuntime?: () => RuntimeInfo | null;
  open?: (url: string) => void;
};

function wantsHelp(argv: string[]) {
  return argv.includes("--help") || argv.includes("-h");
}

// Returns the exit code, or "running" when the command keeps the process
// alive (serve, mcp).
export async function main(
  argv: string[],
  io: CliIo = {},
): Promise<number | "running"> {
  const log = io.log ?? console.log;
  const error = io.error ?? console.error;
  const env = io.env ?? process.env;
  const readRuntime = io.readRuntime ?? (() => readRuntimeInfo());
  const [command, ...rest] = argv;

  try {
    switch (command) {
      case undefined:
      case "help":
      case "--help":
      case "-h":
        log(HELP);
        return command === undefined ? 1 : 0;
      case "--version":
      case "-v":
      case "version":
        log(version);
        return 0;
      case "serve": {
        if (wantsHelp(rest)) return (log(SERVE_USAGE), 0);
        const { values } = parseArgs({
          args: rest,
          options: {
            port: { type: "string", short: "p" },
            open: { type: "boolean" },
          },
        });
        const port = Number(values.port ?? env.PORT ?? "4173");
        if (!Number.isInteger(port) || port < 0 || port > 65535) {
          throw new Error(`Invalid port: ${values.port ?? env.PORT}`);
        }
        const running = await serve({
          port,
          ...(io.clientRoot ? { clientRoot: io.clientRoot } : {}),
        });
        if (values.open) (io.open ?? openBrowser)(running.origin);
        return "running";
      }
      case "status": {
        if (wantsHelp(rest)) return (log(STATUS_USAGE), 0);
        const info = readRuntime();
        if (!info) {
          log("ScreenCheck is not running.");
          return 1;
        }
        log(`ScreenCheck is running at ${info.origin}`);
        log(`  pid ${info.pid}, started ${info.startedAt}`);
        log(`  feedback: ${info.dataRoot}`);
        log(`  projects: ${info.projectsRoot}`);
        return 0;
      }
      case "reply":
        if (wantsHelp(rest)) return (log(REPLY_USAGE), 0);
        return await runReply(rest, { log, env, readRuntime });
      case "mcp": {
        if (wantsHelp(rest)) return (log(MCP_USAGE), 0);
        const { values } = parseArgs({
          args: rest,
          options: {
            url: { type: "string" },
            author: { type: "string" },
          },
        });
        const { runMcpServer } = await (io.loadMcp ?? loadMcpModule)();
        await runMcpServer({
          ...(values.url ? { origin: values.url } : {}),
          ...(values.author ? { author: values.author } : {}),
        });
        return "running";
      }
      case "capture": {
        const job = parseCaptureArgs(rest);
        if (job === "help") return (log(CAPTURE_USAGE), 0);
        await runCapture(job, { log });
        return 0;
      }
      default:
        error(`Unknown command: ${command}\n`);
        error(HELP);
        return 1;
    }
  } catch (caught) {
    error(caught instanceof Error ? caught.message : String(caught));
    return 1;
  }
}
