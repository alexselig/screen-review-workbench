import type { FeedbackRecord } from "./feedback";
import type { ReviewScreen } from "./manifest";

export type FeedbackExportInput = {
  projectId: string;
  screens: ReviewScreen[];
  feedback: FeedbackRecord[];
  // Full record set used for pin numbers, so filtered exports keep the same
  // numbers the reviewer sees on screen. Defaults to `feedback`.
  allFeedback?: FeedbackRecord[];
  // Human-readable description of what the export covers.
  scope?: string;
};

type ExportFeedback = FeedbackRecord & {
  screenOrdinal: number | null;
  screenTitle: string;
  pinNumber: number;
};

function feedbackGroupKey(item: FeedbackRecord) {
  return `${item.version}\0${item.screenId}`;
}

function comparePinOrder(left: FeedbackRecord, right: FeedbackRecord) {
  return (
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

export function createPinNumbers(feedback: FeedbackRecord[]) {
  const grouped = new Map<string, FeedbackRecord[]>();
  for (const item of feedback) {
    const key = feedbackGroupKey(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  const pinNumbers = new Map<string, number>();
  for (const records of grouped.values()) {
    records
      .sort(comparePinOrder)
      .forEach((item, index) => pinNumbers.set(item.id, index + 1));
  }
  return pinNumbers;
}

function safeFeedback(input: FeedbackExportInput): ExportFeedback[] {
  const screenById = new Map(input.screens.map((screen) => [screen.id, screen]));
  const pinNumbers = createPinNumbers(input.allFeedback ?? input.feedback);
  return input.feedback
    .map((item) => {
      const screen = screenById.get(item.screenId);
      return {
        ...item,
        screenOrdinal: screen?.ordinal ?? null,
        screenTitle: screen?.title ?? item.screenId,
        pinNumber: pinNumbers.get(item.id) ?? 0,
      };
    })
    .sort(
      (left, right) =>
        (left.screenOrdinal ?? Number.MAX_SAFE_INTEGER) -
          (right.screenOrdinal ?? Number.MAX_SAFE_INTEGER) ||
        left.screenId.localeCompare(right.screenId) ||
        left.pinNumber - right.pinNumber ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );
}

export function serializeJson(input: FeedbackExportInput): string {
  return `${JSON.stringify(
    {
      projectId: input.projectId,
      ...(input.scope ? { scope: input.scope } : {}),
      feedback: safeFeedback(input),
    },
    null,
    2,
  )}\n`;
}

function escapeMarkdown(value: string) {
  return value
    .replace(
      /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F-\u009F]/g,
      " ",
    )
    .replace(/([\\`*_[\]{}()#+\-!|>])/g, "\\$1")
    .replace(/\r\n?|\n/g, "<br>");
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function serializeMarkdown(input: FeedbackExportInput): string {
  const records = safeFeedback(input);
  const lines = [
    `# ${escapeMarkdown(input.projectId)} Screen Review Feedback`,
    "",
    ...(input.scope ? [`_Scope: ${escapeMarkdown(input.scope)}_`, ""] : []),
  ];
  let currentScreen = "";

  for (const item of records) {
    const screenKey = `${item.screenOrdinal ?? "?"}:${item.screenId}`;
    if (screenKey !== currentScreen) {
      if (currentScreen) lines.push("");
      lines.push(
        `## ${item.screenOrdinal === null ? "—" : String(item.screenOrdinal).padStart(2, "0")} · ${escapeMarkdown(item.screenTitle)}`,
        "",
      );
      currentScreen = screenKey;
    }
    const checked =
      item.status === "RESOLVED" || item.status === "WONT_FIX" ? "x" : " ";
    lines.push(
      `- [${checked}] **Pin ${item.pinNumber} · ${item.priority} · ${item.category} · ${item.status}** (${percent(item.x)}, ${percent(item.y)}): ${escapeMarkdown(item.note)}`,
    );
  }

  if (records.length === 0) {
    lines.push("No feedback matches the selected filters.");
  }
  return `${lines.join("\n")}\n`;
}
