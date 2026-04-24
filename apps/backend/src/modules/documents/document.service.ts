import type { Response } from 'express';
import {
  verifyCertificateSignature,
  type SigningCertificate,
  type VerifyResult,
} from '../../engine/signedArtifact';
import { AppError, NotFoundError } from '../../utils/errors';
import { fileStorage } from '../../storage/fileStorage';
import { sha256Hex } from '../../utils/hash';
import { renderTemplate } from '../../utils/templateEngine';
import { fieldRepository } from '../fields/field.repository';
import { generationJobService } from '../jobs/generationJob.service';
import { signerRepository } from '../signers/signer.repository';
import { signingEventService } from '../signingEvents/signingEvent.service';
import {
  buildSigningUrl,
  generateSigningToken,
  hashSigningToken,
} from '../signing/signingTokens';
import { templateRepository } from '../templates/template.repository';
import { webhookDispatcher } from '../webhooks/webhookDispatcher';
import { documentRepository } from './document.repository';
import type { CreateDocumentInput } from './document.schema';

const sanitizeFileName = (name: string): string =>
  name.replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '') || 'document';

const extensionFor = (format: 'PDF' | 'DOCX' | 'RTF'): string =>
  ({ PDF: 'pdf', DOCX: 'docx', RTF: 'rtf' }[format]);

export const documentService = {
  async create(organizationId: string, input: CreateDocumentInput) {
    const template = await templateRepository.findById(organizationId, input.templateId);
    if (!template) throw new NotFoundError('Template');

    // Uploaded templates (templateMode='PDF') don't run an HTML render — the
    // worker either stamps the source PDF directly or fills the original
    // .docx. PDF-source templates can only emit PDF; DOCX-source templates
    // honor whatever the user picked (worker fills the .docx and renders to
    // PDF via LibreOffice when format=PDF, otherwise returns the filled docx).
    const isUploadedTemplate = template.templateMode === 'PDF';
    const format = isUploadedTemplate
      ? template.sourceFormat === 'DOCX'
        ? input.format
        : 'PDF'
      : input.format;
    const htmlContent = isUploadedTemplate
      ? ''
      : renderTemplate(template.htmlContent, input.data);

    const doc = await documentRepository.create({
      organizationId,
      templateId: template.id,
      name: input.name,
      format,
      htmlContent,
      data: input.data,
    });

    await signingEventService.record(doc.id, 'DOCUMENT_CREATED', {
      metadata: {
        templateId: template.id,
        templateMode: template.templateMode,
        format,
      },
    });

    return doc;
  },

  async getById(organizationId: string, id: string) {
    const doc = await documentRepository.findById(organizationId, id);
    if (!doc) throw new NotFoundError('Document');
    return doc;
  },

  list(organizationId: string) {
    return documentRepository.list(organizationId);
  },

  async streamDownload(organizationId: string, id: string, res: Response) {
    const doc = await documentRepository.findById(organizationId, id);
    if (!doc) throw new NotFoundError('Document');
    if (!doc.fileKey) {
      throw new AppError(409, 'Document has not been generated yet', 'NOT_GENERATED');
    }

    const buffer = await fileStorage.read(doc.fileKey);
    const filename = `${sanitizeFileName(doc.name)}.${extensionFor(doc.format)}`;

    res.setHeader('Content-Type', doc.fileMimeType ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  },

  async streamSignedDownload(organizationId: string, id: string, res: Response) {
    const doc = await documentRepository.findById(organizationId, id);
    if (!doc) throw new NotFoundError('Document');
    if (!doc.signedFileKey) {
      throw new AppError(
        409,
        'Signed artifact is not ready yet',
        'SIGNED_ARTIFACT_NOT_READY',
      );
    }

    const buffer = await fileStorage.read(doc.signedFileKey);
    const filename = `${sanitizeFileName(doc.name)}-signed.pdf`;

    res.setHeader('Content-Type', doc.signedFileMimeType ?? 'application/pdf');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  },

  /**
   * Re-hash the stored signed PDF and re-verify the certificate's HMAC
   * signature. Returns a structured verdict plus the parsed certificate
   * so callers can present audit details alongside the integrity result.
   *
   * `originalFileHashMatches` is `null` when the certificate was issued
   * before originals were hashed, or when the original has been
   * legitimately re-generated since (and is therefore expected to drift).
   */
  async verifyCertificate(organizationId: string, id: string): Promise<VerifyResult> {
    const doc = await documentRepository.findById(organizationId, id);
    if (!doc) throw new NotFoundError('Document');
    if (!doc.certificateFileKey || !doc.signedFileKey) {
      throw new AppError(
        409,
        'Signing certificate is not ready yet',
        'SIGNED_ARTIFACT_NOT_READY',
      );
    }

    const certBuffer = await fileStorage.read(doc.certificateFileKey);
    let cert: SigningCertificate;
    try {
      cert = JSON.parse(certBuffer.toString('utf-8'));
    } catch {
      throw new AppError(500, 'Stored certificate is not valid JSON', 'INVALID_CERTIFICATE');
    }

    const signatureValid = verifyCertificateSignature(cert);

    const signedBytes = await fileStorage.read(doc.signedFileKey);
    const signedFileHashMatches =
      Boolean(cert.signedFile?.sha256) && sha256Hex(signedBytes) === cert.signedFile.sha256;

    let originalFileHashMatches: boolean | null = null;
    if (cert.originalFile && doc.fileKey) {
      try {
        const originalBytes = await fileStorage.read(doc.fileKey);
        originalFileHashMatches = sha256Hex(originalBytes) === cert.originalFile.sha256;
      } catch {
        originalFileHashMatches = false;
      }
    }

    return {
      valid: signatureValid && signedFileHashMatches,
      checks: { signatureValid, signedFileHashMatches, originalFileHashMatches },
      certificate: cert,
    };
  },

  async streamCertificate(organizationId: string, id: string, res: Response) {
    const doc = await documentRepository.findById(organizationId, id);
    if (!doc) throw new NotFoundError('Document');
    if (!doc.certificateFileKey) {
      throw new AppError(
        409,
        'Signing certificate is not ready yet',
        'SIGNED_ARTIFACT_NOT_READY',
      );
    }

    const buffer = await fileStorage.read(doc.certificateFileKey);
    const filename = `${sanitizeFileName(doc.name)}-certificate.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  },

  async enqueueGeneration(organizationId: string, id: string) {
    const doc = await documentRepository.findById(organizationId, id);
    if (!doc) throw new NotFoundError('Document');
    return generationJobService.enqueue(doc.id);
  },

  async listJobs(organizationId: string, id: string) {
    const doc = await documentRepository.findById(organizationId, id);
    if (!doc) throw new NotFoundError('Document');
    return generationJobService.listForDocument(organizationId, doc.id);
  },

  async listEvents(organizationId: string, id: string) {
    const doc = await documentRepository.findById(organizationId, id);
    if (!doc) throw new NotFoundError('Document');
    return signingEventService.listForDocument(doc.id);
  },

  /**
   * Transition a DRAFT document into the SENT state and mint per-signer
   * access tokens. Validates the document has been generated, has at
   * least one signer, and that every signer has at least one field
   * assigned. Schedules a single `document.sent` webhook listing each
   * signer's signing URL.
   */
  async send(organizationId: string, id: string) {
    const doc = await documentRepository.findById(organizationId, id);
    if (!doc) throw new NotFoundError('Document');
    if (doc.status !== 'DRAFT') {
      throw new AppError(409, `Document is ${doc.status}, cannot send`, 'INVALID_STATE');
    }
    if (!doc.fileKey) {
      throw new AppError(409, 'Document must be generated before sending', 'NOT_GENERATED');
    }

    const signers = await signerRepository.list(id);
    if (signers.length === 0) {
      throw new AppError(400, 'Add at least one signer before sending', 'NO_SIGNERS');
    }

    const counts = await fieldRepository.countBySigner(id);
    const signerIdsWithFields = new Set(counts.map((c) => c.signerId));
    const orphans = signers.filter((s) => !signerIdsWithFields.has(s.id));
    if (orphans.length > 0) {
      throw new AppError(
        400,
        `Signers without fields: ${orphans.map((s) => s.email).join(', ')}`,
        'SIGNER_WITHOUT_FIELDS',
      );
    }

    const tokens = signers.map((signer) => {
      const plaintext = generateSigningToken();
      return { signer, plaintext };
    });

    for (const { signer, plaintext } of tokens) {
      await signerRepository.setAccessToken(signer.id, hashSigningToken(plaintext));
    }

    const updated = await documentRepository.markSent(id);

    await signingEventService.record(id, 'DOCUMENT_SENT', {
      metadata: { signerCount: signers.length },
    });

    const signerPayload = tokens.map(({ signer, plaintext }) => ({
      signerId: signer.id,
      name: signer.name,
      email: signer.email,
      order: signer.order,
      signingUrl: buildSigningUrl(plaintext),
      accessToken: plaintext,
    }));

    if (doc.webhookUrl) {
      await webhookDispatcher.schedule({
        documentId: doc.id,
        url: doc.webhookUrl,
        payload: {
          event: 'document.sent',
          documentId: doc.id,
          externalId: doc.externalId,
          status: 'SENT',
          signers: signerPayload,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return { document: updated, signers: signerPayload };
  },
};
