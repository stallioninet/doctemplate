'use client';

import { useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, ErrorBanner } from '@/components/ui';

interface FileHash {
  sha256: string;
  size: number;
}

interface CertificateMeta {
  version: number;
  documentId: string;
  signedFile: FileHash;
  originalFile: FileHash | null;
  signature: { algorithm: string; value: string };
}

interface VerifyResult {
  valid: boolean;
  checks: {
    signatureValid: boolean;
    signedFileHashMatches: boolean;
    originalFileHashMatches: boolean | null;
  };
  certificate: CertificateMeta;
}

const truncate = (s: string, n = 12) => (s.length > n ? `${s.slice(0, n)}…` : s);

const Check = ({
  ok,
  label,
}: {
  ok: boolean | null;
  label: string;
}) => {
  if (ok === null) {
    return (
      <li className="flex items-center justify-between text-sm text-slate-500">
        <span>{label}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">n/a</span>
      </li>
    );
  }
  return (
    <li className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <span
        className={
          'rounded-full px-2 py-0.5 text-xs font-medium ' +
          (ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')
        }
      >
        {ok ? 'pass' : 'fail'}
      </span>
    </li>
  );
};

interface Props {
  documentId: string;
  signedFileReady: boolean;
}

export default function VerifyIntegrityPanel({ documentId, signedFileReady }: Props) {
  const { session } = useAuth();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<VerifyResult>(
        `/api/documents/${documentId}/certificate/verify`,
        { token: session.token },
      );
      setResult(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Integrity</h2>
        <Button
          variant="secondary"
          onClick={verify}
          disabled={busy || !signedFileReady}
          title={!signedFileReady ? 'Available once the signed artifact is ready' : undefined}
        >
          {busy ? 'Verifying…' : 'Verify integrity'}
        </Button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Re-hashes the stored signed PDF and re-checks the certificate&rsquo;s HMAC signature.
      </p>

      <ErrorBanner message={error} />

      {result && (
        <div className="mt-4 space-y-4">
          <div
            className={
              'rounded-md border p-3 text-sm font-medium ' +
              (result.valid
                ? 'border-green-300 bg-green-50 text-green-900'
                : 'border-red-300 bg-red-50 text-red-900')
            }
          >
            {result.valid
              ? '✓ Verified — the signed artifact has not been altered.'
              : '✗ Failed — the signed artifact or certificate does not match.'}
          </div>

          <ul className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
            <Check ok={result.checks.signatureValid} label="Certificate HMAC signature" />
            <Check ok={result.checks.signedFileHashMatches} label="Signed PDF SHA-256 matches certificate" />
            <Check
              ok={result.checks.originalFileHashMatches}
              label="Original PDF SHA-256 matches certificate"
            />
          </ul>

          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div className="rounded bg-slate-50 p-2">
              <dt className="text-slate-500">Signed file SHA-256</dt>
              <dd
                className="mt-1 font-mono break-all"
                title={result.certificate.signedFile.sha256}
              >
                {truncate(result.certificate.signedFile.sha256, 24)}
              </dd>
              <dd className="mt-1 text-slate-500">{result.certificate.signedFile.size} bytes</dd>
            </div>
            <div className="rounded bg-slate-50 p-2">
              <dt className="text-slate-500">Original file SHA-256</dt>
              <dd
                className="mt-1 font-mono break-all"
                title={result.certificate.originalFile?.sha256 ?? ''}
              >
                {result.certificate.originalFile
                  ? truncate(result.certificate.originalFile.sha256, 24)
                  : '—'}
              </dd>
              <dd className="mt-1 text-slate-500">
                {result.certificate.originalFile
                  ? `${result.certificate.originalFile.size} bytes`
                  : 'fallback path (DOCX/RTF original)'}
              </dd>
            </div>
            <div className="rounded bg-slate-50 p-2 sm:col-span-2">
              <dt className="text-slate-500">Signature</dt>
              <dd className="mt-1 font-mono break-all" title={result.certificate.signature.value}>
                {result.certificate.signature.algorithm}: {truncate(result.certificate.signature.value, 32)}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  );
}
