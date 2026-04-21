import type { DocumentField } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

const MIN_FONT_PT = 6;
const MAX_FONT_PT = 24;
const TEXT_PADDING_PT = 2;

const isImageDataUrl = (value: string): boolean =>
  /^data:image\/(png|jpe?g);base64,/i.test(value);

interface ParsedDataUrl {
  bytes: Uint8Array;
  mime: 'image/png' | 'image/jpeg';
}

const parseImageDataUrl = (value: string): ParsedDataUrl | null => {
  const match = /^data:(image\/(?:png|jpe?g));base64,(.+)$/i.exec(value);
  if (!match) return null;
  const rawMime = match[1]!.toLowerCase();
  const mime: ParsedDataUrl['mime'] = rawMime === 'image/png' ? 'image/png' : 'image/jpeg';
  return { mime, bytes: Buffer.from(match[2]!, 'base64') };
};

const renderFieldText = (
  type: DocumentField['type'],
  value: string,
): string => {
  if (type === 'CHECKBOX') {
    const truthy = !['', '0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
    return truthy ? '[x]' : '[ ]';
  }
  return value;
};

/**
 * Stamp filled field values onto the original PDF in place — true positional
 * overlays at the percentage-based coords saved by the visual editor.
 *
 * Coordinate conversion:
 *   - Stored: x/y/width/height as percentages 0–100 with **top-left origin**
 *   - pdf-lib draws in PDF points with **bottom-left origin**
 *   - For each field on `page`, look up the live page size in points and
 *     translate; flip y because PDF origin is at the bottom.
 *
 * Field rendering:
 *   - SIGNATURE / INITIAL with a `data:image/png|jpeg;base64,…` value →
 *     embedded as a raster image scaled to the box.
 *   - SIGNATURE / INITIAL with a typed name → italic Helvetica text.
 *   - DATE / TEXT → upright Helvetica.
 *   - CHECKBOX → `[x]` / `[ ]` glyph (avoids missing-glyph issues with
 *     standard fonts that lack a real check-mark).
 *   - Unfilled or out-of-range fields are silently skipped.
 */
export async function stampFieldsOnPdf(
  originalBytes: Uint8Array,
  fields: DocumentField[],
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(originalBytes);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const pages = pdfDoc.getPages();

  for (const field of fields) {
    if (!field.value) continue;
    const pageIdx = field.page - 1;
    if (pageIdx < 0 || pageIdx >= pages.length) continue;

    const page = pages[pageIdx]!;
    const { width, height } = page.getSize();
    const xPt = (field.x / 100) * width;
    const wPt = (field.width / 100) * width;
    const hPt = (field.height / 100) * height;
    const yPtBottom = height - (field.y / 100) * height - hPt;

    if (
      (field.type === 'SIGNATURE' || field.type === 'INITIAL') &&
      isImageDataUrl(field.value)
    ) {
      const parsed = parseImageDataUrl(field.value);
      if (parsed) {
        try {
          const image =
            parsed.mime === 'image/png'
              ? await pdfDoc.embedPng(parsed.bytes)
              : await pdfDoc.embedJpg(parsed.bytes);
          page.drawImage(image, { x: xPt, y: yPtBottom, width: wPt, height: hPt });
          continue;
        } catch {
          // fall through to text rendering
        }
      }
    }

    const text = renderFieldText(field.type, field.value);
    const font: PDFFont =
      field.type === 'SIGNATURE' || field.type === 'INITIAL' ? helveticaOblique : helvetica;
    const fontSize = Math.max(MIN_FONT_PT, Math.min(hPt * 0.6, MAX_FONT_PT));

    page.drawText(text, {
      x: xPt + TEXT_PADDING_PT,
      y: yPtBottom + (hPt - fontSize) / 2,
      size: fontSize,
      font,
      color: rgb(0, 0, 0.55),
      maxWidth: wPt - TEXT_PADDING_PT * 2,
    });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

/**
 * Append every page of every input PDF (in order) into a fresh document.
 * Used to glue the certification appendix after the overlaid original.
 */
export async function mergePdfs(buffers: Uint8Array[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf);
    const copied = await merged.copyPages(src, src.getPageIndices());
    for (const page of copied) merged.addPage(page);
  }
  const bytes = await merged.save();
  return Buffer.from(bytes);
}
