import type { Response } from 'express';
import { PlaceholderKind, PlaceholderType } from '@prisma/client';
import { extractBookmarkNames, extractTemplateTags } from '../../engine/docxBookmarks';
import { convertDocxToPdf } from '../../engine/docxFidelity';
import { replaceTextInDocx } from '../../engine/docxTextReplace';
import { normalizeUploadedTemplate } from '../../engine/templateUpload';
import { prisma } from '../../db/prisma';
import { fileStorage } from '../../storage/fileStorage';
import { AppError, NotFoundError } from '../../utils/errors';
import { extractVariables } from '../../utils/templateEngine';
import { templateRepository } from './template.repository';
import type {
  CreateTemplateInput,
  ReplaceTextInput,
  UploadTemplateInput,
} from './template.schema';

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const templateService = {
  create(organizationId: string, input: CreateTemplateInput) {
    return templateRepository.create(organizationId, input);
  },

  async createUploaded(
    organizationId: string,
    input: UploadTemplateInput,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    const normalized = await normalizeUploadedTemplate({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });

    const template = await templateRepository.createUploaded(organizationId, {
      name: input.name,
      description: input.description,
      sourceFileKey: normalized.storedKey,
      sourceFileMimeType: normalized.uploadedMimeType,
      sourceFormat: normalized.sourceFormat,
      originalFileKey: normalized.originalFileKey,
    });

    // For DOCX uploads, auto-detect placeholders from the source so the doc
    // creation form renders inputs without the user having to register them
    // by hand. Two formats are supported, both round-trip cleanly through Word:
    //   1. Word bookmarks (Insert → Bookmark) — substituted in-place by
    //      replacing the bookmarked range.
    //   2. {{var}} text markers — substituted by docxtemplater.
    // Both kinds get persisted as BOOKMARK rows since the worker runs both
    // substitution passes anyway; only the visual COORD editor cares about
    // the kind distinction beyond that.
    if (normalized.sourceFormat === 'DOCX') {
      const [bookmarkNames, tagNames] = await Promise.all([
        extractBookmarkNames(file.buffer),
        extractTemplateTags(file.buffer),
      ]);
      const allNames = Array.from(new Set([...bookmarkNames, ...tagNames])).sort();
      if (allNames.length > 0) {
        await prisma.templatePlaceholder.createMany({
          data: allNames.map((name) => ({
            templateId: template.id,
            name,
            type: PlaceholderType.TEXT,
            kind: PlaceholderKind.BOOKMARK,
          })),
          skipDuplicates: true,
        });
      }
    }

    return template;
  },

  async getById(organizationId: string, id: string) {
    const template = await templateRepository.findById(organizationId, id);
    if (!template) throw new NotFoundError('Template');
    return {
      ...template,
      // Variable list only meaningful for HTML templates — placeholders are
      // surfaced through the dedicated nested route for PDF templates.
      variables:
        template.templateMode === 'HTML' ? extractVariables(template.htmlContent) : [],
    };
  },

  async streamSourceFile(organizationId: string, id: string, res: Response) {
    const template = await templateRepository.findById(organizationId, id);
    if (!template) throw new NotFoundError('Template');
    if (!template.sourceFileKey) {
      throw new AppError(409, 'Template has no source file', 'NO_SOURCE_FILE');
    }
    const buffer = await fileStorage.read(template.sourceFileKey);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', `inline; filename="${id}.pdf"`);
    res.send(buffer);
  },

  list(organizationId: string) {
    return templateRepository.list(organizationId);
  },

  /**
   * In-browser placeholder authoring for DOCX templates: take a literal
   * source text span (e.g. "[NAME OF DEPONENT]"), wrap every occurrence in
   * the stored .docx with `{{placeholderName}}`, regenerate the PDF facsimile
   * so the preview reflects the change, and (re-)scan placeholders.
   *
   * The substitution survives Word splitting the source text across runs
   * (see docxTextReplace.ts). Re-scanning + skipDuplicates means repeating
   * the operation is idempotent and won't create duplicate placeholder rows.
   */
  async replacePlaceholderText(
    organizationId: string,
    templateId: string,
    input: ReplaceTextInput,
  ) {
    const template = await templateRepository.findById(organizationId, templateId);
    if (!template) throw new NotFoundError('Template');
    if (template.sourceFormat !== 'DOCX' || !template.originalFileKey) {
      throw new AppError(
        409,
        'Text replacement is only available for DOCX templates',
        'NOT_DOCX_TEMPLATE',
      );
    }

    const originalBytes = await fileStorage.read(template.originalFileKey);
    const { buffer: rewritten, matches } = await replaceTextInDocx(
      originalBytes,
      input.sourceText,
      `{{${input.placeholderName}}}`,
    );
    if (matches === 0) {
      throw new AppError(
        404,
        `No occurrences of the supplied text were found in the document`,
        'TEXT_NOT_FOUND',
      );
    }

    // Overwrite the stored .docx and regenerate the PDF facsimile so the
    // editor preview reflects the change. Both keys stay the same so URLs
    // hashed by the frontend keep working — the frontend cache-busts via a
    // version query param.
    await fileStorage.save(rewritten, template.originalFileKey, DOCX_MIME);
    if (template.sourceFileKey) {
      const pdfBytes = await convertDocxToPdf(rewritten);
      await fileStorage.save(pdfBytes, template.sourceFileKey, PDF_MIME);
    }

    // Re-scan: pick up the new {{tag}} (and any other placeholders that
    // already existed). createMany + skipDuplicates makes it idempotent.
    const [bookmarkNames, tagNames] = await Promise.all([
      extractBookmarkNames(rewritten),
      extractTemplateTags(rewritten),
    ]);
    const allNames = Array.from(new Set([...bookmarkNames, ...tagNames])).sort();
    if (allNames.length > 0) {
      await prisma.templatePlaceholder.createMany({
        data: allNames.map((name) => ({
          templateId,
          name,
          type: PlaceholderType.TEXT,
          kind: PlaceholderKind.BOOKMARK,
        })),
        skipDuplicates: true,
      });
    }

    return { matches, placeholderName: input.placeholderName };
  },
};
