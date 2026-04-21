import { DocumentFormat } from '@prisma/client';
import type { SourceParser } from './types';

/**
 * PDF → HTML.
 *
 * `pdf-parse` extracts raw text; we wrap paragraphs in `<p>` tags.
 * PDFs lose structural fidelity on extraction — complex layouts may flatten.
 * Placeholders (`{{var}}`) survive because they contain no special characters.
 */
export const pdfParser: SourceParser = {
  format: DocumentFormat.PDF,
  mimeTypes: ['application/pdf'],

  async parse(buffer) {
    // Lazy `require` (not top-level import) sidesteps pdf-parse's import-time
    // side effect that tries to read a bundled demo PDF.
    const pdfParse = require('pdf-parse') as (data: Buffer) => Promise<{ text: string }>;
    const { text } = await pdfParse(buffer);

    const html = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join('\n');

    return { html };
  },
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
