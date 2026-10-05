import { z } from "zod";

const viewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const reviewScreenSchema = z.object({
  id: z.string().min(1),
  ordinal: z.number().int().positive(),
  title: z.string().min(1),
  group: z.string().min(1),
  liveUrl: z.string().url().optional(),
  capturePath: z.string().min(1).optional(),
  viewport: viewportSchema,
  prepareState: z.string().min(1).optional(),
});

export type ReviewScreen = z.infer<typeof reviewScreenSchema>;

export function parseScreens(input: unknown): ReviewScreen[] {
  const screens = z.array(reviewScreenSchema).parse(input);
  const ids = new Set<string>();
  const ordinals = new Set<number>();
  for (const screen of screens) {
    if (ids.has(screen.id)) throw new Error(`Duplicate screen id: ${screen.id}`);
    if (ordinals.has(screen.ordinal)) {
      throw new Error(`Duplicate screen ordinal: ${screen.ordinal}`);
    }
    ids.add(screen.id);
    ordinals.add(screen.ordinal);
  }
  return [...screens].sort((left, right) => left.ordinal - right.ordinal);
}
