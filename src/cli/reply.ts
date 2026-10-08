// Lets an agent close the loop on review comments: list what is open, then
// reply to each comment (what was done, or why not) and set its status.
//
//   screencheck reply --project shop --list
//   screencheck reply --project shop --id <id> --status fixed \
//     --note "Moved the footer below the fold." [--author Copilot]
import { resolveOrigin, type RuntimeInfo } from "../server/runtime";
import { STATUS_LABELS, type FeedbackStatus } from "../shared/feedback";

type Status = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "WONT_FIX";

type FeedbackItem = {
  id: string;
  version: string;
  screenId: string;
  status: FeedbackStatus;
  tags: string[];
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type ReplyOptions = {
  project?: string;
  list?: boolean;
  all?: boolean;
  clear?: boolean;
  help?: boolean;
  id?: string;
  note?: string;
  status?: string;
  author?: string;
  url?: string;
  port?: string;
};

const STATUS_ALIASES: Record<string, Status> = {
  backlog: "OPEN",
  open: "OPEN",
  "in-progress": "IN_PROGRESS",
  in_progress: "IN_PROGRESS",
  fixed: "RESOLVED",
  resolved: "RESOLVED",
  "wont-fix": "WONT_FIX",
  wont_fix: "WONT_FIX",
  "won't-fix": "WONT_FIX",
};

const AGENT_STATUSES: readonly Status[] = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "WONT_FIX",
];
const LABELS = STATUS_LABELS;

const FLAGS = new Set(["list", "all", "clear", "help"]);

export const REPLY_USAGE = `Usage:
  screencheck reply --project <id> --list [--all]
  screencheck reply --project <id> --id <feedbackId> --note <text> [--status fixed|wont-fix|in-progress|backlog] [--author <name>]
  screencheck reply --project <id> --id <feedbackId> --clear
Options: --url <origin> or --port <n> (default $SCREENCHECK_URL, else the
running server in ~/.screencheck/server.json, else http://127.0.0.1:$PORT,
port 4173 if unset)`;

export function parseReplyArgs(argv: string[]): ReplyOptions {
  const options: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (FLAGS.has(key)) {
      options[key] = true;
    } else {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`--${key} needs a value.`);
      }
      options[key] = value;
      index += 1;
    }
  }
  return options as ReplyOptions;
}

export function normalizeStatus(value: string | undefined) {
  if (value === undefined) return undefined;
  if ((AGENT_STATUSES as readonly string[]).includes(value))
    return value as Status;
  if (value.toLowerCase() === "verified")
    throw new Error("Only a reviewer can mark a comment Verified.");
  const status = STATUS_ALIASES[value.toLowerCase()];
  if (!status) throw new Error(`Unknown status: ${value}`);
  return status;
}

function createClient(
  origin: string,
  project: string,
  fetchImpl: typeof fetch,
) {
  const base = `${origin}/api/projects/${encodeURIComponent(project)}/feedback`;
  async function request(url: string, init?: RequestInit) {
    const response = await fetchImpl(url, init);
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      feedback?: unknown;
    };
    return { status: response.status, body };
  }
  return {
    async list() {
      const { status, body } = await request(base);
      if (status !== 200) throw new Error(body.error ?? `HTTP ${status}`);
      return body.feedback as FeedbackItem[];
    },
    patch(id: string, expectedUpdatedAt: string, patch: unknown) {
      return request(`${base}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ expectedUpdatedAt, patch }),
      });
    },
  };
}

function pinNumbers(feedback: FeedbackItem[]) {
  const groups = new Map<string, FeedbackItem[]>();
  for (const item of feedback) {
    const key = `${item.version}\0${item.screenId}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const numbers = new Map<string, number>();
  for (const items of groups.values()) {
    items
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      )
      .forEach((item, index) => numbers.set(item.id, index + 1));
  }
  return numbers;
}

export type ReplyIo = {
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
  readRuntime?: () => RuntimeInfo | null;
};

// --url and --port win; otherwise the environment, then the running server.
export function replyOrigin(
  options: Pick<ReplyOptions, "url" | "port">,
  env: NodeJS.ProcessEnv = process.env,
  readRuntime?: () => RuntimeInfo | null,
) {
  if (options.url) return resolveOrigin(options.url, env, readRuntime);
  if (options.port) return `http://127.0.0.1:${options.port}`;
  return resolveOrigin(undefined, env, readRuntime);
}

export async function runReply(
  argv: string[],
  {
    fetch: fetchImpl = fetch,
    env = process.env,
    log = console.log,
    readRuntime,
  }: ReplyIo = {},
) {
  const options = parseReplyArgs(argv);
  if (options.help || !options.project) {
    log(REPLY_USAGE);
    return options.help ? 0 : 1;
  }
  const origin = replyOrigin(options, env, readRuntime);
  const client = createClient(origin, options.project, fetchImpl);

  if (options.list) {
    const feedback = await client.list();
    const numbers = pinNumbers(feedback);
    const shown = feedback.filter(
      (item) =>
        options.all || item.status === "OPEN" || item.status === "IN_PROGRESS",
    );
    for (const item of shown) {
      log(
        [
          item.id,
          `${item.version}/${item.screenId} pin ${numbers.get(item.id)}`,
          LABELS[item.status],
          item.tags.join(",") || "-",
          item.note.replace(/\s+/g, " "),
        ].join("\t"),
      );
    }
    if (!shown.length) log("No open feedback.");
    return 0;
  }

  if (!options.id) throw new Error("--id is required to reply.");
  const status = normalizeStatus(options.status);
  let patch: { reply: unknown; status?: Status };
  if (options.clear) {
    patch = { reply: null };
  } else {
    if (!options.note?.trim()) throw new Error("--note is required to reply.");
    patch = {
      reply: { note: options.note, author: options.author ?? "Agent" },
    };
  }
  if (status) patch.status = status;

  // Re-read and retry once if the reviewer edited the comment meanwhile.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = (await client.list()).find(
      (item) => item.id === options.id,
    );
    if (!current) throw new Error(`No feedback with id ${options.id}.`);
    const { status: code, body } = await client.patch(
      current.id,
      current.updatedAt,
      patch,
    );
    if (code === 200) {
      const updated = body.feedback as FeedbackItem;
      log(
        `${options.clear ? "Cleared reply on" : "Replied to"} ${current.id} (${LABELS[updated.status]}).`,
      );
      return 0;
    }
    if (code !== 409) throw new Error(body.error ?? `HTTP ${code}`);
  }
  throw new Error("Feedback kept changing; try again.");
}
