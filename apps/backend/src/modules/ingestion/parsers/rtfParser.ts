import { DocumentFormat } from '@prisma/client';
import type { SourceParser } from './types';

/**
 * RTF → HTML (minimal).
 * Strips RTF control words and groups, maps `\par` to paragraph breaks,
 * and resolves `\'hh` hex-encoded chars. Placeholders (`{{var}}`) pass through.
 *
 * Phase 8 can replace this with a full RTF parser if richer source support is needed.
 */
export const rtfParser: SourceParser = {
  format: DocumentFormat.RTF,
  mimeTypes: ['application/rtf', 'text/rtf'],

  async parse(buffer) {
    const text = rtfToText(buffer.toString('utf8'));
    const html = text
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join('\n');
    return { html };
  },
};

const rtfToText = (rtf: string): string =>
  rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\\\\/g, '\\')
    .replace(/\\'/g, "'");

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
