import { AppError, NotFoundError } from '../../utils/errors';
import { documentRepository } from '../documents/document.repository';
import { signerRepository } from '../signers/signer.repository';
import { fieldRepository } from './field.repository';
import type { CreateFieldInput, UpdateFieldInput } from './field.schema';

const ensureDoc = async (organizationId: string, documentId: string) => {
  const doc = await documentRepository.findById(organizationId, documentId);
  if (!doc) throw new NotFoundError('Document');
  return doc;
};

const ensureDraftDoc = async (organizationId: string, documentId: string) => {
  const doc = await ensureDoc(organizationId, documentId);
  if (doc.status !== 'DRAFT') {
    throw new AppError(409, 'Document is no longer editable', 'DOCUMENT_NOT_DRAFT');
  }
  return doc;
};

export const fieldService = {
  async create(organizationId: string, documentId: string, input: CreateFieldInput) {
    await ensureDraftDoc(organizationId, documentId);
    const signer = await signerRepository.findById(documentId, input.signerId);
    if (!signer) {
      throw new AppError(400, 'signerId does not belong to this document', 'INVALID_SIGNER');
    }
    return fieldRepository.create(documentId, input);
  },

  async list(organizationId: string, documentId: string) {
    await ensureDoc(organizationId, documentId);
    return fieldRepository.list(documentId);
  },

  async update(
    organizationId: string,
    documentId: string,
    fieldId: string,
    input: UpdateFieldInput,
  ) {
    await ensureDraftDoc(organizationId, documentId);
    const field = await fieldRepository.findById(documentId, fieldId);
    if (!field) throw new NotFoundError('Field');
    return fieldRepository.update(fieldId, input);
  },

  async remove(organizationId: string, documentId: string, fieldId: string) {
    await ensureDraftDoc(organizationId, documentId);
    const field = await fieldRepository.findById(documentId, fieldId);
    if (!field) throw new NotFoundError('Field');
    await fieldRepository.remove(fieldId);
  },
};
