'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch, apiUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pdfjsLib, type PDFDocumentProxy } from '@/lib/pdfjs';
import { Card, ErrorBanner } from '@/components/ui';
import { PdfPage } from '@/components/PdfPage';
import {
  AddPlaceholderForm,
  BookmarkRow,
  type BookmarkPlaceholder,
} from '@/components/DocxBookmarkControls';

interface Props {
  templateId: string;
}

export default function DocxBookmarkView({ templateId }: Props) {
  const { session } = useAuth();
  const [items, setItems] = useState<BookmarkPlaceholder[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  // Bumped on every successful replace-text so the PDF re-fetch effect re-runs.
  const [pdfVersion, setPdfVersion] = useState(0);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const list = await apiFetch<BookmarkPlaceholder[]>(
        `/api/templates/${templateId}/placeholders`,
        { token: session.token },
      );
      setItems(list.filter((p) => p.kind === 'BOOKMARK'));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load bookmarks');
    }
  }, [templateId, session?.token]);

  useEffect(() => {
    load();
  }, [load]);

  // Render the PDF facsimile of the uploaded .docx so the user can see what
  // they uploaded. The actual fill happens by Word bookmark name, not by
  // position, but the preview still helps verify the right doc is in place.
  // pdfVersion is in the dep list so a successful text-replace re-runs the
  // fetch (cache-busted via ?v=).
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setPdfError(null);
    setPdf(null);
    (async () => {
      try {
        const url = apiUrl(`/api/templates/${templateId}/file`) + `?v=${pdfVersion}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (!res.ok) throw new Error(`PDF fetch failed (${res.status})`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const loaded = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        if (cancelled) {
          loaded.destroy();
          return;
        }
        setPdf(loaded);
      } catch (err) {
        if (!cancelled) setPdfError(err instanceof Error ? err.message : 'Failed to load preview');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId, session?.token, pdfVersion]);

  const onTextReplaced = useCallback(() => {
    // After a successful text-replace, refresh the placeholder list and
    // re-fetch the regenerated PDF facsimile so the preview matches.
    setPdfVersion((v) => v + 1);
    load();
  }, [load]);

  const onUpdate = async (id: string, patch: Partial<BookmarkPlaceholder>) => {
    if (!session) return;
    try {
      await apiFetch(`/api/templates/${templateId}/placeholders/${id}`, {
        method: 'PATCH',
        token: session.token,
        body: patch,
      });
      setActionError(null);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to update');
    }
  };

  if (loadError) return <ErrorBanner message={loadError} />;
  if (!items) return <p className="text-sm text-slate-500">Loading bookmarks…</p>;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,420px]">
      <Card>
        <h2 className="text-lg font-semibold">Document preview</h2>
        <p className="mt-1 text-xs text-slate-500">
          Rendered from the PDF facsimile of your uploaded <code>.docx</code>. Word output keeps
          the original Word layout — this preview is just for visual reference.
        </p>
        {pdfError && <ErrorBanner message={pdfError} />}
        {!pdf && !pdfError && (
          <p className="mt-3 text-sm text-slate-500">Loading preview…</p>
        )}
        {pdf && (
          <div className="mt-3 max-h-[80vh] space-y-4 overflow-auto rounded border border-slate-200 bg-slate-100 p-3">
            {Array.from({ length: pdf.numPages }, (_, i) => i + 1).map((n) => (
              <div key={n}>
                <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                  Page {n} of {pdf.numPages}
                </div>
                <PdfPage pdf={pdf} pageNumber={n} scale={1.2} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Placeholders</h2>
        <p className="mt-1 text-sm text-slate-600">
          Auto-detected from your uploaded <code>.docx</code>. Edit type / required /
          default below — the name is fixed by what&apos;s in the document.
        </p>
        <ErrorBanner message={actionError} />

        <AddPlaceholderForm templateId={templateId} onSuccess={onTextReplaced} />

        {items.length === 0 ? (
          <div className="mt-4 space-y-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <p className="font-medium">No placeholders detected.</p>
            <p>To add placeholders, edit the <code>.docx</code> in Word and re-upload. Two formats are supported:</p>
            <ol className="ml-5 list-decimal space-y-2">
              <li>
                <span className="font-medium">Inline tags</span> — type{' '}
                <code className="rounded bg-white px-1 py-0.5">{`{{name}}`}</code> directly
                where you want the value to appear. Example: replace{' '}
                <code className="rounded bg-white px-1 py-0.5">[NAME OF DEPONENT]</code>{' '}
                with{' '}
                <code className="rounded bg-white px-1 py-0.5">{`{{deponent_name}}`}</code>.
                Easiest if you can edit the doc directly.
              </li>
              <li>
                <span className="font-medium">Word bookmarks</span> — select the text to
                replace, then <em>Insert → Bookmark</em>, give it a name (no spaces,
                start with a letter), <em>Add</em>. The bookmark&apos;s contents get
                swapped at generation. Better when you want to keep the existing visible
                text as a default.
              </li>
            </ol>
            <p className="text-xs text-amber-800">
              Names beginning with <code>_</code> are reserved by Word and skipped.
              Re-uploading replaces the old <code>.docx</code> for this template.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {items.map((p) => (
              <BookmarkRow key={p.id} item={p} onUpdate={(patch) => onUpdate(p.id, patch)} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
