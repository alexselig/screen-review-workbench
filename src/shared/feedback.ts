import { z } from "zod";

export const FEEDBACK_CATEGORIES = [
  "LAYOUT",
  "CONTENT",
  "INTERACTION",
  "STATE",
  "ACCESSIBILITY",
] as const;

export const FEEDBACK_PRIORITIES = [
  "BLOCKING",
  "IMPORTANT",
  "POLISH",
] as const;

export const FEEDBACK_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "WONT_FIX",
] as const;

export const feedbackCategorySchema = z.enum(FEEDBACK_CATEGORIES);
export const feedbackPrioritySchema = z.enum(FEEDBACK_PRIORITIES);
export const feedbackStatusSchema = z.enum(FEEDBACK_STATUSES);
export const normalizedCoordinateSchema = z.number().finite().min(0).max(1);

export const feedbackRecordSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  screenId: z.string().min(1),
  version: z.string().min(1),
  x: normalizedCoordinateSchema,
  y: normalizedCoordinateSchema,
  note: z.string().trim().min(1),
  category: feedbackCategorySchema,
  priority: feedbackPrioritySchema,
  status: feedbackStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const createFeedbackInputSchema = z.object({
  clientMutationId: z.uuid(),
  screenId: z.string().min(1),
  version: z.string().min(1),
  x: normalizedCoordinateSchema,
  y: normalizedCoordinateSchema,
  note: z.string().trim().min(1),
  category: feedbackCategorySchema,
  priority: feedbackPrioritySchema,
  status: feedbackStatusSchema.optional().default("OPEN"),
});

export const feedbackPatchSchema = z
  .object({
    note: z.string().trim().min(1).optional(),
    category: feedbackCategorySchema.optional(),
    priority: feedbackPrioritySchema.optional(),
    status: feedbackStatusSchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Feedback update must change at least one field.",
  });

export const updateFeedbackInputSchema = z.object({
  expectedUpdatedAt: z.iso.datetime(),
  patch: feedbackPatchSchema,
});

export type FeedbackCategory = z.infer<typeof feedbackCategorySchema>;
export type FeedbackPriority = z.infer<typeof feedbackPrioritySchema>;
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

export function isOpenFeedback(feedback: FeedbackRecord): boolean {
  return feedback.status === "OPEN" || feedback.status === "IN_PROGRESS";
}
