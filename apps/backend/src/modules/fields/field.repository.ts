import { prisma } from '../../db/prisma';
import type { CreateFieldInput, UpdateFieldInput } from './field.schema';

export const fieldRepository = {
  create(documentId: string, input: CreateFieldInput) {
    return prisma.documentField.create({
      data: {
        documentId,
        signerId: input.signerId,
        type: input.type,
        page: input.page,
        x: input.x,
        y: input.y,
        width: input.width,
        height: input.height,
        required: input.required,
      },
    });
  },

  list(documentId: string) {
    return prisma.documentField.findMany({
      where: { documentId },
      orderBy: [{ page: 'asc' }, { y: 'asc' }, { x: 'asc' }],
    });
  },

  findById(documentId: string, id: string) {
    return prisma.documentField.findFirst({ where: { id, documentId } });
  },

  countBySigner(documentId: string) {
    return prisma.documentField.groupBy({
      by: ['signerId'],
      where: { documentId },
      _count: { _all: true },
    });
  },

  update(id: string, input: UpdateFieldInput) {
    return prisma.documentField.update({ where: { id }, data: input });
  },

  remove(id: string) {
    return prisma.documentField.delete({ where: { id } });
  },

  setValue(id: string, value: string) {
    return prisma.documentField.update({
      where: { id },
      data: { value, filledAt: new Date() },
    });
  },

  /** Required fields for a signer that are still unfilled. */
  unfilledRequiredForSigner(signerId: string) {
    return prisma.documentField.findMany({
      where: { signerId, required: true, value: null },
      select: { id: true, type: true },
    });
  },
};
