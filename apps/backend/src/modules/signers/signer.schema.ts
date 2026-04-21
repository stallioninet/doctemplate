import { z } from 'zod';

export const createSignerSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(1).max(200),
  order: z.number().int().min(0).max(1000).default(0),
});
export type CreateSignerInput = z.infer<typeof createSignerSchema>;

export const updateSignerSchema = createSignerSchema.partial();
export type UpdateSignerInput = z.infer<typeof updateSignerSchema>;
