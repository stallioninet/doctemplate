'use client';

import * as pdfjsLib from 'pdfjs-dist';

// Configure the PDF.js worker exactly once. Using the unpkg CDN keeps the
// worker version locked to the installed package, with no need to copy
// `pdf.worker.min.mjs` into Next.js's `public/` directory.
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export { pdfjsLib };
export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
