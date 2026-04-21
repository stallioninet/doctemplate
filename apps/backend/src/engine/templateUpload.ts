import { randomUUID } from 'crypto';
import { fileStorage, type SaveResult } from '../storage/fileStorage';
import { AppError } from '../utils/errors';
import { getAdapter } from './adapters';
import { wrapHtml } from './adapters/htmlShell';

const PDF_MIME = 'application/pdf';
const DOCX_MIMES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

export interface UploadedTemplateSource {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

export interface NormalizedTemplateSource {
  pdfBytes: Buffer;
  storedKey: string;
  storedSize: number;
  storedMimeType: 'application/pdf';
  /** Raw mime of the *uploaded* file before any conversion (for display). */
  uploadedMimeType: string;
}

/**
 * Accept a PDF or Word file and return a PDF buffer + storage key. PDFs are
 * stored as-is; DOCX is converted via the existing mammoth (DOCX→HTML) +
 * Puppeteer (HTML→PDF) stack so the downstream visual placeholder editor
 * has a single canonical render to draw on.
 *
 * Layout fidelity for DOCX is whatever Puppeteer's HTML render produces —
 * close to the original for simple documents, lossy for complex ones with
 * intricate layouts. Real perfect-fidelity needs LibreOffice headless.
 */
export async function normalizeUploadedTemplate(
  source: UploadedTemplateSource,
): Promise<NormalizedTemplateSource> {
  const isPdf = source.mimeType === PDF_MIME;
  const isDocx = DOCX_MIMES.includes(source.mimeType);

  if (!isPdf && !isDocx) {
    throw new AppError(
      415,
      `Unsupported template file type: ${source.mimeType}`,
      'UNSUPPORTED_MEDIA_TYPE',
    );
  }

  let pdfBytes: Buffer;
  if (isPdf) {
    pdfBytes = source.buffer;
  } else {
    const mammoth = await import('mammoth');
    const { value: html } = await mammoth.convertToHtml({ buffer: source.buffer });
    const adapter = getAdapter('PDF');
    if (!adapter) throw new AppError(500, 'No PDF adapter registered', 'NO_ADAPTER');
    pdfBytes = await adapter.generate(wrapHtml(html), {
      documentId: 'template-upload',
      documentName: source.originalName,
    });
  }

  const key = `templates/${randomUUID()}.pdf`;
  const saved: SaveResult = await fileStorage.save(pdfBytes, key, PDF_MIME);

  return {
    pdfBytes,
    storedKey: saved.key,
    storedSize: saved.size,
    storedMimeType: PDF_MIME,
    uploadedMimeType: source.mimeType,
  };
}
