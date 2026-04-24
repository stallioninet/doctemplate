import { z } from 'zod';
import { PlaceholderKind, PlaceholderType } from '@prisma/client';

const coord = z.number().min(0).max(1000);

export const createPlaceholderSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z_][A-Za-z0-9_.\-]*$/, 'Use letters, digits, dot, dash or underscore'),
  type: z.nativeEnum(PlaceholderType).default(PlaceholderType.TEXT),
  // Bookmark-mode placeholders are name-only (the position is whatever the
  // Word bookmark spans). Coordinates default to 0 since they're meaningless
  // for that kind, but stay required for the visual COORD editor.
  kind: z.nativeEnum(PlaceholderKind).default(PlaceholderKind.COORD),
  page: z.number().int().min(1).default(1),
  x: coord.default(0),
  y: coord.default(0),
  width: coord.default(0),
  height: coord.default(0),
  required: z.boolean().default(true),
  defaultValue: z.string().max(500).optional(),
});
export type CreatePlaceholderInput = z.infer<typeof createPlaceholderSchema>;

export const updatePlaceholderSchema = createPlaceholderSchema.partial();
export type UpdatePlaceholderInput = z.infer<typeof updatePlaceholderSchema>;
