import { prisma } from '../../db/prisma';
import type {
  CreatePlaceholderInput,
  UpdatePlaceholderInput,
} from './placeholder.schema';

export const placeholderRepository = {
  create(templateId: string, input: CreatePlaceholderInput) {
    return prisma.templatePlaceholder.create({
      data: { templateId, ...input },
    });
  },

  list(templateId: string) {
    return prisma.templatePlaceholder.findMany({
      where: { templateId },
      orderBy: [{ page: 'asc' }, { y: 'asc' }, { x: 'asc' }],
    });
  },

  findById(templateId: string, id: string) {
    return prisma.templatePlaceholder.findFirst({ where: { id, templateId } });
  },

  update(id: string, input: UpdatePlaceholderInput) {
    return prisma.templatePlaceholder.update({ where: { id }, data: input });
  },

  remove(id: string) {
    return prisma.templatePlaceholder.delete({ where: { id } });
  },
};
