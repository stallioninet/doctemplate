import type { DocumentFormat, Template } from '@prisma/client';
import { prisma } from '../../db/prisma';
import type { CreateTemplateInput } from './template.schema';

export interface UpsertTemplateData {
  name: string;
  description?: string;
  htmlContent: string;
  sourceFormat?: DocumentFormat;
  sourceFileKey?: string;
}

export interface CreateUploadedTemplateData {
  name: string;
  description?: string;
  sourceFileKey: string;
  sourceFileMimeType: string;
}

export const templateRepository = {
  create(organizationId: string, input: CreateTemplateInput) {
    return prisma.template.create({
      data: { ...input, organizationId, templateMode: 'HTML' },
    });
  },

  createUploaded(organizationId: string, data: CreateUploadedTemplateData) {
    return prisma.template.create({
      data: {
        organizationId,
        templateMode: 'PDF',
        name: data.name,
        description: data.description,
        // PDF templates don't use htmlContent — store an empty string so the
        // NOT NULL column stays satisfied without making it nullable.
        htmlContent: '',
        sourceFormat: 'PDF',
        sourceFileKey: data.sourceFileKey,
        sourceFileMimeType: data.sourceFileMimeType,
      },
    });
  },

  findById(organizationId: string, id: string) {
    return prisma.template.findFirst({
      where: { id, organizationId },
      include: { placeholders: { orderBy: [{ page: 'asc' }, { y: 'asc' }, { x: 'asc' }] } },
    });
  },

  findByExternalId(organizationId: string, source: string, externalId: string) {
    return prisma.template.findUnique({
      where: {
        organizationId_externalSource_externalId: {
          organizationId,
          externalSource: source,
          externalId,
        },
      },
    });
  },

  upsertByExternalId(
    organizationId: string,
    source: string,
    externalId: string,
    data: UpsertTemplateData,
  ): Promise<Template> {
    return prisma.template.upsert({
      where: {
        organizationId_externalSource_externalId: {
          organizationId,
          externalSource: source,
          externalId,
        },
      },
      create: { ...data, organizationId, externalSource: source, externalId },
      update: data,
    });
  },

  list(organizationId: string) {
    return prisma.template.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  },
};
