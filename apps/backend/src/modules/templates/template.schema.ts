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

// Wrap a span of text in the source .docx with `{{name}}` so the existing
// docxtemplater path will substitute it at generation time. The same regex
// used for placeholder names in placeholder.schema — a value here becomes a
// placeholder identifier.
export const replaceTextSchema = z.object({
  sourceText: z.string().min(1).max(2000),
  placeholderName: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z_][A-Za-z0-9_.\-]*$/, 'Use letters, digits, dot, dash or underscore'),
});
export type ReplaceTextInput = z.infer<typeof replaceTextSchema>;
