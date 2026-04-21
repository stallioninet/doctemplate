'use client';

import dynamic from 'next/dynamic';
import { use, useState, type FormEvent } from 'react';
import { ApiError, apiFetch, downloadAuthedFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Label,
  StatusPill,
} from '@/components/ui';
import AuditLogSection from '@/components/AuditLogSection';
import VerifyIntegrityPanel from '@/components/VerifyIntegrityPanel';

// PDF.js can't run on the server (it touches `window` indirectly). Bypass SSR
// entirely so the bundle stays clean and hydration is straightforward.
const VisualFieldsEditor = dynamic(() => import('@/components/VisualFieldsEditor'), {
  ssr: false,
  loading: () => <p className="text-sm text-slate-500">Loading visual editor…</p>,
});

type FieldType = 'SIGNATURE' | 'INITIAL' | 'DATE' | 'TEXT' | 'CHECKBOX';

interface DocumentDetail {
  id: string;
  name: string;
  format: 'PDF' | 'DOCX' | 'RTF';
  status: string;
  fileKey: string | null;
  signedFileKey: string | null;
  certificateFileKey: string | null;
  generatedAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  declinedAt: string | null;
  signedFileGeneratedAt: string | null;
  webhookUrl: string | null;
  template: { id: string; name: string };
}

interface Signer {
  id: string;
  name: string;
  email: string;
  order: number;
  status: string;
  signedAt: string | null;
  declinedAt: string | null;
}

interface DocumentField {
  id: string;
  signerId: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  value: string | null;
}

interface JobRow {
  id: string;
  kind: 'RENDER' | 'SIGNED_ARTIFACT';
  status: string;
  attempts: number;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
}

interface SendResponse {
  document: DocumentDetail;
  signers: Array<{
    signerId: string;
    name: string;
    email: string;
    signingUrl: string;
    accessToken: string;
  }>;
}

export default function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { session } = useAuth();
  const doc = useApi<DocumentDetail>(`/api/documents/${id}`);
  const signers = useApi<Signer[]>(`/api/documents/${id}/signers`);
  const fields = useApi<DocumentField[]>(`/api/documents/${id}/fields`);
  const jobs = useApi<JobRow[]>(`/api/documents/${id}/jobs`);

  const [actionError, setActionError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [sendResult, setSendResult] = useState<SendResponse['signers'] | null>(null);

  const reloadAll = () => {
    doc.reload();
    signers.reload();
    fields.reload();
    jobs.reload();
  };

  const runAction = async (path: string, method: 'POST') => {
    if (!session) return;
    setActing(true);
    setActionError(null);
    try {
      const result = await apiFetch<SendResponse | { id: string }>(path, {
        method,
        token: session.token,
      });
      if ('signers' in result) setSendResult(result.signers);
      reloadAll();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setActing(false);
    }
  };

  const download = async (path: string, fallback: string) => {
    if (!session) return;
    try {
      await downloadAuthedFile(path, session.token, fallback);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Download failed');
    }
  };

  if (doc.error) return <ErrorBanner message={doc.error} />;
  if (!doc.data) return <p className="text-sm text-slate-500">Loading…</p>;

  const d = doc.data;
  const isDraft = d.status === 'DRAFT';

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{d.name}</h1>
          <StatusPill status={d.status} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {d.format} · template <span className="font-mono">{d.template.name}</span> · id{' '}
          <span className="font-mono">{d.id}</span>
        </p>
      </div>

      <Card>
        <h2 className="text-lg font-semibold">Actions</h2>
        <ErrorBanner message={actionError} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            disabled={acting}
            onClick={() => runAction(`/api/documents/${id}/generate`, 'POST')}
          >
            {d.fileKey ? 'Re-generate' : 'Generate'}
          </Button>
          <Button
            variant="primary"
            disabled={acting || !isDraft || !d.fileKey}
            onClick={() => runAction(`/api/documents/${id}/send`, 'POST')}
          >
            Send for signature
          </Button>
          <Button
            variant="secondary"
            disabled={!d.fileKey}
            onClick={() =>
              download(`/api/documents/${id}/download`, `${d.name}.${d.format.toLowerCase()}`)
            }
          >
            Download original
          </Button>
          <Button
            variant="secondary"
            disabled={!d.signedFileKey}
            onClick={() =>
              download(`/api/documents/${id}/signed/download`, `${d.name}-signed.pdf`)
            }
          >
            Download signed
          </Button>
          <Button
            variant="secondary"
            disabled={!d.certificateFileKey}
            onClick={() =>
              download(`/api/documents/${id}/certificate`, `${d.name}-certificate.json`)
            }
          >
            Download certificate
          </Button>
        </div>

        {sendResult && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
            <p className="font-medium text-amber-900">
              Signing URLs (also delivered via webhook if configured):
            </p>
            <ul className="mt-2 space-y-1">
              {sendResult.map((s) => (
                <li key={s.signerId} className="break-all">
                  <span className="font-medium">{s.name}</span> ({s.email}):{' '}
                  <code className="rounded bg-white px-1 py-0.5 text-xs">{s.signingUrl}</code>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setSendResult(null)}
              className="mt-2 text-xs text-amber-700 underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </Card>

      <SignersSection
        documentId={id}
        signers={signers.data}
        editable={isDraft}
        reload={() => {
          signers.reload();
          fields.reload();
        }}
      />

      <FieldsSectionWrapper
        documentId={id}
        format={d.format}
        canUseVisual={d.format === 'PDF' && Boolean(d.fileKey)}
        signers={signers.data}
        fields={fields.data}
        editable={isDraft}
        reload={fields.reload}
      />

      <VerifyIntegrityPanel
        documentId={id}
        signedFileReady={Boolean(d.signedFileKey && d.certificateFileKey)}
      />

      <AuditLogSection
        documentId={id}
        signers={(signers.data ?? []).map((s) => ({ id: s.id, name: s.name }))}
      />

      <Card>
        <h2 className="text-lg font-semibold">Generation jobs</h2>
        {jobs.data && jobs.data.length > 0 ? (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Kind</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Started</th>
                <th>Completed</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {jobs.data.map((j) => (
                <tr key={j.id} className="border-t border-slate-100">
                  <td className="py-2 font-medium">{j.kind}</td>
                  <td>
                    <StatusPill status={j.status} />
                  </td>
                  <td>{j.attempts}</td>
                  <td className="text-slate-600">
                    {j.startedAt ? new Date(j.startedAt).toLocaleString() : '—'}
                  </td>
                  <td className="text-slate-600">
                    {j.completedAt ? new Date(j.completedAt).toLocaleString() : '—'}
                  </td>
                  <td className="text-red-700">{j.lastError ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No jobs yet.</p>
        )}
      </Card>
    </div>
  );
}

function SignersSection({
  documentId,
  signers,
  editable,
  reload,
}: {
  documentId: string;
  signers: Signer[] | null;
  editable: boolean;
  reload: () => void;
}) {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/documents/${documentId}/signers`, {
        method: 'POST',
        token: session.token,
        body: { name, email, order },
      });
      setName('');
      setEmail('');
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add signer');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!session) return;
    try {
      await apiFetch(`/api/documents/${documentId}/signers/${id}`, {
        method: 'DELETE',
        token: session.token,
      });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove');
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-semibold">Signers</h2>
      {editable && (
        <form onSubmit={add} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="s-name">Name</Label>
            <Input id="s-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="s-email">Email</Label>
            <Input
              id="s-email"
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="s-order">Order</Label>
            <Input
              id="s-order"
              type="number"
              min={0}
              value={order}
              onChange={(e) => setOrder(Number(e.target.value))}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={busy} className="w-full">
              Add signer
            </Button>
          </div>
        </form>
      )}
      <ErrorBanner message={error} />
      {signers && signers.length > 0 ? (
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2">Name</th>
              <th>Email</th>
              <th>Order</th>
              <th>Status</th>
              <th>Signed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {signers.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="py-2 font-medium">{s.name}</td>
                <td className="text-slate-600">{s.email}</td>
                <td>{s.order}</td>
                <td>
                  <StatusPill status={s.status} />
                </td>
                <td className="text-slate-600">
                  {s.signedAt ? new Date(s.signedAt).toLocaleString() : '—'}
                </td>
                <td className="text-right">
                  {editable && (
                    <button
                      type="button"
                      onClick={() => remove(s.id)}
                      className="text-xs text-red-700 underline hover:text-red-900"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No signers yet.</p>
      )}
    </Card>
  );
}

function FieldsSectionWrapper({
  documentId,
  format,
  canUseVisual,
  signers,
  fields,
  editable,
  reload,
}: {
  documentId: string;
  format: 'PDF' | 'DOCX' | 'RTF';
  canUseVisual: boolean;
  signers: Signer[] | null;
  fields: DocumentField[] | null;
  editable: boolean;
  reload: () => void;
}) {
  const [mode, setMode] = useState<'visual' | 'numeric'>(canUseVisual ? 'visual' : 'numeric');
  const effective = canUseVisual ? mode : 'numeric';

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Fields</h2>
        {canUseVisual ? (
          <div className="flex gap-1 rounded-md bg-slate-100 p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode('visual')}
              className={
                'rounded px-2 py-1 ' +
                (effective === 'visual' ? 'bg-white shadow-sm font-medium' : 'text-slate-600')
              }
            >
              Visual
            </button>
            <button
              type="button"
              onClick={() => setMode('numeric')}
              className={
                'rounded px-2 py-1 ' +
                (effective === 'numeric' ? 'bg-white shadow-sm font-medium' : 'text-slate-600')
              }
            >
              Numeric
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-500">
            {format === 'PDF' ? 'Generate the document to enable the visual editor' : `${format} — visual editor not supported`}
          </span>
        )}
      </div>

      <div className="mt-4">
        {effective === 'visual' && canUseVisual ? (
          <VisualFieldsEditor
            documentId={documentId}
            pdfDownloadPath={`/api/documents/${documentId}/download`}
            signers={(signers ?? []).map((s) => ({ id: s.id, name: s.name, email: s.email }))}
            fields={(fields ?? []).map((f) => ({
              ...f,
              type: f.type as 'SIGNATURE' | 'INITIAL' | 'DATE' | 'TEXT' | 'CHECKBOX',
            }))}
            editable={editable}
            reload={reload}
          />
        ) : (
          <NumericFieldsSection
            documentId={documentId}
            signers={signers}
            fields={fields}
            editable={editable}
            reload={reload}
          />
        )}
      </div>
    </Card>
  );
}

function NumericFieldsSection({
  documentId,
  signers,
  fields,
  editable,
  reload,
}: {
  documentId: string;
  signers: Signer[] | null;
  fields: DocumentField[] | null;
  editable: boolean;
  reload: () => void;
}) {
  const { session } = useAuth();
  const [signerId, setSignerId] = useState('');
  const [type, setType] = useState<FieldType>('SIGNATURE');
  const [page, setPage] = useState(1);
  const [x, setX] = useState(10);
  const [y, setY] = useState(80);
  const [width, setWidth] = useState(40);
  const [height, setHeight] = useState(8);
  const [required, setRequired] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/documents/${documentId}/fields`, {
        method: 'POST',
        token: session.token,
        body: { signerId, type, page, x, y, width, height, required },
      });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add field');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!session) return;
    try {
      await apiFetch(`/api/documents/${documentId}/fields/${id}`, {
        method: 'DELETE',
        token: session.token,
      });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove');
    }
  };

  const signerName = (id: string) => signers?.find((s) => s.id === id)?.name ?? id;

  return (
    <div>
      <p className="text-xs text-slate-500">
        Coordinates are interpreted as page-relative percentages (0–100).
      </p>
      {editable && (signers?.length ?? 0) > 0 && (
        <form onSubmit={add} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="f-signer">Signer</Label>
            <select
              id="f-signer"
              required
              value={signerId}
              onChange={(e) => setSignerId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
            >
              <option value="">Select…</option>
              {(signers ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="f-type">Type</Label>
            <select
              id="f-type"
              value={type}
              onChange={(e) => setType(e.target.value as FieldType)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
            >
              <option>SIGNATURE</option>
              <option>INITIAL</option>
              <option>DATE</option>
              <option>TEXT</option>
              <option>CHECKBOX</option>
            </select>
          </div>
          <div>
            <Label htmlFor="f-page">Page</Label>
            <Input
              id="f-page"
              type="number"
              min={1}
              value={page}
              onChange={(e) => setPage(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="f-required">Required</Label>
            <select
              id="f-required"
              value={required ? '1' : '0'}
              onChange={(e) => setRequired(e.target.value === '1')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
            >
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </div>
          <div>
            <Label htmlFor="f-x">x</Label>
            <Input
              id="f-x"
              type="number"
              value={x}
              onChange={(e) => setX(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="f-y">y</Label>
            <Input
              id="f-y"
              type="number"
              value={y}
              onChange={(e) => setY(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="f-w">width</Label>
            <Input
              id="f-w"
              type="number"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="f-h">height</Label>
            <Input
              id="f-h"
              type="number"
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
            />
          </div>
          <div className="sm:col-span-4">
            <Button type="submit" disabled={busy}>
              Add field
            </Button>
          </div>
        </form>
      )}
      <ErrorBanner message={error} />
      {fields && fields.length > 0 ? (
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2">Signer</th>
              <th>Type</th>
              <th>Page</th>
              <th>x</th>
              <th>y</th>
              <th>w</th>
              <th>h</th>
              <th>Required</th>
              <th>Filled</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.id} className="border-t border-slate-100">
                <td className="py-2 font-medium">{signerName(f.signerId)}</td>
                <td>{f.type}</td>
                <td>{f.page}</td>
                <td>{f.x}</td>
                <td>{f.y}</td>
                <td>{f.width}</td>
                <td>{f.height}</td>
                <td>{f.required ? 'Yes' : 'No'}</td>
                <td>{f.value ? '✓' : '—'}</td>
                <td className="text-right">
                  {editable && (
                    <button
                      type="button"
                      onClick={() => remove(f.id)}
                      className="text-xs text-red-700 underline hover:text-red-900"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No fields yet.</p>
      )}
    </div>
  );
}
