import { AppError, NotFoundError } from '../../utils/errors';
import { documentRepository } from '../documents/document.repository';
import { signerRepository } from './signer.repository';
import type { CreateSignerInput, UpdateSignerInput } from './signer.schema';

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

export const signerService = {
  async create(organizationId: string, documentId: string, input: CreateSignerInput) {
    await ensureDraftDoc(organizationId, documentId);
    return signerRepository.create(documentId, input);
  },

  async list(organizationId: string, documentId: string) {
    await ensureDoc(organizationId, documentId);
    return signerRepository.list(documentId);
  },

  async update(
    organizationId: string,
    documentId: string,
    signerId: string,
    input: UpdateSignerInput,
  ) {
    await ensureDraftDoc(organizationId, documentId);
    const signer = await signerRepository.findById(documentId, signerId);
    if (!signer) throw new NotFoundError('Signer');
    return signerRepository.update(signerId, input);
  },

  async remove(organizationId: string, documentId: string, signerId: string) {
    await ensureDraftDoc(organizationId, documentId);
    const signer = await signerRepository.findById(documentId, signerId);
    if (!signer) throw new NotFoundError('Signer');
    await signerRepository.remove(signerId);
  },
};
