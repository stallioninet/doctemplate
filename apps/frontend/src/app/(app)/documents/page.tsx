'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Label,
  StatusPill,
  Textarea,
} from '@/components/ui';

interface DocumentRow {
  id: string;
  name: string;
  format: 'PDF' | 'DOCX' | 'RTF';
  status: string;
  createdAt: string;
  fileKey: string | null;
  signedFileKey: string | null;
}

interface TemplateOption {
  id: string;
  name: string;
  templateMode: 'HTML' | 'PDF';
  sourceFormat: 'PDF' | 'DOCX' | 'RTF' | null;
}

interface Placeholder {
  id: string;
  name: string;
  type: 'TEXT' | 'DATE' | 'NUMBER';
  required: boolean;
  defaultValue: string | null;
}

export default function DocumentsPage() {
  const router = useRouter();
  const { session } = useAuth();
  const docs = useApi<DocumentRow[]>('/api/documents');
  const templates = useApi<TemplateOption[]>('/api/templates');

  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [format, setFormat] = useState<'PDF' | 'DOCX' | 'RTF'>('PDF');
  const [dataJson, setDataJson] = useState('{}');
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectedTemplate = templates.data?.find((t) => t.id === templateId);
  const isPdfTemplate = selectedTemplate?.templateMode === 'PDF';
  // PDF-source uploaded templates can only emit PDF; DOCX-source uploaded
  // templates can emit DOCX (the worker fills the original .docx) or PDF
  // (LibreOffice renders the filled docx). HTML templates are always free-choice.
  const isPdfOnlyTemplate =
    isPdfTemplate && selectedTemplate?.sourceFormat !== 'DOCX';

  const placeholders = useApi<Placeholder[]>(
    isPdfTemplate ? `/api/templates/${templateId}/placeholders` : null,
  );

  const onTemplateChange = (id: string) => {
    setTemplateId(id);
    setPlaceholderValues({});
    // Default the output format to the template's source so a Word template
    // naturally produces a Word document (the worker fills the original .docx
    // for an exact Word-fidelity render).
    const picked = templates.data?.find((t) => t.id === id);
    if (picked?.sourceFormat === 'DOCX') setFormat('DOCX');
    else if (picked?.sourceFormat === 'PDF') setFormat('PDF');
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setSubmitting(true);
    setSubmitError(null);

    let data: Record<string, unknown>;
    let effectiveFormat = format;

    if (isPdfTemplate) {
      // Validate required placeholders are filled (or have defaults).
      const missing = (placeholders.data ?? []).filter(
        (p) => p.required && !placeholderValues[p.name]?.trim() && !p.defaultValue,
      );
      if (missing.length > 0) {
        setSubmitError(`Fill required placeholders: ${missing.map((p) => p.name).join(', ')}`);
        setSubmitting(false);
        return;
      }
      data = { ...placeholderValues };
      // Only PDF-source uploads are locked to PDF — DOCX uploads honor the
      // user's pick so Word in → Word out is the default outcome.
      if (isPdfOnlyTemplate) effectiveFormat = 'PDF';
    } else {
      try {
        data = JSON.parse(dataJson || '{}');
      } catch {
        setSubmitError('Data must be valid JSON');
        setSubmitting(false);
        return;
      }
    }

    try {
      const created = await apiFetch<{ id: string }>('/api/documents', {
        method: 'POST',
        token: session.token,
        body: { templateId, name, format: effectiveFormat, data },
      });
      router.push(`/documents/${created.id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to create document');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create a document from a template, then generate, send for signature and download.
        </p>
      </div>

      <Card>
        <h2 className="text-lg font-semibold">New document</h2>
        {templates.data && templates.data.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            You need a template first.{' '}
            <Link href="/templates" className="font-medium underline">
              Create one
            </Link>
            .
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="d-template">Template</Label>
                <select
                  id="d-template"
                  required
                  value={templateId}
                  onChange={(e) => onTemplateChange(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
                >
                  <option value="">Select…</option>
                  {(templates.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.templateMode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="d-name">Name</Label>
                <Input
                  id="d-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              {!isPdfOnlyTemplate && (
                <div>
                  <Label htmlFor="d-format">Output format</Label>
                  <select
                    id="d-format"
                    value={format}
                    onChange={(e) => setFormat(e.target.value as typeof format)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
                  >
                    <option value="PDF">PDF</option>
                    <option value="DOCX">DOCX</option>
                    {!isPdfTemplate && <option value="RTF">RTF</option>}
                  </select>
                </div>
              )}
              {isPdfOnlyTemplate && (
                <div>
                  <Label>Output format</Label>
                  <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    PDF (source is a PDF)
                  </p>
                </div>
              )}
            </div>

            {isPdfTemplate ? (
              <PlaceholderInputs
                placeholders={placeholders.data}
                values={placeholderValues}
                onChange={setPlaceholderValues}
                error={placeholders.error}
              />
            ) : (
              <div>
                <Label htmlFor="d-data">Variable data (JSON)</Label>
                <Textarea
                  id="d-data"
                  rows={5}
                  value={dataJson}
                  onChange={(e) => setDataJson(e.target.value)}
                />
              </div>
            )}

            <ErrorBanner message={submitError} />
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create document'}
            </Button>
          </form>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Your documents</h2>
        <ErrorBanner message={docs.error} />
        {docs.data && docs.data.length > 0 ? (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Name</th>
                <th>Format</th>
                <th>Status</th>
                <th>Generated?</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {docs.data.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="py-2 font-medium">
                    <Link href={`/documents/${d.id}`} className="hover:underline">
                      {d.name}
                    </Link>
                  </td>
                  <td className="text-slate-600">{d.format}</td>
                  <td>
                    <StatusPill status={d.status} />
                  </td>
                  <td className="text-slate-600">
                    {d.signedFileKey ? 'Signed' : d.fileKey ? 'Yes' : 'No'}
                  </td>
                  <td className="text-slate-600">
                    {new Date(d.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No documents yet.</p>
        )}
      </Card>
    </div>
  );
}

function PlaceholderInputs({
  placeholders,
  values,
  onChange,
  error,
}: {
  placeholders: Placeholder[] | null;
  values: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  error: string | null;
}) {
  if (error) return <ErrorBanner message={error} />;
  if (!placeholders) return <p className="text-sm text-slate-500">Loading placeholders…</p>;
  if (placeholders.length === 0) {
    return (
      <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        This template has no placeholders yet —{' '}
        <Link href="/templates" className="font-medium underline">
          add some
        </Link>{' '}
        before creating a document, or proceed with an empty fill.
      </p>
    );
  }

  return (
    <div>
      <Label>Placeholder values</Label>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {placeholders.map((p) => {
          const inputType =
            p.type === 'DATE' ? 'date' : p.type === 'NUMBER' ? 'number' : 'text';
          return (
            <div key={p.id}>
              <Label htmlFor={`ph-${p.id}`}>
                {p.name}
                {p.required && <span className="text-red-600"> *</span>}
              </Label>
              <Input
                id={`ph-${p.id}`}
                type={inputType}
                placeholder={p.defaultValue ?? ''}
                value={values[p.name] ?? ''}
                onChange={(e) => onChange({ ...values, [p.name]: e.target.value })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
