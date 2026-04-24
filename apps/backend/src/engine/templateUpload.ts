import { randomUUID } from 'crypto';
import { DocumentFormat } from '@prisma/client';
import { fileStorage, type SaveResult } from '../storage/fileStorage';
import { AppError } from '../utils/errors';
import { convertDocxToPdf } from './docxFidelity';

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOCX_MIMES = [DOCX_MIME, 'application/msword'];

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
  /**
   * Format of the *original* uploaded file (PDF or DOCX). Drives the
   * worker's render strategy: DOCX templates fill the original .docx for
   * Word-fidelity output; PDF templates stamp the PDF directly.
   */
  sourceFormat: DocumentFormat;
  /**
   * Storage key of the *original* uploaded bytes when source is DOCX.
   * Null for PDF uploads (the original *is* what's at storedKey).
   */
  originalFileKey: string | null;
}

/**
 * Accept a PDF or Word file and return a PDF buffer + storage key. PDFs are
 * stored as-is; DOCX is rendered to PDF via LibreOffice headless so the
 * visual placeholder editor shows a faithful facsimile of the Word layout
 * (fonts, margins, alignment, tables, headers/footers, page breaks) — the
 * same PDF is also what downstream generation stamps placeholder values onto,
 * so every final output inherits that fidelity.
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

  const pdfBytes = isPdf ? source.buffer : await convertDocxToPdf(source.buffer);

  const key = `templates/${randomUUID()}.pdf`;
  const saved: SaveResult = await fileStorage.save(pdfBytes, key, PDF_MIME);

  // Keep the original .docx so the worker can fill it with placeholder values
  // and emit a Word-fidelity output (the PDF facsimile only powers the
  // placeholder editor and PDF-output path).
  let originalFileKey: string | null = null;
  if (isDocx) {
    const originalKey = `templates/${randomUUID()}.docx`;
    const savedOriginal = await fileStorage.save(source.buffer, originalKey, DOCX_MIME);
    originalFileKey = savedOriginal.key;
  }

  return {
    pdfBytes,
    storedKey: saved.key,
    storedSize: saved.size,
    storedMimeType: PDF_MIME,
    uploadedMimeType: source.mimeType,
    sourceFormat: isDocx ? DocumentFormat.DOCX : DocumentFormat.PDF,
    originalFileKey,
  };
}
