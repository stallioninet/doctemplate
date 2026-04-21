import { randomUUID } from 'crypto';
import type { DocumentFormat } from '@prisma/client';
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

    const sourceKey = buildSourceKey(file.originalname);
    await fileStorage.save(file.buffer, sourceKey, file.mimetype);

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

    const document = await documentRepository.create({
      organizationId,
      templateId: template.id,
      name: input.name,
      format: input.outputFormat as DocumentFormat,
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
