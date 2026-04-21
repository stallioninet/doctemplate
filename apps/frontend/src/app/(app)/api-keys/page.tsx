'use client';

import { useState, type FormEvent } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { Button, Card, ErrorBanner, Input, Label, StatusPill } from '@/components/ui';

interface ApiKeyListItem {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface ApiKeyCreated {
  id: string;
  name: string;
  prefix: string;
  key: string;
  createdAt: string;
}

export default function ApiKeysPage() {
  const { session } = useAuth();
  const { data: keys, error, reload } = useApi<ApiKeyListItem[]>('/api/api-keys');

  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<ApiKeyCreated | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await apiFetch<ApiKeyCreated>('/api/api-keys', {
        method: 'POST',
        token: session.token,
        body: { name },
      });
      setJustCreated(created);
      setName('');
      reload();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to create key');
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (id: string) => {
    if (!session) return;
    if (!confirm('Revoke this API key? Integrations using it will stop working.')) return;
    try {
      await apiFetch(`/api/api-keys/${id}`, { method: 'DELETE', token: session.token });
      reload();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to revoke');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>
        <p className="mt-1 text-sm text-slate-500">
          Used by machine integrations (e.g. Drupal) via the <code>X-Api-Key</code> header.
        </p>
      </div>

      <Card>
        <h2 className="text-lg font-semibold">Issue a new key</h2>
        <form onSubmit={create} className="mt-4 flex items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="k-name">Key name</Label>
            <Input
              id="k-name"
              required
              placeholder="drupal-prod"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </Button>
        </form>
        <ErrorBanner message={submitError} />

        {justCreated && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
            <p className="font-medium text-amber-900">Save this key — it won&rsquo;t be shown again.</p>
            <code className="mt-2 block break-all rounded bg-white px-3 py-2 text-xs">
              {justCreated.key}
            </code>
            <button
              type="button"
              onClick={() => setJustCreated(null)}
              className="mt-2 text-xs text-amber-700 underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Your keys</h2>
        <ErrorBanner message={error} />
        {keys && keys.length > 0 ? (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Name</th>
                <th>Prefix</th>
                <th>Last used</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-t border-slate-100">
                  <td className="py-2 font-medium">{k.name}</td>
                  <td className="font-mono text-xs">{k.prefix}…</td>
                  <td className="text-slate-600">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : '—'}
                  </td>
                  <td>
                    <StatusPill status={k.revokedAt ? 'VOIDED' : 'COMPLETED'} />
                  </td>
                  <td className="text-right">
                    {!k.revokedAt && (
                      <button
                        type="button"
                        onClick={() => revoke(k.id)}
                        className="text-xs text-red-700 underline hover:text-red-900"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No API keys yet.</p>
        )}
      </Card>
    </div>
  );
}
