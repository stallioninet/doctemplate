'use client';

import Link from 'next/link';
import { Card } from '@/components/ui';
import { useApi } from '@/lib/useApi';

interface Template {
  id: string;
  name: string;
}
interface Document {
  id: string;
  name: string;
  status: string;
}
interface ApiKey {
  id: string;
  revokedAt: string | null;
}

export default function DashboardPage() {
  const templates = useApi<Template[]>('/api/templates');
  const documents = useApi<Document[]>('/api/documents');
  const apiKeys = useApi<ApiKey[]>('/api/api-keys');

  const stats = [
    { label: 'Templates', value: templates.data?.length ?? '—', href: '/templates' },
    { label: 'Documents', value: documents.data?.length ?? '—', href: '/documents' },
    {
      label: 'Active API keys',
      value: apiKeys.data?.filter((k) => !k.revokedAt).length ?? '—',
      href: '/api-keys',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Overview of your organization&rsquo;s document automation activity.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="transition hover:border-slate-400">
              <div className="text-sm text-slate-500">{stat.label}</div>
              <div className="mt-2 text-3xl font-semibold">{stat.value}</div>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <h2 className="text-lg font-semibold">Recent documents</h2>
        {documents.data && documents.data.length > 0 ? (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {documents.data.slice(0, 5).map((doc) => (
              <li key={doc.id} className="flex items-center justify-between py-2">
                <Link href={`/documents/${doc.id}`} className="text-slate-900 hover:underline">
                  {doc.name}
                </Link>
                <span className="text-xs uppercase tracking-wide text-slate-500">
                  {doc.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No documents yet.</p>
        )}
      </Card>
    </div>
  );
}
