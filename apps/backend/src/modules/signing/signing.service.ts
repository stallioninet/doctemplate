import type { Response } from 'express';
import { AppError, NotFoundError } from '../../utils/errors';
import { fileStorage } from '../../storage/fileStorage';
import { documentRepository } from '../documents/document.repository';
import { fieldRepository } from '../fields/field.repository';
import { generationJobService } from '../jobs/generationJob.service';
import { signerRepository } from '../signers/signer.repository';
import { signingEventService } from '../signingEvents/signingEvent.service';
import { webhookDispatcher } from '../webhooks/webhookDispatcher';
import { hashSigningToken } from './signingTokens';
import type { DeclineInput, SubmitFieldInput } from './signing.schema';

const sanitizeFileName = (name: string): string =>
  name.replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '') || 'document';

const extensionFor = (format: 'PDF' | 'DOCX' | 'RTF'): string =>
  ({ PDF: 'pdf', DOCX: 'docx', RTF: 'rtf' }[format]);

const loadByToken = async (token: string) => {
  const signer = await signerRepository.findByTokenHash(hashSigningToken(token));
  if (!signer) throw new AppError(401, 'Invalid signing token', 'UNAUTHORIZED');
  return signer;
};

const ensureActive = (signer: { status: string }) => {
  if (signer.status === 'SIGNED' || signer.status === 'DECLINED') {
    throw new AppError(410, `Signer has already ${signer.status.toLowerCase()}`, 'SIGNER_FINALIZED');
  }
};

const fireWebhook = async (
  documentId: string,
  webhookUrl: string | null,
  payload: Record<string, unknown>,
) => {
  if (!webhookUrl) return;
  await webhookDispatcher.schedule({ documentId, url: webhookUrl, payload });
};

export const signingService = {
  async getContext(token: string, ipAddress?: string, userAgent?: string) {
    const signer = await loadByToken(token);

    if (signer.status === 'PENDING') {
      await signerRepository.markViewed(signer.id, ipAddress, userAgent);
      await signingEventService.record(signer.documentId, 'SIGNER_VIEWED', {
        signerId: signer.id,
        ipAddress,
        userAgent,
      });
    }

    const otherSigners = await signerRepository.list(signer.documentId);

    return {
      signer: {
        id: signer.id,
        name: signer.name,
        email: signer.email,
        status: signer.status === 'PENDING' ? 'VIEWED' : signer.status,
        order: signer.order,
      },
      document: {
        id: signer.document.id,
        name: signer.document.name,
        format: signer.document.format,
        status: signer.document.status,
        signedReady: Boolean(
          signer.document.signedFileKey && signer.document.certificateFileKey,
        ),
      },
      fields: signer.fields.map((f) => ({
        id: f.id,
        type: f.type,
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        required: f.required,
        value: f.value,
        filledAt: f.filledAt,
      })),
      otherSigners: otherSigners
        .filter((s) => s.id !== signer.id)
        .map((s) => ({ id: s.id, name: s.name, order: s.order, status: s.status })),
    };
  },

  async streamDocument(token: string, res: Response) {
    const signer = await loadByToken(token);
    const doc = signer.document;
    if (!doc.fileKey) {
      throw new AppError(409, 'Document has not been generated', 'NOT_GENERATED');
    }

    const buffer = await fileStorage.read(doc.fileKey);
    const filename = `${sanitizeFileName(doc.name)}.${extensionFor(doc.format)}`;

    res.setHeader('Content-Type', doc.fileMimeType ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  },

  async streamSignedDocument(token: string, res: Response) {
    const signer = await loadByToken(token);
    const doc = signer.document;
    if (!doc.signedFileKey) {
      throw new AppError(409, 'Signed artifact is not ready yet', 'SIGNED_ARTIFACT_NOT_READY');
    }

    const buffer = await fileStorage.read(doc.signedFileKey);
    const filename = `${sanitizeFileName(doc.name)}-signed.pdf`;

    res.setHeader('Content-Type', doc.signedFileMimeType ?? 'application/pdf');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  },

  async submitField(token: string, fieldId: string, input: SubmitFieldInput) {
    const signer = await loadByToken(token);
    ensureActive(signer);

    const field = signer.fields.find((f) => f.id === fieldId);
    if (!field) {
      throw new NotFoundError('Field');
    }
    const updated = await fieldRepository.setValue(fieldId, input.value);
    await signingEventService.record(signer.documentId, 'SIGNER_FIELD_FILLED', {
      signerId: signer.id,
      fieldId,
      metadata: { type: field.type },
    });
    return updated;
  },

  async complete(token: string) {
    const signer = await loadByToken(token);
    ensureActive(signer);

    const unfilled = await fieldRepository.unfilledRequiredForSigner(signer.id);
    if (unfilled.length > 0) {
      throw new AppError(
        409,
        `Required fields are unfilled: ${unfilled.map((f) => f.id).join(', ')}`,
        'INCOMPLETE_SIGNING',
      );
    }

    await signerRepository.markSigned(signer.id);
    await signingEventService.record(signer.documentId, 'SIGNER_SIGNED', {
      signerId: signer.id,
    });

    await fireWebhook(signer.document.id, signer.document.webhookUrl, {
      event: 'signer.signed',
      documentId: signer.document.id,
      externalId: signer.document.externalId,
      signer: { id: signer.id, name: signer.name, email: signer.email },
      timestamp: new Date().toISOString(),
    });

    // If every signer is now SIGNED, complete the document.
    const all = await signerRepository.list(signer.documentId);
    const allSigned = all.every((s) => s.id === signer.id || s.status === 'SIGNED');
    if (allSigned) {
      await documentRepository.markCompleted(signer.documentId);
      await signingEventService.record(signer.documentId, 'DOCUMENT_COMPLETED');
      await fireWebhook(signer.document.id, signer.document.webhookUrl, {
        event: 'document.completed',
        documentId: signer.document.id,
        externalId: signer.document.externalId,
        status: 'COMPLETED',
        signers: all.map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          signedAt: s.id === signer.id ? new Date().toISOString() : s.signedAt,
        })),
        timestamp: new Date().toISOString(),
      });

      // Phase 6: enqueue signed-artifact + certificate generation.
      await generationJobService.enqueueSignedArtifact(signer.documentId);
    }

    return { status: 'SIGNED', allCompleted: allSigned };
  },

  async decline(token: string, input: DeclineInput) {
    const signer = await loadByToken(token);
    ensureActive(signer);

    await signerRepository.markDeclined(signer.id, input.reason);
    await signingEventService.record(signer.documentId, 'SIGNER_DECLINED', {
      signerId: signer.id,
      metadata: input.reason ? { reason: input.reason } : undefined,
    });

    if (signer.document.status !== 'DECLINED') {
      await documentRepository.markDeclined(signer.documentId);
      await signingEventService.record(signer.documentId, 'DOCUMENT_DECLINED', {
        signerId: signer.id,
      });
    }

    await fireWebhook(signer.document.id, signer.document.webhookUrl, {
      event: 'document.declined',
      documentId: signer.document.id,
      externalId: signer.document.externalId,
      status: 'DECLINED',
      declinedBy: { id: signer.id, name: signer.name, email: signer.email },
      reason: input.reason,
      timestamp: new Date().toISOString(),
    });

    return { status: 'DECLINED' };
  },
};
