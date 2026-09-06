import { z } from 'zod/v4';

export const anchorSchema = z
  .object({
    exact: z.string().min(1).max(30_000),
    prefix: z.string().max(120),
    suffix: z.string().max(120),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    selector: z.string().max(2000),
    heading: z.string().max(1000).optional(),
    sourceLine: z.number().int().positive().optional(),
    sourceEndLine: z.number().int().positive().optional(),
  })
  .refine(
    (value) => value.end > value.start && value.end - value.start === value.exact.length,
    'Invalid text offsets',
  );

export const entryInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('comment'),
    anchor: anchorSchema,
    body: z.string().trim().min(1).max(30_000),
  }),
  z.object({
    kind: z.literal('edit'),
    anchor: anchorSchema,
    body: z.string().max(30_000),
    replacement: z.string().max(30_000),
  }),
]);
export const entrySchema = z.object({
  id: z.string(),
  kind: z.enum(['comment', 'edit']),
  anchor: anchorSchema,
  body: z.string(),
  replacement: z.string().optional(),
  status: z.enum(['open', 'resolved']),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const sourceSchema = z.object({
  path: z.string(),
  name: z.string(),
  format: z.enum(['markdown', 'html', 'react']),
  hash: z.string(),
  content: z.string(),
});
export const decisionSchema = z.enum(['approved', 'changes_requested']);
export const roundSchema = z.object({
  number: z.number().int(),
  submittedAt: z.string(),
  source: sourceSchema,
  entries: z.array(entrySchema),
  notes: z.string(),
  decision: decisionSchema.optional(),
});
export const reviewSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  mode: z.enum(['feedback', 'plan']).default('feedback'),
  revision: z.number().int(),
  source: sourceSchema,
  entries: z.array(entrySchema),
  notes: z.string(),
  status: z.enum(['draft', 'submitted']),
  createdAt: z.string(),
  updatedAt: z.string(),
  rounds: z.array(roundSchema),
  archivedDrafts: z.array(
    z.object({
      source: sourceSchema,
      entries: z.array(entrySchema),
      notes: z.string(),
      archivedAt: z.string(),
    }),
  ),
});
export type Anchor = z.infer<typeof anchorSchema>;
export type EntryInput = z.infer<typeof entryInputSchema>;
export type Entry = z.infer<typeof entrySchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Round = z.infer<typeof roundSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type PublicReview = Omit<Review, 'source' | 'rounds' | 'archivedDrafts'> & {
  source: Omit<Source, 'content'>;
  roundCount: number;
  stale: boolean;
  outputPath: string;
  previewToken: string;
  decision?: Decision;
};
export type FrameMessage =
  | { type: 'selection'; anchor: Anchor; rect: { x: number; y: number; bottom: number } }
  | { type: 'ready' }
  | { type: 'focus'; id: string }
  | { type: 'locations'; locations: Record<string, number>; orphaned: string[] }
  | { type: 'preview-error'; message: string };
