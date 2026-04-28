import { randomUUID } from 'crypto';
import { DocumentFormat } from '@prisma/client';
import { convertDocxToPdf } from '../../engine/docxFidelity';
import { AppError, NotFoundError } from '../../utils/errors';
import { extractVariables, renderTemplate } from '../../utils/templateEngine';
import { fileStorage } from '../../storage/fileStorage';
import { templateRepository } from '../templates/template.repository';
import { documentRepository } from '../documents/document.repository';
import { generationJobService } from '../jobs/generationJob.service';
import { detectFormatFromMime, getParserForFormat } from './parsers';
import type {
  CreateDocumentDrupalInput,
  RegisterTemplateInput,
} from './ingestion.schema';

export const EXTERNAL_SOURCE = 'drupal';

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const buildSourceKey = (originalName: string): string => {
  const safe = originalName.replace(/[^\w.\-]+/g, '_');
  return `sources/${randomUUID()}-${safe}`;
};

export const ingestionService = {
  async registerTemplate(
    organizationId: string,
    input: RegisterTemplateInput,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    const format = detectFormatFromMime(file.mimetype);
    if (!format) {
      throw new AppError(
        415,
        `Unsupported source format: ${file.mimetype}`,
        'UNSUPPORTED_MEDIA_TYPE',
      );
    }

    const parser = getParserForFormat(format)!;
    const { html } = await parser.parse(file.buffer);

    // Match templateUpload.ts: store a PDF facsimile at sourceFileKey so the
    // visual editor and the positional-stamp render path can use it as a
    // stable layout canvas. Keep the original .docx at originalFileKey for
    // DOCX-output rendering via the OOXML-fill path.
    let sourceKey: string;
    let storedMime: string;
    let originalFileKey: string | null = null;
    let templateMode: 'PDF' | 'HTML' = 'HTML';
    if (format === DocumentFormat.DOCX) {
      const pdfBytes = await convertDocxToPdf(file.buffer);
      sourceKey = buildSourceKey(file.originalname.replace(/\.[^.]+$/, '.pdf'));
      storedMime = PDF_MIME;
      await fileStorage.save(pdfBytes, sourceKey, PDF_MIME);
      const docxKey = buildSourceKey(file.originalname);
      await fileStorage.save(file.buffer, docxKey, DOCX_MIME);
      originalFileKey = docxKey;
      templateMode = 'PDF';
    } else if (format === DocumentFormat.PDF) {
      sourceKey = buildSourceKey(file.originalname);
      storedMime = PDF_MIME;
      await fileStorage.save(file.buffer, sourceKey, file.mimetype);
      templateMode = 'PDF';
    } else {
      sourceKey = buildSourceKey(file.originalname);
      storedMime = file.mimetype;
      await fileStorage.save(file.buffer, sourceKey, file.mimetype);
    }

    const template = await templateRepository.upsertByExternalId(
      organizationId,
      EXTERNAL_SOURCE,
      input.externalId,
      {
        name: input.name,
        description: input.description,
        htmlContent: html,
        sourceFormat: format,
        sourceFileKey: sourceKey,
        sourceFileMimeType: storedMime,
        originalFileKey,
        templateMode,
      },
    );

    return {
      template,
      variables: extractVariables(html),
    };
  },

  async createDocument(organizationId: string, input: CreateDocumentDrupalInput) {
    const template = input.templateId
      ? await templateRepository.findById(organizationId, input.templateId)
      : await templateRepository.findByExternalId(
          organizationId,
          EXTERNAL_SOURCE,
          input.externalTemplateId!,
        );

    if (!template) throw new NotFoundError('Template');

    const existing = await documentRepository.findByExternalId(
      organizationId,
      EXTERNAL_SOURCE,
      input.externalId,
    );
    if (existing) return { document: existing, alreadyExists: true };

    const htmlContent = renderTemplate(template.htmlContent, input.values);

    // Default output to the source format so a Word template produces a Word
    // document (exact layout preserved by the DOCX fidelity path). RTF
    // sources fall back to PDF since Drupal's contract is PDF|DOCX only.
    const outputFormat: DocumentFormat =
      input.outputFormat ??
      (template.sourceFormat === DocumentFormat.DOCX
        ? DocumentFormat.DOCX
        : DocumentFormat.PDF);

    const document = await documentRepository.create({
      organizationId,
      templateId: template.id,
      name: input.name,
      format: outputFormat,
      htmlContent,
      data: input.values,
      externalId: input.externalId,
      externalSource: EXTERNAL_SOURCE,
      webhookUrl: input.webhookUrl,
    });

    await generationJobService.enqueue(document.id);

    return { document, alreadyExists: false };
  },

  async getDocumentStatus(organizationId: string, id: string) {
    const doc = await documentRepository.findByIdWithLatestJob(organizationId, id);
    if (!doc) throw new NotFoundError('Document');
    return doc;
  },
};
