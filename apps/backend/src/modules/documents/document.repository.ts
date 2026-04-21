import { Prisma, type DocumentFormat, type DocumentStatus } from '@prisma/client';
import { prisma } from '../../db/prisma';

export interface CreateDocumentData {
  organizationId: string;
  templateId: string;
  name: string;
  format: DocumentFormat;
  htmlContent: string;
  data: Record<string, unknown>;
  status?: DocumentStatus;
  externalId?: string;
  externalSource?: string;
  webhookUrl?: string;
}

export interface GeneratedFileData {
  fileKey: string;
  fileMimeType: string;
  fileSize: number;
}

export const documentRepository = {
  create(input: CreateDocumentData) {
    return prisma.document.create({
      data: {
        organizationId: input.organizationId,
        templateId: input.templateId,
        name: input.name,
        format: input.format,
        htmlContent: input.htmlContent,
        data: input.data as Prisma.InputJsonValue,
        ...(input.status ? { status: input.status } : {}),
        ...(input.externalId ? { externalId: input.externalId } : {}),
        ...(input.externalSource ? { externalSource: input.externalSource } : {}),
        ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
      },
    });
  },

  findById(organizationId: string, id: string) {
    return prisma.document.findFirst({
      where: { id, organizationId },
      include: { template: { select: { id: true, name: true } } },
    });
  },

  findByIdWithLatestJob(organizationId: string, id: string) {
    return prisma.document.findFirst({
      where: { id, organizationId },
      include: {
        template: { select: { id: true, name: true } },
        jobs: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  },

  findByExternalId(organizationId: string, source: string, externalId: string) {
    return prisma.document.findUnique({
      where: {
        organizationId_externalSource_externalId: {
          organizationId,
          externalSource: source,
          externalId,
        },
      },
    });
  },

  /** Worker-side: id-only lookup (system trust — caller comes from claimNext). */
  findByIdUnscoped(id: string) {
    return prisma.document.findUnique({ where: { id } });
  },

  markGenerated(id: string, file: GeneratedFileData) {
    return prisma.document.update({
      where: { id },
      data: {
        fileKey: file.fileKey,
        fileMimeType: file.fileMimeType,
        fileSize: file.fileSize,
        generatedAt: new Date(),
      },
    });
  },

  markSent(id: string) {
    return prisma.document.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
    });
  },

  markCompleted(id: string) {
    return prisma.document.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  },

  markDeclined(id: string) {
    return prisma.document.update({
      where: { id },
      data: { status: 'DECLINED', declinedAt: new Date() },
    });
  },

  markSignedArtifactReady(
    id: string,
    file: {
      signedFileKey: string;
      signedFileMimeType: string;
      signedFileSize: number;
      certificateFileKey: string;
    },
  ) {
    return prisma.document.update({
      where: { id },
      data: {
        signedFileKey: file.signedFileKey,
        signedFileMimeType: file.signedFileMimeType,
        signedFileSize: file.signedFileSize,
        certificateFileKey: file.certificateFileKey,
        signedFileGeneratedAt: new Date(),
      },
    });
  },

  list(organizationId: string) {
    return prisma.document.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  },
};
