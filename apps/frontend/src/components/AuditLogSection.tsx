'use client';

import { useMemo } from 'react';
import { useApi } from '@/lib/useApi';
import { Button, Card, ErrorBanner } from '@/components/ui';

export interface SigningEventRow {
  id: string;
  type: string;
  signerId: string | null;
  fieldId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
  createdAt: string;
}

interface SignerLite {
  id: string;
  name: string;
}

interface Props {
  documentId: string;
  signers: SignerLite[] | null;
}

const downloadCsv = (filename: string, rows: string[][]) => {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const formatMetadata = (meta: unknown): string => {
  if (meta == null) return '';
  if (typeof meta === 'string') return meta;
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
};

export default function AuditLogSection({ documentId, signers }: Props) {
  const { data: events, error, loading, reload } = useApi<SigningEventRow[]>(
    `/api/documents/${documentId}/events`,
  );

  const signerName = useMemo(() => {
    const map = new Map((signers ?? []).map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? map.get(id) ?? id : '—');
  }, [signers]);

  const exportCsv = () => {
    if (!events) return;
    const header = [
      'timestamp',
      'type',
      'signer_id',
      'signer_name',
      'field_id',
      'ip_address',
      'user_agent',
      'metadata',
    ];
    const rows = events.map((e) => [
      e.createdAt,
      e.type,
      e.signerId ?? '',
      e.signerId ? signerName(e.signerId) : '',
      e.fieldId ?? '',
      e.ipAddress ?? '',
      e.userAgent ?? '',
      formatMetadata(e.metadata),
    ]);
    downloadCsv(`document-${documentId}-audit-log.csv`, [header, ...rows]);
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Audit log</h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={reload} disabled={loading}>
            Refresh
          </Button>
          <Button
            variant="secondary"
            onClick={exportCsv}
            disabled={!events || events.length === 0}
          >
            Download CSV
          </Button>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Append-only event log — same data embedded in the signing certificate.
      </p>

      <ErrorBanner message={error} />

      {events && events.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">When (UTC)</th>
                <th>Type</th>
                <th>Signer</th>
                <th>IP</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap py-2 font-mono text-xs text-slate-600">
                    {new Date(e.createdAt).toISOString()}
                  </td>
                  <td className="font-medium">{e.type}</td>
                  <td>{e.signerId ? signerName(e.signerId) : <span className="text-slate-400">system</span>}</td>
                  <td className="font-mono text-xs text-slate-500">{e.ipAddress ?? '—'}</td>
                  <td className="font-mono text-xs text-slate-500 break-all">
                    {formatMetadata(e.metadata) || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          {loading ? 'Loading…' : 'No events recorded yet.'}
        </p>
      )}
    </Card>
  );
}
