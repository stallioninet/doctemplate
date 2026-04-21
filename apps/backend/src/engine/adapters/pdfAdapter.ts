import { DocumentFormat } from '@prisma/client';
import type { Browser } from 'puppeteer';
import { env } from '../../config/env';
import { wrapHtml } from './htmlShell';
import type { FormatAdapter } from './types';

let browserPromise: Promise<Browser> | null = null;

const getBrowser = async (): Promise<Browser> => {
  if (!browserPromise) {
    const { default: puppeteer } = await import('puppeteer');
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ...(env.PUPPETEER_EXECUTABLE_PATH
        ? { executablePath: env.PUPPETEER_EXECUTABLE_PATH }
        : {}),
    });
  }
  return browserPromise;
};

export const pdfAdapter: FormatAdapter = {
  format: DocumentFormat.PDF,
  extension: 'pdf',
  mimeType: 'application/pdf',

  async generate(html) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(wrapHtml(html), { waitUntil: 'networkidle0' });
      const bytes = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      });
      return Buffer.from(bytes);
    } finally {
      await page.close();
    }
  },

  async shutdown() {
    if (!browserPromise) return;
    const browser = await browserPromise;
    browserPromise = null;
    await browser.close();
  },
};
