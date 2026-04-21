import { DocumentFormat } from '@prisma/client';
import { Parser } from 'htmlparser2';
import type { FormatAdapter } from './types';

/**
 * HTML → RTF adapter.
 * Supports: paragraphs, headings (h1–h6), bold/italic/underline, line breaks,
 * bullet + numbered lists. Tables collapse to plain paragraphs — richer RTF
 * table support can land in Phase 8.
 *
 * RTF character rules:
 *   `\`, `{`, `}` → `\\`, `\{`, `\}`
 *   non-ASCII → `\uN?` (signed 16-bit, with ASCII fallback `?`)
 */

const HEADER =
  '{\\rtf1\\ansi\\ansicpg1252\\deff0\n' +
  '{\\fonttbl{\\f0\\fswiss\\fcharset0 Helvetica;}}\n' +
  '\\f0\\fs24\n';
const FOOTER = '}';

const HEADING_FS: Record<string, number> = { h1: 40, h2: 32, h3: 28, h4: 26, h5: 24, h6: 24 };

const escape = (s: string): string => {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch;
    else if (code < 0x80) out += ch;
    else {
      // signed 16-bit representation for Unicode escape
      const signed = code > 0x7fff ? code - 0x10000 : code;
      out += `\\u${signed}?`;
    }
  }
  return out;
};

export const rtfAdapter: FormatAdapter = {
  format: DocumentFormat.RTF,
  extension: 'rtf',
  mimeType: 'application/rtf',

  async generate(html) {
    let out = HEADER;
    let inListOrdered = false;
    let listCounter = 0;
    let openParagraph = false;

    const openPara = (prefix = '') => {
      if (openParagraph) out += '\\par\n';
      out += prefix;
      openParagraph = true;
    };

    const parser = new Parser(
      {
        onopentag(name) {
          const n = name.toLowerCase();
          if (n === 'p') openPara();
          else if (HEADING_FS[n]) openPara(`\\b\\fs${HEADING_FS[n]} `);
          else if (n === 'strong' || n === 'b') out += '{\\b ';
          else if (n === 'em' || n === 'i') out += '{\\i ';
          else if (n === 'u') out += '{\\ul ';
          else if (n === 'br') out += '\\line ';
          else if (n === 'ul') {
            inListOrdered = false;
            listCounter = 0;
          } else if (n === 'ol') {
            inListOrdered = true;
            listCounter = 0;
          } else if (n === 'li') {
            openPara(
              inListOrdered ? `${++listCounter}. ` : '\\u8226?  ', // • bullet
            );
          }
        },
        ontext(text) {
          out += escape(text);
        },
        onclosetag(name) {
          const n = name.toLowerCase();
          if (n === 'p') {
            out += '\\par\n';
            openParagraph = false;
          } else if (HEADING_FS[n]) {
            out += '\\b0\\fs24\\par\n';
            openParagraph = false;
          } else if (n === 'strong' || n === 'b' || n === 'em' || n === 'i' || n === 'u') {
            out += '}';
          } else if (n === 'li') {
            out += '\\par\n';
            openParagraph = false;
          }
        },
      },
      { decodeEntities: true },
    );

    parser.write(html);
    parser.end();

    if (openParagraph) out += '\\par\n';
    out += FOOTER;
    return Buffer.from(out, 'utf8');
  },
};
