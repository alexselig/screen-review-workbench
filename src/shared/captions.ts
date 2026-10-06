import { z } from "zod";

export const CAPTION_MAX_LENGTH = 500;

// A reviewer-written line saying what a capture shows (step, path, state).
// Stored per version because each version has its own captures.
export const screenCaptionSchema = z.object({
  version: z.string().min(1).max(200),
  screenId: z.string().min(1).max(200),
  text: z.string().trim().min(1).max(CAPTION_MAX_LENGTH),
  updatedAt: z.iso.datetime(),
});

// Empty text removes the saved caption, falling back to the manifest's.
export const setCaptionInputSchema = z.object({
  version: z.string().min(1).max(200),
  screenId: z.string().min(1).max(200),
  text: z.string().trim().max(CAPTION_MAX_LENGTH),
});

export type ScreenCaption = z.infer<typeof screenCaptionSchema>;
export type SetCaptionInput = z.infer<typeof setCaptionInputSchema>;

export function captionFor(
  captions: readonly ScreenCaption[],
  version: string,
  screenId: string,
) {
  return captions.find(
    (item) => item.version === version && item.screenId === screenId,
  )?.text;
}
