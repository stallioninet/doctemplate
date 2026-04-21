import { DocumentFormat } from '@prisma/client';
import { wrapHtml } from './htmlShell';
import type { FormatAdapter } from './types';

/**
 * DOCX adapter — maps HTML structures (headings, paragraphs, lists, tables,
 * inline runs) to DOCX via `html-to-docx`. The library walks the HTML DOM
 * and emits OOXML that Word and LibreOffice open natively.
 */
export const docxAdapter: FormatAdapter = {
  format: DocumentFormat.DOCX,
  extension: 'docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

  async generate(html) {
    const mod = await import('html-to-docx');
    const htmlToDocx = (mod.default ?? mod) as (
      htmlString: string,
      headerHTMLString?: string | null,
      options?: Record<string, unknown>,
      footerHTMLString?: string,
    ) => Promise<Buffer | Blob>;

    const result = await htmlToDocx(wrapHtml(html), null, {
      font: 'Helvetica',
      table: { row: { cantSplit: true } },
      margins: { top: 1134, right: 850, bottom: 1134, left: 850 }, // ~2cm / 1.5cm
    });

    if (Buffer.isBuffer(result)) return result;
    // Node environments on newer html-to-docx return a Blob-like.
    return Buffer.from(await (result as Blob).arrayBuffer());
  },
};
