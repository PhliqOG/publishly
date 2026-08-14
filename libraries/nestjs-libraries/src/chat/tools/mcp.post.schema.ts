import { z } from 'zod';

const media = z.object({
  id: z.string().min(1).describe('Tenant-owned Publishly media ID'),
  path: z.string().url().describe('Exact URL returned for that media ID'),
  alt: z.string().optional(),
  thumbnail: z.string().url().optional(),
});

const content = z.object({
  id: z.string().optional(),
  content: z.string(),
  delay: z.number().int().min(0).optional(),
  image: z.array(media).default([]),
});

const destination = z.object({
  integration: z.object({
    id: z.string().min(1).describe('Publishly connection ID'),
  }),
  group: z.string().optional(),
  value: z.array(content).min(1),
  settings: z.record(z.any()).default({}),
});

const tag = z.object({
  value: z.string(),
  label: z.string(),
});

export const mcpPostFields = {
  idempotencyKey: z
    .string()
    .describe(
      'Stable 8-200 character creation-intent key; reuse it with the identical request after transport failure.'
    ),
  shortLink: z.boolean().default(false),
  tags: z.array(tag).default([]),
  posts: z.array(destination).min(1),
  order: z.string().optional(),
  inter: z.number().int().min(0).optional(),
  republish: z.boolean().optional(),
};

export const mcpPostResultSchema = z.object({
  output: z.array(
    z.object({
      postId: z.string(),
      integration: z.string(),
    })
  ),
  idempotencyReplayed: z.boolean(),
});

export function rawPostBody(input: Record<string, any>, date: string) {
  return {
    date,
    shortLink: input.shortLink,
    tags: input.tags,
    posts: input.posts,
    ...(input.order !== undefined ? { order: input.order } : {}),
    ...(input.inter !== undefined ? { inter: input.inter } : {}),
    ...(input.republish !== undefined ? { republish: input.republish } : {}),
  };
}
