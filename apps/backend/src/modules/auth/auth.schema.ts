import { z } from 'zod';

const slugRegex = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export const registerSchema = z.object({
  organizationName: z.string().min(1).max(120),
  organizationSlug: z
    .string()
    .min(2)
    .max(50)
    .regex(slugRegex, 'Slug must be lowercase alphanumeric with hyphens'),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;
