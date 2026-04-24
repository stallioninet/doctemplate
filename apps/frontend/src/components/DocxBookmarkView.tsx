'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError, apiFetch, apiUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pdfjsLib, type PDFDocumentProxy } from '@/lib/pdfjs';
import { Button, Card, ErrorBanner, Input, Label, Textarea } from '@/components/ui';
import { PdfPage } from '@/components/PdfPage';

const slugify = (s: string): string => {
  const base = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  if (!base) return '';
  return /^[a-z_]/.test(base) ? base : `field_${base}`;
};

const PLACEHOLDER_TYPES = ['TEXT', 'DATE', 'NUMBER'] as const;
type PlaceholderType = (typeof PLACEHOLDER_TYPES)[number];

interface BookmarkPlaceholder {
  id: string;
  name: string;
  type: PlaceholderType;
  kind: 'COORD' | 'BOOKMARK';
  required: boolean;
  defaultValue: string | null;
}

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



function AddPlaceholderForm({
  templateId,
  onSuccess,
}: {
  templateId: string;
  onSuccess: () => void;
}) {
  const { session } = useAuth();
  const [sourceText, setSourceText] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Auto-suggest a placeholder name from the source text — only used while
  // the user hasn't typed their own name. Lets quick "select-text → submit"
  // flows skip naming entirely if the slug is good enough.
  const suggested = useMemo(() => slugify(sourceText), [sourceText]);
  const effectiveName = name.trim() || suggested;
  const canSubmit =
    !submitting && sourceText.trim().length > 0 && effectiveName.length > 0;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const result = await apiFetch<{ matches: number; placeholderName: string }>(
        `/api/templates/${templateId}/replace-text`,
        {
          method: 'POST',
          token: session.token,
          body: { sourceText, placeholderName: effectiveName },
        },
      );
      const m = result.matches;
      setInfo(
        `Wrapped ${m} occurrence${m === 1 ? '' : 's'} as {{${result.placeholderName}}}.`,
      );
      setSourceText('');
      setName('');
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Replace failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3"
    >
      <p className="text-sm font-semibold text-slate-700">Add placeholder from text</p>
      <p className="text-xs text-slate-500">
        Type or paste an existing span (e.g. <code>[NAME OF DEPONENT]</code>) — every
        occurrence in the document gets replaced with{' '}
        <code>{`{{name}}`}</code> and registered as a placeholder.
      </p>

      <div>
        <Label htmlFor="apf-source">Source text in the document</Label>
        <Textarea
          id="apf-source"
          rows={2}
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          placeholder="[NAME OF DEPONENT]"
        />
      </div>
      <div>
        <Label htmlFor="apf-name">Placeholder name</Label>
        <Input
          id="apf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={suggested || 'deponent_name'}
        />
        {!name && suggested && (
          <p className="mt-1 text-xs text-slate-500">
            Will use suggested name <code>{suggested}</code> if left blank.
          </p>
        )}
      </div>

      {error && <ErrorBanner message={error} />}
      {info && (
        <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-900">
          {info}
        </p>
      )}

      <Button type="submit" disabled={!canSubmit}>
        {submitting ? 'Replacing…' : 'Replace and add placeholder'}
      </Button>
    </form>
  );
}

function BookmarkRow({
  item,
  onUpdate,
}: {
  item: BookmarkPlaceholder;
  onUpdate: (patch: Partial<BookmarkPlaceholder>) => void;
}) {
  const [defaultDraft, setDefaultDraft] = useState(item.defaultValue ?? '');
  useEffect(() => {
    setDefaultDraft(item.defaultValue ?? '');
  }, [item.id, item.defaultValue]);

  const dirty = defaultDraft !== (item.defaultValue ?? '');

  const flushDefault = () => {
    if (!dirty) return;
    onUpdate({ defaultValue: defaultDraft || undefined });
  };

  return (
    <div className="grid grid-cols-1 gap-3 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-[1.4fr,0.9fr,0.7fr,1.4fr]">
      <div>
        <Label>Bookmark name</Label>
        <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700">
          {item.name}
        </p>
      </div>
      <div>
        <Label htmlFor={`bk-type-${item.id}`}>Type</Label>
        <select
          id={`bk-type-${item.id}`}
          value={item.type}
          onChange={(e) => onUpdate({ type: e.target.value as PlaceholderType })}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
        >
          {PLACEHOLDER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor={`bk-req-${item.id}`}>Required</Label>
        <select
          id={`bk-req-${item.id}`}
          value={item.required ? '1' : '0'}
          onChange={(e) => onUpdate({ required: e.target.value === '1' })}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
        >
          <option value="1">Yes</option>
          <option value="0">No</option>
        </select>
      </div>
      <div>
        <Label htmlFor={`bk-def-${item.id}`}>Default value</Label>
        <div className="flex gap-2">
          <Input
            id={`bk-def-${item.id}`}
            value={defaultDraft}
            onChange={(e) => setDefaultDraft(e.target.value)}
            onBlur={flushDefault}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                flushDefault();
              }
            }}
            placeholder="(none)"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!dirty}
            onClick={flushDefault}
          >
            {dirty ? 'Save' : 'Saved'}
          </Button>
        </div>
      </div>
    </div>
  );
}
