import { DocumentFormat } from '@prisma/client';
import type { SourceParser } from './types';

/**
 * DOCX → HTML via mammoth.
 * Preserves paragraphs, headings, basic runs, tables, lists.
 */
export const docxParser: SourceParser = {
  format: DocumentFormat.DOCX,
  mimeTypes: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ],

  async parse(buffer) {
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ buffer });
    return { html: result.value };
  },
};
