import { randomUUID } from 'crypto';
import type { GenerationJobKind } from '@prisma/client';
import { env } from '../../config/env';
import { documentEngine } from '../../engine/documentEngine';
import { getAdapter } from '../../engine/adapters';
import { fillDocxBookmarks } from '../../engine/docxBookmarks';
import { convertDocxToPdf, fillDocxWithValues } from '../../engine/docxFidelity';
import { stampPlaceholderValuesOnPdf } from '../../engine/placeholderRender';
import {
  buildCertificate,
  buildCertificationAppendixHtml,
  buildSignedHtml,
} from '../../engine/signedArtifact';
import { mergePdfs, stampFieldsOnPdf } from '../../engine/signedOverlay';
import { fileStorage } from '../../storage/fileStorage';
import { AppError, NotFoundError } from '../../utils/errors';
import { sha256Hex } from '../../utils/hash';
import { prisma } from '../../db/prisma';
import { documentRepository } from '../documents/document.repository';
import { fieldRepository } from '../fields/field.repository';
import { signerRepository } from '../signers/signer.repository';
import { signingEventService } from '../signingEvents/signingEvent.service';
import { webhookDispatcher } from '../webhooks/webhookDispatcher';
import { generationJobRepository } from './generationJob.repository';

const trimSlash = (s: string) => s.replace(/\/+$/, '');
const buildDownloadUrl = (documentId: string): string =>
  `${trimSlash(env.PUBLIC_BASE_URL)}/api/documents/${documentId}/download`;
const buildSignedDownloadUrl = (documentId: string): string =>
  `${trimSlash(env.PUBLIC_BASE_URL)}/api/documents/${documentId}/signed/download`;
const buildCertificateUrl = (documentId: string): string =>
  `${trimSlash(env.PUBLIC_BASE_URL)}/api/documents/${documentId}/certificate`;

export const generationJobService = {
  enqueue(documentId: string) {
    return generationJobRepository.create(documentId, 'RENDER');
  },

  enqueueSignedArtifact(documentId: string) {
    return generationJobRepository.create(documentId, 'SIGNED_ARTIFACT');
  },

  async getById(organizationId: string, id: string) {
    const job = await generationJobRepository.findById(organizationId, id);
    if (!job) throw new NotFoundError('GenerationJob');
    return job;
  },

  listForDocument(organizationId: string, documentId: string) {
    return generationJobRepository.findManyByDocument(organizationId, documentId);
  },

  claimNext() {
    return generationJobRepository.claimNext();
  },

  /**
   * Worker entrypoint. Branches on `kind`:
   *  - RENDER          → original Phase 2 flow (engine.generate from htmlContent)
   *  - SIGNED_ARTIFACT → Phase 6 flow (overlay+appendix PDF + certificate JSON)
   *
   * No org scope needed: the job is system-trusted because claimNext is
   * the only producer and jobs are only enqueued via scoped service calls.
   */
  async process(jobId: string, documentId: string, kind: GenerationJobKind) {
    if (kind === 'SIGNED_ARTIFACT') {
      return this.processSignedArtifact(jobId, documentId);
    }
    return this.processRender(jobId, documentId);
  },

  async processRender(jobId: string, documentId: string) {
    const doc = await documentRepository.findByIdUnscoped(documentId);
    if (!doc) throw new Error(`Document ${documentId} not found`);

    // PDF templates: load source PDF + placeholders, stamp doc.data values
    // at saved positions, persist the resulting PDF directly. Skips the
    // HTML → engine path entirely.
    const template = await prisma.template.findUnique({
      where: { id: doc.templateId },
      include: { placeholders: true },
    });
    if (!template) throw new Error(`Template ${doc.templateId} not found`);

    let generated: { key: string; mimeType: string; size: number; extension: string };
    // Drupal-ingested DOCX templates store the .docx at sourceFileKey; UI
    // uploads keep the .docx at originalFileKey alongside the PDF facsimile.
    // Prefer the dedicated original key so PDF-stamping templates (which
    // also live at sourceFileKey) aren't accidentally treated as DOCX.
    const docxSourceKey =
      template.sourceFormat === 'DOCX'
        ? template.originalFileKey ?? template.sourceFileKey
        : null;
    if (docxSourceKey && (doc.format === 'DOCX' || doc.format === 'PDF')) {
      // High-fidelity DOCX path: fill the original .docx directly so Word's
      // layout (fonts, margins, alignment, tables, sections, headers/footers,
      // page breaks) is preserved exactly. For PDF output, hand the filled
      // DOCX to LibreOffice headless, which renders OOXML with near-Word
      // fidelity — a much better facsimile than the mammoth→HTML→Chromium
      // path that flattens most of Word's layout metadata.
      const sourceBytes = await fileStorage.read(docxSourceKey);
      // Two-stage fill: first replace Word bookmark ranges with values
      // (auto-detected at upload time, surfaced as BOOKMARK placeholders),
      // then run docxtemplater to substitute any {{var}} markers the author
      // wrote inline. Templates can use either style or both.
      const values = doc.data as Record<string, unknown>;
      const bookmarkValues: Record<string, unknown> = {};
      for (const ph of template.placeholders) {
        if (ph.kind !== 'BOOKMARK') continue;
        const v = values[ph.name];
        bookmarkValues[ph.name] = v == null || v === '' ? ph.defaultValue ?? '' : v;
      }
      const afterBookmarks = await fillDocxBookmarks(sourceBytes, bookmarkValues);
      const filledDocx = await fillDocxWithValues(afterBookmarks, values);

      if (doc.format === 'DOCX') {
        const mimeType =
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        const key = `generated/${doc.id}/render-${Date.now()}.docx`;
        const saved = await fileStorage.save(filledDocx, key, mimeType);
        generated = { key: saved.key, mimeType, size: saved.size, extension: 'docx' };
      } else {
        const pdfBytes = await convertDocxToPdf(filledDocx);
        const key = `generated/${doc.id}/render-${Date.now()}.pdf`;
        const saved = await fileStorage.save(pdfBytes, key, 'application/pdf');
        generated = {
          key: saved.key,
          mimeType: 'application/pdf',
          size: saved.size,
          extension: 'pdf',
        };
      }
    } else if (template.templateMode === 'PDF') {
      if (!template.sourceFileKey) {
        throw new AppError(500, 'PDF template has no source file', 'NO_SOURCE_FILE');
      }
      const sourceBytes = await fileStorage.read(template.sourceFileKey);
      const stamped = await stampPlaceholderValuesOnPdf(
        sourceBytes,
        template.placeholders,
        doc.data as Record<string, unknown>,
      );
      const key = `generated/${doc.id}/render-${Date.now()}.pdf`;
      const saved = await fileStorage.save(stamped, key, 'application/pdf');
      generated = {
        key: saved.key,
        mimeType: 'application/pdf',
        size: saved.size,
        extension: 'pdf',
      };
    } else {
      generated = await documentEngine.generate({
        id: doc.id,
        name: doc.name,
        format: doc.format,
        htmlContent: doc.htmlContent,
      });
    }

    await documentRepository.markGenerated(doc.id, {
      fileKey: generated.key,
      fileMimeType: generated.mimeType,
      fileSize: generated.size,
    });

    await signingEventService.record(doc.id, 'DOCUMENT_GENERATED', {
      metadata: {
        format: doc.format,
        size: generated.size,
        templateMode: template.templateMode,
      },
    });

    await generationJobRepository.markCompleted(jobId);

    if (doc.webhookUrl) {
      await webhookDispatcher.schedule({
        jobId,
        url: doc.webhookUrl,
        payload: {
          event: 'document.generated',
          documentId: doc.id,
          externalId: doc.externalId,
          status: 'GENERATED',
          format: doc.format,
          downloadUrl: buildDownloadUrl(doc.id),
          file: { mimeType: generated.mimeType, size: generated.size },
          timestamp: new Date().toISOString(),
        },
      });
    }
  },

  async processSignedArtifact(jobId: string, documentId: string) {
    const doc = await documentRepository.findByIdUnscoped(documentId);
    if (!doc) throw new Error(`Document ${documentId} not found`);
    if (doc.status !== 'COMPLETED') {
      throw new AppError(
        409,
        `Document ${documentId} is not COMPLETED (got ${doc.status})`,
        'INVALID_STATE',
      );
    }

    const adapter = getAdapter('PDF');
    if (!adapter) throw new AppError(500, 'No PDF adapter registered', 'NO_ADAPTER');

    const [signers, fields, events] = await Promise.all([
      signerRepository.list(documentId),
      fieldRepository.list(documentId),
      signingEventService.listForDocument(documentId),
    ]);

    let originalHash: { sha256: string; size: number } | null = null;
    let pdfBuffer: Buffer;
    if (doc.format === 'PDF' && doc.fileKey) {
      // Phase 9: load the original PDF, stamp filled fields at their saved
      // page-relative positions, then append the certification appendix as
      // a separate page set so the overlays land on the real document
      // pages rather than a re-rendered HTML facsimile.
      const originalBytes = await fileStorage.read(doc.fileKey);
      originalHash = { sha256: sha256Hex(originalBytes), size: originalBytes.length };
      const overlaidBuffer = await stampFieldsOnPdf(originalBytes, fields);
      const appendixHtml = buildCertificationAppendixHtml({ document: doc, signers, fields, events });
      const appendixBuffer = await adapter.generate(appendixHtml, {
        documentId: doc.id,
        documentName: doc.name,
      });
      pdfBuffer = await mergePdfs([overlaidBuffer, appendixBuffer]);
    } else {
      // Phase 6 fallback for DOCX/RTF originals (or PDFs that were never
      // generated): re-render document body + appendix together as one PDF.
      const signedHtml = buildSignedHtml({ document: doc, signers, fields, events });
      pdfBuffer = await adapter.generate(signedHtml, {
        documentId: doc.id,
        documentName: doc.name,
      });
    }

    const signedKey = `signed/${doc.id}/${randomUUID().slice(0, 8)}.pdf`;
    const signedSaved = await fileStorage.save(pdfBuffer, signedKey, adapter.mimeType);

    // Phase 10: sign the certificate so receivers can verify integrity
    // without trusting the storage layer.
    const certificate = buildCertificate(
      { document: doc, signers, fields, events },
      {
        originalFile: originalHash,
        signedFile: { sha256: sha256Hex(pdfBuffer), size: signedSaved.size },
      },
    );
    const certBuffer = Buffer.from(JSON.stringify(certificate, null, 2), 'utf-8');
    const certKey = `signed/${doc.id}/${randomUUID().slice(0, 8)}-certificate.json`;
    await fileStorage.save(certBuffer, certKey, 'application/json');

    await documentRepository.markSignedArtifactReady(doc.id, {
      signedFileKey: signedSaved.key,
      signedFileMimeType: adapter.mimeType,
      signedFileSize: signedSaved.size,
      certificateFileKey: certKey,
    });

    await signingEventService.record(doc.id, 'SIGNED_ARTIFACT_GENERATED', {
      metadata: {
        signedFileSha256: certificate.signedFile.sha256,
        size: signedSaved.size,
      },
    });

    await generationJobRepository.markCompleted(jobId);

    if (doc.webhookUrl) {
      await webhookDispatcher.schedule({
        jobId,
        url: doc.webhookUrl,
        payload: {
          event: 'document.signed_artifact_ready',
          documentId: doc.id,
          externalId: doc.externalId,
          signedFile: {
            mimeType: adapter.mimeType,
            size: signedSaved.size,
            sha256: certificate.signedFile.sha256,
          },
          certificate: {
            algorithm: certificate.signature.algorithm,
            signature: certificate.signature.value,
          },
          signedDownloadUrl: buildSignedDownloadUrl(doc.id),
          certificateUrl: buildCertificateUrl(doc.id),
          timestamp: new Date().toISOString(),
        },
      });
    }
  },

  async handleFailure(
    jobId: string,
    documentId: string,
    error: Error,
    job: { attempts: number; maxAttempts: number; kind: GenerationJobKind },
  ) {
    if (job.attempts >= job.maxAttempts) {
      await generationJobRepository.markFailed(jobId, error.message);

      const doc = await documentRepository.findByIdUnscoped(documentId);
      if (doc?.webhookUrl) {
        const event =
          job.kind === 'SIGNED_ARTIFACT' ? 'document.signed_artifact_failed' : 'document.failed';
        await webhookDispatcher.schedule({
          jobId,
          url: doc.webhookUrl,
          payload: {
            event,
            documentId: doc.id,
            externalId: doc.externalId,
            status: 'FAILED',
            kind: job.kind,
            format: doc.format,
            error: error.message,
            timestamp: new Date().toISOString(),
          },
        });
      }
      return;
    }
    await generationJobRepository.markPendingForRetry(jobId, error.message);
  },
};
