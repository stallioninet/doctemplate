import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { ValidationError } from '../../utils/errors';
import { getAuth } from '../auth/auth.types';
import { ingestionService } from './ingestion.service';
import { registerTemplateSchema } from './ingestion.schema';

const buildDownloadUrl = (documentId: string): string =>
  `${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/api/documents/${documentId}/download`;

export const ingestionController = {
  async registerTemplate(req: Request, res: Response) {
    const auth = getAuth(req);
    const file = req.file;
    if (!file) throw new ValidationError('Missing `file` field');

    const parsed = registerTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid form fields', parsed.error.issues);
    }

    const { template, variables } = await ingestionService.registerTemplate(
      auth.organizationId,
      parsed.data,
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      },
    );

    res.status(201).json({
      templateId: template.id,
      externalId: template.externalId,
      name: template.name,
      sourceFormat: template.sourceFormat,
      variables,
    });
  },

  async createDocument(req: Request, res: Response) {
    const auth = getAuth(req);
    const { document, alreadyExists } = await ingestionService.createDocument(
      auth.organizationId,
      req.body,
    );
    res.status(alreadyExists ? 200 : 202).json({
      documentId: document.id,
      externalId: document.externalId,
      status: document.status,
      accepted: !alreadyExists,
      statusUrl: `/api/integrations/drupal/documents/${document.id}`,
    });
  },

  async getDocumentStatus(req: Request, res: Response) {
    const auth = getAuth(req);
    const doc = await ingestionService.getDocumentStatus(auth.organizationId, req.params.id!);
    const jobs = (doc as unknown as { jobs?: Array<Record<string, unknown>> }).jobs ?? [];
    const latestJob = jobs[0];
    const fileKey = (doc as unknown as { fileKey?: string | null }).fileKey;

    const file = fileKey
      ? {
          mimeType: (doc as unknown as { fileMimeType?: string }).fileMimeType,
          size: (doc as unknown as { fileSize?: number }).fileSize,
          generatedAt: (doc as unknown as { generatedAt?: Date }).generatedAt,
        }
      : null;

    res.json({
      documentId: doc.id,
      externalId: doc.externalId,
      documentStatus: doc.status,
      format: doc.format,
      generation: latestJob
        ? {
            jobId: latestJob.id,
            status: latestJob.status,
            attempts: latestJob.attempts,
            lastError: latestJob.lastError,
            startedAt: latestJob.startedAt,
            completedAt: latestJob.completedAt,
          }
        : null,
      file,
      downloadUrl: fileKey ? buildDownloadUrl(doc.id) : null,
      webhookUrl: doc.webhookUrl,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  },
};
