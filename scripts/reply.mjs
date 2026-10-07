#!/usr/bin/env node
// Lets an agent close the loop on review comments: list what is open, then
// reply to each comment (what was done, or why not) and set its status.
//
//   node scripts/reply.mjs --project shop --list
//   node scripts/reply.mjs --project shop --id <id> --status fixed \
//     --note "Moved the footer below the fold." [--author Copilot]
import { pathToFileURL } from "node:url";

const STATUS_ALIASES = {
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

const LABELS = {
  OPEN: "Backlog",
  IN_PROGRESS: "In progress",
  RESOLVED: "Fixed",
  WONT_FIX: "Won't fix",
};

const USAGE = `Usage:
  reply.mjs --project <id> --list [--all]
  reply.mjs --project <id> --id <feedbackId> --note <text> [--status fixed|wont-fix|in-progress|backlog] [--author <name>]
  reply.mjs --project <id> --id <feedbackId> --clear
Options: --url <origin> or --port <n> (default $SCREEN_REVIEW_URL, else http://127.0.0.1:$PORT, port 4173 if unset)`;

export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (["list", "all", "clear", "help"].includes(key)) {
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
  return options;
}

export function normalizeStatus(value) {
  if (value === undefined) return undefined;
  if (Object.hasOwn(LABELS, value)) return value;
  const status = STATUS_ALIASES[value.toLowerCase()];
  if (!status) throw new Error(`Unknown status: ${value}`);
  return status;
}

function createClient(origin, project, fetchImpl) {
  const base = `${origin}/api/projects/${encodeURIComponent(project)}/feedback`;
  async function request(url, init) {
    const response = await fetchImpl(url, init);
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  }
  return {
    async list() {
      const { status, body } = await request(base);
      if (status !== 200) throw new Error(body.error ?? `HTTP ${status}`);
      return body.feedback;
    },
    patch(id, expectedUpdatedAt, patch) {
      return request(`${base}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ expectedUpdatedAt, patch }),
      });
    },
  };
}

function pinNumbers(feedback) {
  const groups = new Map();
  for (const item of feedback) {
    const key = `${item.version}\0${item.screenId}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const numbers = new Map();
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

export async function run(
  argv,
  { fetch: fetchImpl = fetch, env = process.env, log = console.log } = {},
) {
  const options = parseArgs(argv);
  if (options.help || !options.project) {
    log(USAGE);
    return options.help ? 0 : 1;
  }
  const origin = (
    options.url ??
    env.SCREEN_REVIEW_URL ??
    `http://127.0.0.1:${options.port ?? env.PORT ?? "4173"}`
  ).replace(/\/$/, "");
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
  let patch;
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
      log(
        `${options.clear ? "Cleared reply on" : "Replied to"} ${current.id} (${LABELS[body.feedback.status]}).`,
      );
      return 0;
    }
    if (code !== 409) throw new Error(body.error ?? `HTTP ${code}`);
  }
  throw new Error("Feedback kept changing; try again.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}
