'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError, apiFetch, apiUrl } from '@/lib/api';
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

interface Template {
  id: string;
  name: string;
  description: string | null;
  templateMode: 'HTML' | 'PDF';
  createdAt: string;
}

export default function TemplatesPage() {
  const { session } = useAuth();
  const { data: templates, error, reload } = useApi<Template[]>('/api/templates');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
        <p className="mt-1 text-sm text-slate-500">
          HTML templates use <code>{'{{variable}}'}</code> placeholders. PDF / Word uploads use a
          visual placeholder editor — drop boxes anywhere on the page and they get filled at
          generation time.
        </p>
      </div>

      <UploadTemplateCard onCreated={reload} />
      <CreateHtmlTemplateCard onCreated={reload} />

      <Card>
        <h2 className="text-lg font-semibold">Your templates</h2>
        <ErrorBanner message={error} />
        {templates && templates.length > 0 ? (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Name</th>
                <th>Mode</th>
                <th>Description</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="py-2 font-medium">
                    <Link href={`/templates/${t.id}`} className="hover:underline">
                      {t.name}
                    </Link>
                  </td>
                  <td>
                    <StatusPill status={t.templateMode} />
                  </td>
                  <td className="text-slate-600">{t.description ?? '—'}</td>
                  <td className="text-slate-600">
                    {new Date(t.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No templates yet.</p>
        )}
      </Card>
    </div>
  );
}

function UploadTemplateCard({ onCreated }: { onCreated: () => void }) {
  const { session } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Pick a PDF or Word document to upload');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('name', name);
      if (description) fd.set('description', description);
      const res = await fetch(apiUrl('/api/templates/upload'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(
          res.status,
          body?.error?.code ?? 'UPLOAD_FAILED',
          body?.error?.message ?? res.statusText,
        );
      }
      setName('');
      setDescription('');
      if (fileRef.current) fileRef.current.value = '';
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-semibold">Upload PDF or Word document</h2>
      <p className="mt-1 text-xs text-slate-500">
        Word documents are converted to PDF on upload. Then drop placeholder boxes on the
        rendered pages — values get stamped at generation time.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="u-name">Name</Label>
            <Input
              id="u-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="u-desc">Description (optional)</Label>
            <Input
              id="u-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="u-file">File</Label>
          <input
            id="u-file"
            ref={fileRef}
            type="file"
            required
            accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
            className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
          />
        </div>
        <ErrorBanner message={error} />
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Uploading…' : 'Upload template'}
        </Button>
      </form>
    </Card>
  );
}

function CreateHtmlTemplateCard({ onCreated }: { onCreated: () => void }) {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [htmlContent, setHtmlContent] = useState(
    '<h1>Hello {{name}}</h1>\n<p>Welcome to {{company}}.</p>',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/api/templates', {
        method: 'POST',
        token: session.token,
        body: { name, description: description || undefined, htmlContent },
      });
      setName('');
      setDescription('');
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create template');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-semibold">Or paste raw HTML</h2>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="t-name">Name</Label>
            <Input id="t-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="t-desc">Description (optional)</Label>
            <Input
              id="t-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="t-html">HTML</Label>
          <Textarea
            id="t-html"
            required
            rows={10}
            value={htmlContent}
            onChange={(e) => setHtmlContent(e.target.value)}
          />
        </div>
        <ErrorBanner message={error} />
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create template'}
        </Button>
      </form>
    </Card>
  );
}
