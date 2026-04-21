import { z } from 'zod';
import { DocumentFormat } from '@prisma/client';

export const createDocumentSchema = z.object({
  templateId: z.string().uuid(),
  name: z.string().min(1).max(200),
  format: z.nativeEnum(DocumentFormat),
  data: z.record(z.string(), z.unknown()).default({}),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
