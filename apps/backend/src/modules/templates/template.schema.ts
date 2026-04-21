import { z } from 'zod';

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  htmlContent: z.string().min(1),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

// Multipart fields — file is parsed by multer separately.
export const uploadTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
});
export type UploadTemplateInput = z.infer<typeof uploadTemplateSchema>;
