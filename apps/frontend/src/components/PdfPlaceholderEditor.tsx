'use client';

import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { ApiError, apiFetch, apiUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pdfjsLib, type PDFDocumentProxy } from '@/lib/pdfjs';
import { Button, ErrorBanner, Input, Label } from '@/components/ui';
import { FieldBox, type BoxRect, type FieldShape } from '@/components/FieldBox';
import { PdfPage, type PageSize } from '@/components/PdfPage';

const PLACEHOLDER_TYPES = ['TEXT', 'DATE', 'NUMBER'] as const;
type PlaceholderType = (typeof PLACEHOLDER_TYPES)[number];

const DRAG_MIME = 'application/x-placeholder-type';
const DEFAULT_W = 25;
const DEFAULT_H = 6;

const LIBRARY: Array<{ type: PlaceholderType; label: string; desc: string }> = [
  { type: 'TEXT', label: 'Text', desc: 'Single-line text' },
  { type: 'DATE', label: 'Date', desc: 'Date value' },
  { type: 'NUMBER', label: 'Number', desc: 'Numeric value' },
];

export interface Placeholder {
  id: string;
  name: string;
  type: PlaceholderType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  defaultValue: string | null;
}

interface Props {
  templateId: string;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export default function PdfPlaceholderEditor({ templateId }: Props) {
  const { session } = useAuth();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageSizes, setPageSizes] = useState<Record<number, PageSize>>({});
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Counts every in-flight save so concurrent drag/PATCH calls don't flicker.
  const [inflight, setInflight] = useState(0);

  const tracked = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setInflight((c) => c + 1);
    try {
      return await fn();
    } finally {
      setInflight((c) => Math.max(0, c - 1));
    }
  }, []);

  // Load source PDF
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoadError(null);
    setPdf(null);
    (async () => {
      try {
        const res = await fetch(apiUrl(`/api/templates/${templateId}/file`), {
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
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load PDF');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId, session?.token]);

  // Load placeholders
  const loadPlaceholders = useCallback(async () => {
    if (!session) return;
    try {
      const list = await apiFetch<Placeholder[]>(
        `/api/templates/${templateId}/placeholders`,
        { token: session.token },
      );
      setPlaceholders(list);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to load placeholders');
    }
  }, [templateId, session?.token]);

  useEffect(() => {
    loadPlaceholders();
  }, [loadPlaceholders]);

  const setPageSize = useCallback(
    (pageNum: number) => (size: PageSize) =>
      setPageSizes((prev) =>
        prev[pageNum]?.width === size.width && prev[pageNum]?.height === size.height
          ? prev
          : { ...prev, [pageNum]: size },
      ),
    [],
  );

  // ---- placeholder mutations ----

  const createPlaceholder = async (
    name: string,
    type: PlaceholderType,
    page: number,
    rect: BoxRect,
  ) => {
    if (!session) return;
    setBusy(true);
    setActionError(null);
    try {
      const created = await tracked(() =>
        apiFetch<Placeholder>(`/api/templates/${templateId}/placeholders`, {
          method: 'POST',
          token: session.token,
          body: { name, type, page, ...rect, required: true },
        }),
      );
      setPlaceholders((prev) => [...prev, created]);
      setSelectedId(created.id);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to add placeholder');
    } finally {
      setBusy(false);
    }
  };

  const onLiveChange = (id: string, rect: BoxRect) => {
    setPlaceholders((prev) => prev.map((p) => (p.id === id ? { ...p, ...rect } : p)));
  };

  const onCommit = async (id: string, rect: BoxRect) => {
    if (!session) return;
    try {
      await tracked(() =>
        apiFetch(`/api/templates/${templateId}/placeholders/${id}`, {
          method: 'PATCH',
          token: session.token,
          body: rect,
        }),
      );
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to save position');
      loadPlaceholders();
    }
  };

  const onUpdate = async (id: string, patch: Partial<Placeholder>) => {
    if (!session) return;
    try {
      await tracked(() =>
        apiFetch(`/api/templates/${templateId}/placeholders/${id}`, {
          method: 'PATCH',
          token: session.token,
          body: patch,
        }),
      );
      setActionError(null);
      loadPlaceholders();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to update');
    }
  };

  const onDelete = async (id: string) => {
    if (!session) return;
    try {
      await tracked(() =>
        apiFetch(`/api/templates/${templateId}/placeholders/${id}`, {
          method: 'DELETE',
          token: session.token,
        }),
      );
      setActionError(null);
      setSelectedId(null);
      loadPlaceholders();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to delete');
    }
  };

  // ---- drop handler ----

  const onDropOnPage = (pageNum: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const type = e.dataTransfer.getData(DRAG_MIME) as PlaceholderType | '';
    if (!type) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Centre the box on the cursor, clamped to the page bounds.
    const cursorXPct = ((e.clientX - rect.left) / rect.width) * 100;
    const cursorYPct = ((e.clientY - rect.top) / rect.height) * 100;
    const x = clamp(cursorXPct - DEFAULT_W / 2, 0, 100 - DEFAULT_W);
    const y = clamp(cursorYPct - DEFAULT_H / 2, 0, 100 - DEFAULT_H);

    const sameTypeCount = placeholders.filter((p) => p.type === type).length;
    const autoName = `${type.toLowerCase()}_${sameTypeCount + 1}`;

    createPlaceholder(autoName, type, pageNum, { x, y, width: DEFAULT_W, height: DEFAULT_H });
  };

  if (loadError) return <ErrorBanner message={loadError} />;
  if (!pdf) return <p className="text-sm text-slate-500">Loading PDF…</p>;

  const numPages = pdf.numPages;
  const selected = placeholders.find((p) => p.id === selectedId) ?? null;
  const status: SaveState =
    inflight > 0 ? 'saving' : actionError ? 'error' : 'saved';

  return (
    <div className="space-y-4">
      <EditorHeader count={placeholders.length} status={status} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,320px]">
        <div className="space-y-4">
          <ErrorBanner message={actionError} />
        <div className="space-y-6" onPointerDown={() => setSelectedId(null)}>
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
            const onPage = placeholders.filter((p) => p.page === pageNum);
            const size = pageSizes[pageNum];
            return (
              <div key={pageNum}>
                <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                  Page {pageNum} of {numPages}
                </div>
                <PdfPage
                  pdf={pdf}
                  pageNumber={pageNum}
                  onSize={setPageSize(pageNum)}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes(DRAG_MIME)) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                    }
                  }}
                  onDrop={onDropOnPage(pageNum)}
                >
                  {size &&
                    onPage.map((p) => (
                      <FieldBox
                        key={p.id}
                        field={
                          {
                            id: p.id,
                            signerId: '',
                            type: p.name,
                            x: p.x,
                            y: p.y,
                            width: p.width,
                            height: p.height,
                          } as FieldShape
                        }
                        pageSize={size}
                        selected={selectedId === p.id}
                        editable={true}
                        signerName={p.type}
                        onSelect={() => setSelectedId(p.id)}
                        onChange={(rect) => onLiveChange(p.id, rect)}
                        onCommit={(rect) => onCommit(p.id, rect)}
                      />
                    ))}
                </PdfPage>
              </div>
            );
          })}
        </div>
      </div>

        <div className="space-y-4">
          <FieldLibrary />
          <PlaceholderDetails
            selected={selected}
            numPages={numPages}
            busy={busy}
            onUpdate={(patch) => selected && onUpdate(selected.id, patch)}
            onDelete={() => selected && onDelete(selected.id)}
          />
        </div>
      </div>
    </div>
  );
}

type SaveState = 'saved' | 'saving' | 'error';

function EditorHeader({ count, status }: { count: number; status: SaveState }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 shadow-sm">
      <div className="text-sm text-slate-700">
        <span className="font-semibold">{count}</span>{' '}
        {count === 1 ? 'placeholder' : 'placeholders'}
      </div>
      <SaveStatusPill status={status} />
    </div>
  );
}

function SaveStatusPill({ status }: { status: SaveState }) {
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
        Saving…
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-800">
        <span className="h-2 w-2 rounded-full bg-red-600" />
        Save failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-800">
      <span className="h-2 w-2 rounded-full bg-green-500" />
      All changes saved
    </span>
  );
}

function FieldLibrary() {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Field library
      </h3>
      <p className="mt-2 text-xs text-slate-500">
        Drag a field onto any page to place it where the cursor lands.
      </p>
      <ul className="mt-3 space-y-2">
        {LIBRARY.map((item) => (
          <li
            key={item.type}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_MIME, item.type);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            className="flex cursor-grab select-none items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm shadow-sm hover:border-slate-400 hover:bg-slate-100 active:cursor-grabbing"
          >
            <div>
              <div className="font-medium text-slate-900">{item.label}</div>
              <div className="text-xs text-slate-500">{item.desc}</div>
            </div>
            <span className="text-lg leading-none text-slate-400">⠿</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlaceholderDetails({
  selected,
  numPages,
  busy,
  onUpdate,
  onDelete,
}: {
  selected: Placeholder | null;
  numPages: number;
  busy: boolean;
  onUpdate: (patch: Partial<Placeholder>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Placeholder details
      </h3>
      {!selected ? (
        <p className="mt-3 text-sm text-slate-500">
          Click a placeholder on the page (or drop a new one from the library above) to edit
          its name, type and default value.
        </p>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <Label htmlFor="sb-ph-name">Name</Label>
            <Input
              id="sb-ph-name"
              key={`${selected.id}-name`}
              defaultValue={selected.name}
              onBlur={(e) =>
                e.target.value !== selected.name && onUpdate({ name: e.target.value })
              }
            />
          </div>
          <div>
            <Label htmlFor="sb-ph-type">Type</Label>
            <select
              id="sb-ph-type"
              value={selected.type}
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
            <Label htmlFor="sb-ph-page">Page</Label>
            <select
              id="sb-ph-page"
              value={selected.page}
              onChange={(e) => onUpdate({ page: Number(e.target.value) })}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
            >
              {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="sb-ph-required">Required</Label>
            <select
              id="sb-ph-required"
              value={selected.required ? '1' : '0'}
              onChange={(e) => onUpdate({ required: e.target.value === '1' })}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
            >
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </div>
          <div>
            <Label htmlFor="sb-ph-default">Default value (optional)</Label>
            <Input
              id="sb-ph-default"
              key={`${selected.id}-default`}
              defaultValue={selected.defaultValue ?? ''}
              onBlur={(e) =>
                e.target.value !== (selected.defaultValue ?? '') &&
                onUpdate({ defaultValue: e.target.value || undefined })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-slate-500">
            <Coord label="x" value={selected.x} />
            <Coord label="y" value={selected.y} />
            <Coord label="w" value={selected.width} />
            <Coord label="h" value={selected.height} />
          </div>

          <Button variant="danger" onClick={onDelete} className="w-full" disabled={busy}>
            Delete placeholder
          </Button>
        </div>
      )}
    </div>
  );
}

function Coord({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between rounded bg-slate-50 px-2 py-1">
      <span>{label}</span>
      <span className="font-mono">{value.toFixed(1)}%</span>
    </div>
  );
}
