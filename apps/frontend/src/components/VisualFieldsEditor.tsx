'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch, apiUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pdfjsLib, type PDFDocumentProxy } from '@/lib/pdfjs';
import { Button, ErrorBanner, Input, Label } from '@/components/ui';
import { FieldBox, type BoxRect, type FieldShape } from './FieldBox';
import { PdfPage, type PageSize } from './PdfPage';

const FIELD_TYPES = ['SIGNATURE', 'INITIAL', 'DATE', 'TEXT', 'CHECKBOX'] as const;
type FieldType = (typeof FIELD_TYPES)[number];

export interface DocumentField {
  id: string;
  signerId: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
}

export interface SignerLite {
  id: string;
  name: string;
  email: string;
}

interface Props {
  documentId: string;
  pdfDownloadPath: string;
  signers: SignerLite[];
  fields: DocumentField[];
  editable: boolean;
  reload: () => void;
}

export default function VisualFieldsEditor({
  documentId,
  pdfDownloadPath,
  signers,
  fields,
  editable,
  reload,
}: Props) {
  const { session } = useAuth();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageSizes, setPageSizes] = useState<Record<number, PageSize>>({});
  const [localFields, setLocalFields] = useState<DocumentField[]>(fields);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLocalFields(fields);
  }, [fields]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoadError(null);
    setPdf(null);
    (async () => {
      try {
        const res = await fetch(apiUrl(pdfDownloadPath), {
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
  }, [pdfDownloadPath, session?.token]);

  const setPageSize = useCallback(
    (pageNum: number) => (size: PageSize) =>
      setPageSizes((prev) =>
        prev[pageNum]?.width === size.width && prev[pageNum]?.height === size.height
          ? prev
          : { ...prev, [pageNum]: size },
      ),
    [],
  );

  const onLiveChange = (id: string, rect: BoxRect) => {
    setLocalFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...rect } : f)));
  };

  const onCommit = async (id: string, rect: BoxRect) => {
    if (!session) return;
    try {
      await apiFetch(`/api/documents/${documentId}/fields/${id}`, {
        method: 'PATCH',
        token: session.token,
        body: rect,
      });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to save field position');
      reload();
    }
  };

  const onAdd = async (signerId: string, type: FieldType, page: number) => {
    if (!session) return;
    setBusy(true);
    setActionError(null);
    try {
      const created = await apiFetch<DocumentField>(
        `/api/documents/${documentId}/fields`,
        {
          method: 'POST',
          token: session.token,
          body: {
            signerId,
            type,
            page,
            x: 40,
            y: 40,
            width: 25,
            height: 6,
            required: true,
          },
        },
      );
      setSelectedId(created.id);
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to add field');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!session) return;
    try {
      await apiFetch(`/api/documents/${documentId}/fields/${id}`, {
        method: 'DELETE',
        token: session.token,
      });
      setSelectedId(null);
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to delete');
    }
  };

  const onUpdateField = async (id: string, patch: Partial<DocumentField>) => {
    if (!session) return;
    try {
      await apiFetch(`/api/documents/${documentId}/fields/${id}`, {
        method: 'PATCH',
        token: session.token,
        body: patch,
      });
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to update');
    }
  };

  if (loadError) return <ErrorBanner message={loadError} />;
  if (!pdf) return <p className="text-sm text-slate-500">Loading PDF…</p>;

  const numPages = pdf.numPages;
  const selected = localFields.find((f) => f.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,320px]">
      <div className="space-y-4">
        <Toolbar
          signers={signers}
          editable={editable}
          numPages={numPages}
          onAdd={onAdd}
          busy={busy}
        />
        <ErrorBanner message={actionError} />
        <div
          className="space-y-6"
          onPointerDown={() => setSelectedId(null)}
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
            const onPage = localFields.filter((f) => f.page === pageNum);
            const size = pageSizes[pageNum];
            return (
              <div key={pageNum}>
                <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                  Page {pageNum} of {numPages}
                </div>
                <PdfPage pdf={pdf} pageNumber={pageNum} onSize={setPageSize(pageNum)}>
                  {size &&
                    onPage.map((f) => (
                      <FieldBox
                        key={f.id}
                        field={f as FieldShape}
                        pageSize={size}
                        selected={selectedId === f.id}
                        editable={editable}
                        signerName={signers.find((s) => s.id === f.signerId)?.name ?? f.signerId}
                        onSelect={() => setSelectedId(f.id)}
                        onChange={(rect) => onLiveChange(f.id, rect)}
                        onCommit={(rect) => onCommit(f.id, rect)}
                      />
                    ))}
                </PdfPage>
              </div>
            );
          })}
        </div>
      </div>
      <Sidebar
        selected={selected}
        signers={signers}
        editable={editable}
        numPages={numPages}
        onUpdate={(patch) => selected && onUpdateField(selected.id, patch)}
        onDelete={() => selected && onDelete(selected.id)}
      />
    </div>
  );
}

function Toolbar({
  signers,
  editable,
  numPages,
  onAdd,
  busy,
}: {
  signers: SignerLite[];
  editable: boolean;
  numPages: number;
  onAdd: (signerId: string, type: FieldType, page: number) => void;
  busy: boolean;
}) {
  const [signerId, setSignerId] = useState(signers[0]?.id ?? '');
  const [type, setType] = useState<FieldType>('SIGNATURE');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!signerId && signers[0]) setSignerId(signers[0].id);
  }, [signers, signerId]);

  if (!editable) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-500 shadow-sm">
        Document is locked from editing — drag, resize and add are disabled.
      </div>
    );
  }

  if (signers.length === 0) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 shadow-sm">
        Add at least one signer above before placing fields.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div>
        <Label htmlFor="vt-signer">Signer</Label>
        <select
          id="vt-signer"
          value={signerId}
          onChange={(e) => setSignerId(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
        >
          {signers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="vt-type">Type</Label>
        <select
          id="vt-type"
          value={type}
          onChange={(e) => setType(e.target.value as FieldType)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="vt-page">Page</Label>
        <select
          id="vt-page"
          value={page}
          onChange={(e) => setPage(Number(e.target.value))}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <Button onClick={() => signerId && onAdd(signerId, type, page)} disabled={busy || !signerId}>
        + Add field
      </Button>
      <p className="ml-auto max-w-xs text-xs text-slate-500">
        New fields appear at the centre of the chosen page. Drag to position, drag the corner
        to resize.
      </p>
    </div>
  );
}

function Sidebar({
  selected,
  signers,
  editable,
  numPages,
  onUpdate,
  onDelete,
}: {
  selected: DocumentField | null;
  signers: SignerLite[];
  editable: boolean;
  numPages: number;
  onUpdate: (patch: Partial<DocumentField>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Field details
      </h3>
      {!selected ? (
        <p className="mt-3 text-sm text-slate-500">
          Click a field on the page to edit its signer, type or page.
        </p>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <div className="font-mono text-xs text-slate-500">{selected.id}</div>

          <div>
            <Label htmlFor="sb-signer">Signer</Label>
            <select
              id="sb-signer"
              disabled={!editable}
              value={selected.signerId}
              onChange={(e) => onUpdate({ signerId: e.target.value })}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
            >
              {signers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="sb-type">Type</Label>
            <select
              id="sb-type"
              disabled={!editable}
              value={selected.type}
              onChange={(e) => onUpdate({ type: e.target.value as FieldType })}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="sb-page">Page</Label>
            <select
              id="sb-page"
              disabled={!editable}
              value={selected.page}
              onChange={(e) => onUpdate({ page: Number(e.target.value) })}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
            >
              {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="sb-required">Required</Label>
            <select
              id="sb-required"
              disabled={!editable}
              value={selected.required ? '1' : '0'}
              onChange={(e) => onUpdate({ required: e.target.value === '1' })}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
            >
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-slate-500">
            <Coord label="x" value={selected.x} />
            <Coord label="y" value={selected.y} />
            <Coord label="w" value={selected.width} />
            <Coord label="h" value={selected.height} />
          </div>

          {editable && (
            <Button variant="danger" onClick={onDelete} className="w-full">
              Delete field
            </Button>
          )}
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
