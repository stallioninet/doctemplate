import { z } from 'zod';
import { PlaceholderKind, PlaceholderType } from '@prisma/client';

const coord = z.number().min(0).max(1000);

export const createPlaceholderSchema = z.object({
  // Human-readable label. COORD placeholders use this purely as a UI caption
  // for the box on the canvas, so any printable text is fine. BOOKMARK names
  // do feed docxtemplater's tag substitution via {{…}}; for that path the
  // frontend slugifies before submitting (see AddPlaceholderForm), so the
  // schema only needs to reject characters that would break the delimiters.
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[^{}]+$/, 'Name must not contain { or }'),
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
