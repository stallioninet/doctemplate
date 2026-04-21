import type { Response } from 'express';
import { normalizeUploadedTemplate } from '../../engine/templateUpload';
import { fileStorage } from '../../storage/fileStorage';
import { AppError, NotFoundError } from '../../utils/errors';
import { extractVariables } from '../../utils/templateEngine';
import { templateRepository } from './template.repository';
import type { CreateTemplateInput, UploadTemplateInput } from './template.schema';

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

    return templateRepository.createUploaded(organizationId, {
      name: input.name,
      description: input.description,
      sourceFileKey: normalized.storedKey,
      sourceFileMimeType: normalized.uploadedMimeType,
    });
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
};
