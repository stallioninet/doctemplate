import { z } from 'zod';
import { PlaceholderType } from '@prisma/client';

const coord = z.number().min(0).max(1000);

export const createPlaceholderSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z_][A-Za-z0-9_.\-]*$/, 'Use letters, digits, dot, dash or underscore'),
  type: z.nativeEnum(PlaceholderType).default(PlaceholderType.TEXT),
  page: z.number().int().min(1).default(1),
  x: coord,
  y: coord,
  width: coord,
  height: coord,
  required: z.boolean().default(true),
  defaultValue: z.string().max(500).optional(),
});
export type CreatePlaceholderInput = z.infer<typeof createPlaceholderSchema>;

export const updatePlaceholderSchema = createPlaceholderSchema.partial();
export type UpdatePlaceholderInput = z.infer<typeof updatePlaceholderSchema>;
