import { z } from 'zod';
import { DocumentFormat } from '@prisma/client';

// Multipart form fields — file is handled separately by multer.
export const registerTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  externalId: z.string().min(1).max(200),
});
export type RegisterTemplateInput = z.infer<typeof registerTemplateSchema>;

/**
 * Drupal-originated documents may be requested as PDF or DOCX only
 * (per integration contract). RTF remains supported for other channels.
 */
export const drupalOutputFormatSchema = z.enum([DocumentFormat.PDF, DocumentFormat.DOCX]);

export const createDocumentSchema = z
  .object({
    templateId: z.string().uuid().optional(),
    externalTemplateId: z.string().min(1).optional(),
    name: z.string().min(1).max(200),
    outputFormat: drupalOutputFormatSchema,
    values: z.record(z.string(), z.unknown()).default({}),
    externalId: z.string().min(1).max(200),
    webhookUrl: z.string().url(),
  })
  .refine((v) => Boolean(v.templateId) || Boolean(v.externalTemplateId), {
    message: 'Either templateId or externalTemplateId is required',
    path: ['templateId'],
  });
export type CreateDocumentDrupalInput = z.infer<typeof createDocumentSchema>;
