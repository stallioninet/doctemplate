import { z } from 'zod';
import { FieldType } from '@prisma/client';

const coord = z.number().min(0).max(1000);

export const createFieldSchema = z.object({
  signerId: z.string().uuid(),
  type: z.nativeEnum(FieldType),
  page: z.number().int().min(1).default(1),
  x: coord,
  y: coord,
  width: coord,
  height: coord,
  required: z.boolean().default(true),
});
export type CreateFieldInput = z.infer<typeof createFieldSchema>;

export const updateFieldSchema = createFieldSchema.partial().omit({ signerId: true });
export type UpdateFieldInput = z.infer<typeof updateFieldSchema>;
