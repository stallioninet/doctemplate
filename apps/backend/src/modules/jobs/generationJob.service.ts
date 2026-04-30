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
    // For UI-uploaded DOCX templates, sourceFileKey is the empty-DOCX → PDF
    // facsimile and originalFileKey is the raw .docx. DOCX output still needs
    // the OOXML-fill path because we can't synthesise a .docx from a stamped
    // PDF. Drupal-ingested DOCX (originalFileKey null, sourceFileKey is .docx)
    // also needs OOXML fill for DOCX output.
    const docxOriginalKey =
      template.sourceFormat === 'DOCX'
        ? template.originalFileKey ?? template.sourceFileKey
        : null;
    if (docxOriginalKey) {
      // DOCX template — fill the original .docx first so {{tag}} tokens and
      // Word bookmarks are substituted in their natural document flow, then
      // either save the .docx directly (DOCX output) or convert to PDF and
      // stamp only COORD-kind placeholders on top (PDF output). This avoids
      // the {{tag}} leakage that occurred when stamping onto a facsimile
      // generated from a template that still contained literal token text.
      const sourceBytes = await fileStorage.read(docxOriginalKey);
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
        // Convert the *filled* DOCX (no residual {{tags}}) to PDF, then stamp
        // visually-positioned (COORD) placeholders on top. BOOKMARK
        // placeholders are already inlined by the DOCX fill above, so
        // re-stamping them would double-render their values.
        const filledPdfBytes = await convertDocxToPdf(filledDocx);
        const coordPlaceholders = template.placeholders.filter((p) => p.kind === 'COORD');
        const stamped = await stampPlaceholderValuesOnPdf(
          filledPdfBytes,
          coordPlaceholders,
          values,
        );
        const key = `generated/${doc.id}/render-${Date.now()}.pdf`;
        const saved = await fileStorage.save(stamped, key, 'application/pdf');
        generated = {
          key: saved.key,
          mimeType: 'application/pdf',
          size: saved.size,
          extension: 'pdf',
        };
      }
    } else if (template.templateMode === 'PDF') {
      // Native PDF template (no DOCX original). Stamp values directly onto
      // the source PDF — there are no {{tags}} to substitute, only COORD
      // placeholders authored via the visual editor.
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
    if (doc.fileKey && (doc.format === 'PDF' || doc.format === 'DOCX')) {
      // Load the rendered document. PDFs are used as-is; DOCX output is
      // converted via LibreOffice so the canvas keeps Word's layout, fonts,
      // images, and headers/footers. Fields are then stamped at their saved
      // page-relative positions and the certification appendix is appended.
      const renderedBytes = await fileStorage.read(doc.fileKey);
      originalHash = { sha256: sha256Hex(renderedBytes), size: renderedBytes.length };
      const canvasBytes =
        doc.format === 'PDF' ? renderedBytes : await convertDocxToPdf(renderedBytes);
      const overlaidBuffer = await stampFieldsOnPdf(canvasBytes, fields);
      const appendixHtml = buildCertificationAppendixHtml({ document: doc, signers, fields, events });
      const appendixBuffer = await adapter.generate(appendixHtml, {
        documentId: doc.id,
        documentName: doc.name,
      });
      pdfBuffer = await mergePdfs([overlaidBuffer, appendixBuffer]);
    } else {
      // Fallback for documents without a rendered file (e.g. legacy RTF):
      // re-render body + appendix together as one PDF.
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
