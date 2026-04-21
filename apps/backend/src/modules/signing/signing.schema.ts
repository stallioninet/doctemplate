import { z } from 'zod';

export const submitFieldSchema = z.object({
  value: z.string().min(1).max(100_000),
});
export type SubmitFieldInput = z.infer<typeof submitFieldSchema>;

export const declineSchema = z.object({
  reason: z.string().max(1000).optional(),
});
export type DeclineInput = z.infer<typeof declineSchema>;
