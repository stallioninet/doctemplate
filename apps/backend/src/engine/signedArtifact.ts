import type {
  Document,
  DocumentField,
  Signer,
  SigningEvent,
  SigningEventType,
} from '@prisma/client';
import { HMAC_ALGORITHM, hmacSign, hmacVerify } from '../utils/hmac';
import { wrapHtml } from './adapters/htmlShell';

export interface SignedArtifactInput {
  document: Document;
  signers: Signer[];
  fields: DocumentField[];
  events: SigningEvent[];
}

export interface FileHash {
  sha256: string;
  size: number;
}

const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmt = (d: Date | null | undefined): string => (d ? new Date(d).toISOString() : '—');

const renderValue = (value: string | null): string => {
  if (!value) return '<em>—</em>';
  if (/^data:image\//i.test(value)) {
    return `<img src="${esc(value)}" alt="signature" style="max-width:140pt;max-height:40pt"/>`;
  }
  return esc(value);
};

const buildSignatureTable = (signers: Signer[]): string => {
  const rows = signers
    .map(
      (s) => `
        <tr>
          <td>${esc(s.name)}</td>
          <td>${esc(s.email)}</td>
          <td>${esc(s.status)}</td>
          <td>${fmt(s.signedAt)}</td>
          <td>${esc(s.ipAddress ?? '—')}</td>
        </tr>`,
    )
    .join('');
  return `
    <h2>Signatures</h2>
    <table>
      <thead>
        <tr><th>Signer</th><th>Email</th><th>Status</th><th>Signed at (UTC)</th><th>IP</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
};

const buildFieldsTable = (signers: Signer[], fields: DocumentField[]): string => {
  const signerById = new Map(signers.map((s) => [s.id, s]));
  const rows = fields
    .map((f) => {
      const signer = signerById.get(f.signerId);
      return `
        <tr>
          <td>${esc(signer?.name ?? f.signerId)}</td>
          <td>${esc(f.type)}</td>
          <td>${renderValue(f.value)}</td>
          <td>${fmt(f.filledAt)}</td>
        </tr>`;
    })
    .join('');
  return `
    <h3>Field values</h3>
    <table>
      <thead>
        <tr><th>Signer</th><th>Field</th><th>Value</th><th>Filled at (UTC)</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
};

const eventLine = (
  event: SigningEvent,
  signersById: Map<string, Signer>,
): string => {
  const who = event.signerId ? signersById.get(event.signerId)?.name ?? 'unknown signer' : 'system';
  const ip = event.ipAddress ? ` (IP ${event.ipAddress})` : '';
  switch (event.type) {
    case 'DOCUMENT_CREATED':
      return 'Document created';
    case 'DOCUMENT_GENERATED':
      return 'Document rendered';
    case 'DOCUMENT_SENT':
      return 'Document sent for signature';
    case 'SIGNER_VIEWED':
      return `${who} viewed the document${ip}`;
    case 'SIGNER_FIELD_FILLED':
      return `${who} filled a field${ip}`;
    case 'SIGNER_SIGNED':
      return `${who} signed`;
    case 'SIGNER_DECLINED':
      return `${who} declined`;
    case 'DOCUMENT_COMPLETED':
      return 'Document completed (all signers signed)';
    case 'DOCUMENT_DECLINED':
      return 'Document declined';
    case 'DOCUMENT_VOIDED':
      return 'Document voided';
    case 'SIGNED_ARTIFACT_GENERATED':
      return 'Signed artifact generated';
  }
};

const buildAuditTrail = (events: SigningEvent[], signers: Signer[]): string => {
  const signersById = new Map(signers.map((s) => [s.id, s]));
  if (events.length === 0) {
    return `<h2>Audit trail</h2><p><em>No events recorded.</em></p>`;
  }
  const items = events
    .map((e) => `<li>${fmt(e.createdAt)} — ${esc(eventLine(e, signersById))}</li>`)
    .join('');
  return `
    <h2>Audit trail</h2>
    <ol>${items}</ol>`;
};

const APPENDIX_STYLE = `
  .dt-signed-appendix{page-break-before:always;margin-top:32pt;border-top:2pt solid #333;padding-top:16pt}
  .dt-signed-appendix h2{margin:18pt 0 8pt;font-size:16pt}
  .dt-signed-appendix h3{margin:12pt 0 6pt;font-size:13pt}
  .dt-signed-appendix table{width:100%;border-collapse:collapse;margin:0 0 12pt;font-size:10pt}
  .dt-signed-appendix th,.dt-signed-appendix td{border:1px solid #888;padding:5pt;vertical-align:top;text-align:left}
  .dt-signed-appendix th{background:#f2f2f2}
  .dt-signed-appendix ol{margin:0 0 0 24pt;font-size:10pt;line-height:1.6}
`;

const buildAppendixSections = ({
  document: doc,
  signers,
  fields,
  events,
}: SignedArtifactInput): string => `
  <div class="dt-signed-appendix">
    ${buildSignatureTable(signers)}
    ${buildFieldsTable(signers, fields)}
    ${buildAuditTrail(events, signers)}
    <p style="font-size:9pt;color:#555;margin-top:12pt">Document ${esc(doc.id)}</p>
  </div>`;

/**
 * Fallback path (Phase 6): re-render the original document body + appendix
 * through Puppeteer. Used when the source format is not PDF (DOCX/RTF) or
 * when the original PDF bytes are unavailable.
 */
export const buildSignedHtml = (input: SignedArtifactInput): string => {
  const body = `<style>${APPENDIX_STYLE}</style>${input.document.htmlContent}${buildAppendixSections(input)}`;
  return wrapHtml(body);
};

/**
 * Phase 9 path: just the appendix, wrapped in a minimal HTML shell. Rendered
 * to its own PDF and merged after the (positionally overlaid) original.
 */
export const buildCertificationAppendixHtml = (input: SignedArtifactInput): string => {
  const body = `<style>${APPENDIX_STYLE}</style>${buildAppendixSections(input)}`;
  return wrapHtml(body);
};

export interface CertificateEvent {
  id: string;
  type: SigningEventType;
  signerId: string | null;
  fieldId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface CertificateSignature {
  algorithm: typeof HMAC_ALGORITHM;
  value: string;
}

export interface SigningCertificate {
  version: 2;
  documentId: string;
  documentName: string;
  format: Document['format'];
  organizationId: string;
  status: Document['status'];
  createdAt: string;
  sentAt: string | null;
  completedAt: string | null;
  declinedAt: string | null;
  signers: Array<{
    id: string;
    name: string;
    email: string;
    status: Signer['status'];
    order: number;
    viewedAt: string | null;
    signedAt: string | null;
    declinedAt: string | null;
    declineReason: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    fields: Array<{
      id: string;
      type: DocumentField['type'];
      page: number;
      value: string | null;
      filledAt: string | null;
    }>;
  }>;
  events: CertificateEvent[];
  originalFile: FileHash | null;
  signedFile: FileHash;
  signature: CertificateSignature;
}

const iso = (d: Date | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

export interface BuildCertificateOptions {
  originalFile: FileHash | null;
  signedFile: FileHash;
}

export const buildCertificate = (
  { document: doc, signers, fields, events }: SignedArtifactInput,
  hashes: BuildCertificateOptions,
): SigningCertificate => {
  const fieldsBySigner = new Map<string, DocumentField[]>();
  for (const f of fields) {
    const list = fieldsBySigner.get(f.signerId) ?? [];
    list.push(f);
    fieldsBySigner.set(f.signerId, list);
  }

  // Build the unsigned cert with explicit literal field order so JSON.stringify
  // is deterministic across builds and verification.
  const unsigned = {
    version: 2 as const,
    documentId: doc.id,
    documentName: doc.name,
    format: doc.format,
    organizationId: doc.organizationId,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    sentAt: iso(doc.sentAt),
    completedAt: iso(doc.completedAt),
    declinedAt: iso(doc.declinedAt),
    signers: signers.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      status: s.status,
      order: s.order,
      viewedAt: iso(s.viewedAt),
      signedAt: iso(s.signedAt),
      declinedAt: iso(s.declinedAt),
      declineReason: s.declineReason,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      fields: (fieldsBySigner.get(s.id) ?? []).map((f) => ({
        id: f.id,
        type: f.type,
        page: f.page,
        value: f.value,
        filledAt: iso(f.filledAt),
      })),
    })),
    events: events.map(
      (e): CertificateEvent => ({
        id: e.id,
        type: e.type,
        signerId: e.signerId,
        fieldId: e.fieldId,
        ipAddress: e.ipAddress,
        userAgent: e.userAgent,
        metadata: e.metadata,
        createdAt: e.createdAt.toISOString(),
      }),
    ),
    originalFile: hashes.originalFile,
    signedFile: hashes.signedFile,
  };

  const payload = JSON.stringify(unsigned);
  const signature: CertificateSignature = {
    algorithm: HMAC_ALGORITHM,
    value: hmacSign(payload),
  };

  return { ...unsigned, signature };
};

export interface VerifyResult {
  valid: boolean;
  checks: {
    signatureValid: boolean;
    signedFileHashMatches: boolean;
    originalFileHashMatches: boolean | null;
  };
  certificate: SigningCertificate;
}

/**
 * Recompute the unsigned cert payload by stripping the `signature` key,
 * re-stringify in the same insertion order, and HMAC-verify. Object key
 * order is preserved by V8 across JSON.parse → JSON.stringify, and the
 * cert is constructed with literal field order so the payload is stable.
 */
export const verifyCertificateSignature = (cert: SigningCertificate): boolean => {
  if (!cert.signature || cert.signature.algorithm !== HMAC_ALGORITHM) return false;
  const { signature: _drop, ...rest } = cert;
  void _drop;
  const payload = JSON.stringify(rest);
  return hmacVerify(payload, cert.signature.value);
};
