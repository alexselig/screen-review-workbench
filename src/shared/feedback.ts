import { z } from "zod";

// Priority lives in tags: suggested P0-P2, plus any free-text tag.
export const PRIORITY_TAGS = ["P0", "P1", "P2"] as const;
export type PriorityTag = (typeof PRIORITY_TAGS)[number];

const LEGACY_PRIORITY_TAGS: Record<string, PriorityTag> = {
  BLOCKING: "P0",
  IMPORTANT: "P1",
  POLISH: "P2",
};

export const FEEDBACK_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "WONT_FIX",
] as const;

export const feedbackTagSchema = z.string().trim().min(1).max(32);
export const feedbackTagsSchema = z
  .array(feedbackTagSchema)
  .max(12)
  .transform(normalizeTags);
export const feedbackStatusSchema = z.enum(FEEDBACK_STATUSES);

// One vocabulary for the status picker, the pane sections and exports.
export const STATUS_LABELS: Record<(typeof FEEDBACK_STATUSES)[number], string> =
  {
    OPEN: "Backlog",
    IN_PROGRESS: "In progress",
    RESOLVED: "Fixed",
    WONT_FIX: "Won't fix",
  };
export const normalizedCoordinateSchema = z.number().finite().min(0).max(1);

export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    const upper = tag.toUpperCase();
    const value = (PRIORITY_TAGS as readonly string[]).includes(upper)
      ? upper
      : tag;
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    result.push(value);
  }
  return result;
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

// Records saved before tags existed carry `priority` and `category`; read them
// as tags so nothing on disk has to be rewritten up front.
export function migrateLegacyTags(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.tags)) return record;
  const { priority, category, ...rest } = record;
  const tags: string[] = [];
  if (typeof priority === "string" && LEGACY_PRIORITY_TAGS[priority]) {
    tags.push(LEGACY_PRIORITY_TAGS[priority]);
  }
  if (typeof category === "string" && category) tags.push(titleCase(category));
  return { ...rest, tags };
}

const feedbackRecordObjectSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  screenId: z.string().min(1),
  version: z.string().min(1),
  x: normalizedCoordinateSchema,
  y: normalizedCoordinateSchema,
  note: z.string().trim().min(1),
  tags: feedbackTagsSchema,
  status: feedbackStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const feedbackRecordSchema = z.preprocess(
  migrateLegacyTags,
  feedbackRecordObjectSchema,
);

export const createFeedbackInputSchema = z.object({
  clientMutationId: z.uuid(),
  screenId: z.string().min(1),
  version: z.string().min(1),
  x: normalizedCoordinateSchema,
  y: normalizedCoordinateSchema,
  note: z.string().trim().min(1),
  tags: feedbackTagsSchema.optional().default([]),
  status: feedbackStatusSchema.optional().default("OPEN"),
});

export const feedbackPatchSchema = z
  .object({
    note: z.string().trim().min(1).optional(),
    tags: feedbackTagsSchema.optional(),
    status: feedbackStatusSchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Feedback update must change at least one field.",
  });

export const updateFeedbackInputSchema = z.object({
  expectedUpdatedAt: z.iso.datetime(),
  patch: feedbackPatchSchema,
});

export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;
export type FeedbackRecord = z.infer<typeof feedbackRecordSchema>;
export type CreateFeedbackInput = z.input<typeof createFeedbackInputSchema>;
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackInputSchema>;
export type FeedbackPatch = z.infer<typeof feedbackPatchSchema>;

export type FrameRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function normalizePinCoordinates(
  clientX: number,
  clientY: number,
  frame: FrameRect,
): { x: number; y: number } {
  if (frame.width <= 0 || frame.height <= 0) {
    throw new Error("Feedback frame must have a positive size.");
  }
  const x = (clientX - frame.left) / frame.width;
  const y = (clientY - frame.top) / frame.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    throw new Error("Feedback pins must be placed inside the review frame.");
  }
  return {
    x: Number(x.toFixed(6)),
    y: Number(y.toFixed(6)),
  };
}

export function priorityTag(tags: readonly string[]): PriorityTag | null {
  for (const priority of PRIORITY_TAGS) {
    if (tags.includes(priority)) return priority;
  }
  return null;
}

export function isOpenFeedback(feedback: FeedbackRecord): boolean {
  return feedback.status === "OPEN" || feedback.status === "IN_PROGRESS";
}
