import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AppError } from '../utils/errors';

/**
 * High-fidelity DOCX path — keeps the original .docx as the source of truth
 * so Word's layout (fonts, margins, alignment, tables, sections, headers/
 * footers, page breaks) is preserved exactly.
 *
 * - `fillDocxWithValues` merges `{{variable}}` placeholders in the original
 *   DOCX via docxtemplater, which operates on the OOXML directly — nothing
 *   is re-laid-out.
 * - `convertDocxToPdf` shells out to `soffice --headless --convert-to pdf`,
 *   which is the only Linux tool that renders DOCX with near-Word fidelity.
 */

const SOFFICE_BIN = process.env.SOFFICE_BIN || 'soffice';

export const fillDocxWithValues = async (
  sourceBuffer: Buffer,
  values: Record<string, unknown>,
): Promise<Buffer> => {
  const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
    import('pizzip'),
    import('docxtemplater'),
  ]);

  const zip = new PizZip(sourceBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: () => '',
  });

  try {
    doc.render(values);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError(
      400,
      `Failed to merge values into DOCX template: ${message}`,
      'DOCX_TEMPLATE_RENDER_FAILED',
    );
  }

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
};

export const convertDocxToPdf = async (docxBuffer: Buffer): Promise<Buffer> => {
  const workDir = await mkdtemp(join(tmpdir(), 'docfidelity-'));
  const inputName = `${randomUUID()}.docx`;
  const inPath = join(workDir, inputName);
  const profileDir = join(workDir, 'profile');
  const outPath = inPath.replace(/\.docx$/, '.pdf');

  try {
    await writeFile(inPath, docxBuffer);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        SOFFICE_BIN,
        [
          '--headless',
          '--norestore',
          '--nolockcheck',
          '--nologo',
          '--nofirststartwizard',
          `-env:UserInstallation=file://${profileDir}`,
          '--convert-to',
          'pdf',
          '--outdir',
          workDir,
          inPath,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let stderr = '';
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', (err) =>
        reject(new AppError(500, `Failed to spawn LibreOffice: ${err.message}`, 'SOFFICE_SPAWN_FAILED')),
      );
      child.on('close', (code) => {
        if (code === 0) resolve();
        else
          reject(
            new AppError(
              500,
              `LibreOffice exited with code ${code}: ${stderr.trim()}`,
              'SOFFICE_CONVERT_FAILED',
            ),
          );
      });
    });

    return await readFile(outPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
};
