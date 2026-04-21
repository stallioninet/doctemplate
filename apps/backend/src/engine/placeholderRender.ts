import type { TemplatePlaceholder } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const MIN_FONT_PT = 6;
const MAX_FONT_PT = 18;
const TEXT_PADDING_PT = 2;

const formatValue = (
  type: TemplatePlaceholder['type'],
  raw: unknown,
): string => {
  if (raw == null) return '';
  const s = typeof raw === 'string' ? raw : String(raw);
  if (type === 'DATE') {
    // Accept ISO date or any parseable string; fall through if unparseable.
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return s;
};

/**
 * Stamp placeholder values onto a template PDF in place.
 *
 * Uses the same percentage-based, top-left-origin convention as Phase 8/9
 * (`x/y/width/height` are 0–100). pdf-lib's bottom-left origin is reconciled
 * via `yPtBottom = pageH - (y/100)*pageH - hPt`. Fonts are sized to ~60% of
 * the box height clamped to 6–18pt; text is `maxWidth`-clipped to the box.
 */
export async function stampPlaceholderValuesOnPdf(
  pdfBytes: Buffer | Uint8Array,
  placeholders: TemplatePlaceholder[],
  values: Record<string, unknown>,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const ph of placeholders) {
    const provided = values[ph.name];
    const text = formatValue(ph.type, provided ?? ph.defaultValue ?? '');
    if (!text) continue;

    const pageIdx = ph.page - 1;
    if (pageIdx < 0 || pageIdx >= pages.length) continue;
    const page = pages[pageIdx]!;
    const { width, height } = page.getSize();

    const xPt = (ph.x / 100) * width;
    const wPt = (ph.width / 100) * width;
    const hPt = (ph.height / 100) * height;
    const yPtBottom = height - (ph.y / 100) * height - hPt;

    const fontSize = Math.max(MIN_FONT_PT, Math.min(hPt * 0.6, MAX_FONT_PT));
    page.drawText(text, {
      x: xPt + TEXT_PADDING_PT,
      y: yPtBottom + (hPt - fontSize) / 2,
      size: fontSize,
      font: helvetica,
      color: rgb(0, 0, 0),
      maxWidth: wPt - TEXT_PADDING_PT * 2,
    });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
