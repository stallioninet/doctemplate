'use client';

import dynamic from 'next/dynamic';
import { use } from 'react';
import { useApi } from '@/lib/useApi';
import { Card, ErrorBanner, StatusPill } from '@/components/ui';

const PdfPlaceholderEditor = dynamic(
  () => import('@/components/PdfPlaceholderEditor'),
  { ssr: false, loading: () => <p className="text-sm text-slate-500">Loading editor…</p> },
);

// pdfjs-dist requires browser globals (canvas, Worker) so this view must
// stay client-only — same reason PdfPlaceholderEditor is dynamically imported.
const DocxBookmarkView = dynamic(() => import('@/components/DocxBookmarkView'), {
  ssr: false,
  loading: () => <p className="text-sm text-slate-500">Loading preview…</p>,
});

interface TemplateDetail {
  id: string;
  name: string;
  description: string | null;
  templateMode: 'HTML' | 'PDF';
  sourceFormat: 'PDF' | 'DOCX' | 'RTF' | null;
  htmlContent: string;
  variables: string[];
  sourceFileMimeType: string | null;
  createdAt: string;
}

export default function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error } = useApi<TemplateDetail>(`/api/templates/${id}`);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
          <StatusPill status={data.templateMode} />
        </div>
        {data.description && <p className="mt-1 text-sm text-slate-600">{data.description}</p>}
        <p className="mt-1 text-xs text-slate-500">
          Template id <span className="font-mono">{data.id}</span>
          {data.sourceFileMimeType && <> · uploaded as {data.sourceFileMimeType}</>}
        </p>
      </div>

      {data.templateMode === 'PDF' ? (
        // DOCX uploads use Word bookmarks (auto-detected at upload) instead
        // of visually-placed rectangles — bookmarks survive into the .docx
        // output verbatim, while rectangles only make sense for PDF stamping.
        data.sourceFormat === 'DOCX' ? (
          <DocxBookmarkView templateId={data.id} />
        ) : (
          <PdfPlaceholderEditor templateId={data.id} />
        )
      ) : (
        <HtmlTemplateView template={data} />
      )}
    </div>
  );
}

function HtmlTemplateView({ template }: { template: TemplateDetail }) {
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-semibold">Variables</h2>
        {template.variables.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {template.variables.map((v) => (
              <li
                key={v}
                className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs text-slate-700"
              >
                {`{{${v}}}`}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            No <code>{'{{variable}}'}</code> placeholders detected.
          </p>
        )}
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">HTML</h2>
        <pre className="mt-3 max-h-[480px] overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
          {template.htmlContent}
        </pre>
      </Card>
    </div>
  );
}
