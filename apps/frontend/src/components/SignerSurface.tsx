'use client';

import { useEffect, useState } from 'react';
import { ApiError, apiFetch, apiUrl, downloadFile } from '@/lib/api';
import { pdfjsLib, type PDFDocumentProxy } from '@/lib/pdfjs';
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Label,
  StatusPill,
  Textarea,
} from '@/components/ui';
import { PdfPage, type PageSize } from '@/components/PdfPage';
import { SignaturePad } from '@/components/SignaturePad';

type FieldType = 'SIGNATURE' | 'INITIAL' | 'DATE' | 'TEXT' | 'CHECKBOX';

interface SignerField {
  id: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  value: string | null;
  filledAt: string | null;
}

interface SigningContext {
  signer: {
    id: string;
    name: string;
    email: string;
    status: 'PENDING' | 'VIEWED' | 'SIGNED' | 'DECLINED';
    order: number;
  };
  document: {
    id: string;
    name: string;
    format: 'PDF' | 'DOCX' | 'RTF';
    status: string;
    signedReady: boolean;
  };
  fields: SignerField[];
  otherSigners: Array<{ id: string; name: string; order: number; status: string }>;
}

const cn = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ');

const FIELD_LABEL: Record<FieldType, string> = {
  SIGNATURE: 'Sign',
  INITIAL: 'Initial',
  DATE: 'Date',
  TEXT: 'Text',
  CHECKBOX: 'Check',
};

const TITLE: Record<FieldType, string> = {
  SIGNATURE: 'Add your signature',
  INITIAL: 'Add your initials',
  DATE: 'Pick a date',
  TEXT: 'Enter text',
  CHECKBOX: 'Confirm',
};

const isCheckboxTruthy = (v: string): boolean =>
  !['', '0', 'false', 'no', 'off'].includes(v.trim().toLowerCase());

export default function SignerSurface({ token }: { token: string }) {
  const [ctx, setCtx] = useState<SigningContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filling, setFilling] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const next = await apiFetch<SigningContext>(`/api/sign/${token}`);
      setCtx(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load signing context');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Poll for signed-artifact readiness after completion.
  useEffect(() => {
    if (!ctx) return;
    if (ctx.signer.status !== 'SIGNED') return;
    if (ctx.document.signedReady) return;
    const t = window.setInterval(load, 2500);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.signer.status, ctx?.document.signedReady, token]);

  const saveField = async (fieldId: string, value: string) => {
    setActionError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/sign/${token}/fields/${fieldId}`, {
        method: 'POST',
        body: { value },
      });
      setFilling(null);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    setActionError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/sign/${token}/complete`, { method: 'POST' });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to complete signing');
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    const reason = window.prompt('Optional reason for declining:');
    if (reason === null) return; // user cancelled the prompt
    setActionError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/sign/${token}/decline`, {
        method: 'POST',
        body: reason ? { reason } : {},
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to decline');
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <Card>
        <ErrorBanner message={error} />
        <p className="mt-3 text-sm text-slate-500">
          The signing link may be invalid or expired. Contact whoever sent it to you for a fresh
          link.
        </p>
      </Card>
    );
  }
  if (!ctx) return <p className="text-sm text-slate-500">Loading…</p>;

  if (ctx.signer.status === 'SIGNED') {
    return <SuccessView ctx={ctx} token={token} />;
  }
  if (ctx.signer.status === 'DECLINED') {
    return <DeclinedView ctx={ctx} />;
  }

  const fillingField = ctx.fields.find((f) => f.id === filling) ?? null;
  const filledCount = ctx.fields.filter((f) => f.value !== null).length;
  const requiredUnfilled = ctx.fields.filter((f) => f.required && !f.value);
  const canComplete = requiredUnfilled.length === 0;

  return (
    <div className="space-y-6 pb-32">
      <Header doc={ctx.document} signer={ctx.signer} />

      <SignerPdfViewer
        token={token}
        fields={ctx.fields}
        onFieldClick={(id) => setFilling(id)}
      />

      <ErrorBanner message={actionError} />

      <BottomBar
        progress={`${filledCount} of ${ctx.fields.length} field${ctx.fields.length === 1 ? '' : 's'} filled`}
        canComplete={canComplete}
        onComplete={complete}
        onDecline={decline}
        busy={busy}
      />

      {fillingField && (
        <FillModal
          field={fillingField}
          busy={busy}
          onClose={() => setFilling(null)}
          onSave={(value) => saveField(fillingField.id, value)}
        />
      )}
    </div>
  );
}

function Header({
  doc,
  signer,
}: {
  doc: SigningContext['document'];
  signer: SigningContext['signer'];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{doc.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Signing as <span className="font-medium text-slate-900">{signer.name}</span> ·{' '}
            {signer.email}
          </p>
        </div>
        <StatusPill status={signer.status} />
      </div>
    </div>
  );
}

function BottomBar({
  progress,
  canComplete,
  onComplete,
  onDecline,
  busy,
}: {
  progress: string;
  canComplete: boolean;
  onComplete: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 px-6 py-4 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-slate-600">{progress}</span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDecline} disabled={busy}>
            Decline
          </Button>
          <Button
            onClick={onComplete}
            disabled={busy || !canComplete}
            title={!canComplete ? 'Fill all required fields first' : undefined}
          >
            {busy ? 'Working…' : 'Complete signing'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SignerPdfViewer({
  token,
  fields,
  onFieldClick,
}: {
  token: string;
  fields: SignerField[];
  onFieldClick: (id: string) => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pageSizes, setPageSizes] = useState<Record<number, PageSize>>({});

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    setPdf(null);
    (async () => {
      try {
        const res = await fetch(apiUrl(`/api/sign/${token}/document`));
        if (!res.ok) throw new Error(`PDF fetch failed (${res.status})`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const loaded = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        if (cancelled) {
          loaded.destroy();
          return;
        }
        setPdf(loaded);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load document');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const setSize = (pageNum: number) => (size: PageSize) =>
    setPageSizes((prev) =>
      prev[pageNum]?.width === size.width && prev[pageNum]?.height === size.height
        ? prev
        : { ...prev, [pageNum]: size },
    );

  if (err) return <ErrorBanner message={err} />;
  if (!pdf)
    return (
      <Card>
        <p className="text-sm text-slate-500">Loading document…</p>
      </Card>
    );

  return (
    <div className="space-y-6">
      {Array.from({ length: pdf.numPages }, (_, i) => i + 1).map((pageNum) => {
        const onPage = fields.filter((f) => f.page === pageNum);
        const size = pageSizes[pageNum];
        return (
          <div key={pageNum}>
            <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">
              Page {pageNum} of {pdf.numPages}
            </div>
            <PdfPage pdf={pdf} pageNumber={pageNum} onSize={setSize(pageNum)}>
              {size &&
                onPage.map((f) => (
                  <FieldOverlayBox key={f.id} field={f} onClick={() => onFieldClick(f.id)} />
                ))}
            </PdfPage>
          </div>
        );
      })}
    </div>
  );
}

function FieldOverlayBox({
  field,
  onClick,
}: {
  field: SignerField;
  onClick: () => void;
}) {
  const filled = field.value !== null && field.value !== '';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'absolute',
        left: `${field.x}%`,
        top: `${field.y}%`,
        width: `${field.width}%`,
        height: `${field.height}%`,
      }}
      className={cn(
        'flex items-center justify-center overflow-hidden rounded border-2 text-xs',
        filled
          ? 'border-green-500 bg-green-50/85 text-green-900'
          : 'border-amber-500 bg-amber-50/85 text-amber-900 hover:bg-amber-100/90',
      )}
    >
      {filled ? <FilledValue field={field} /> : <UnfilledHint field={field} />}
    </button>
  );
}

function FilledValue({ field }: { field: SignerField }) {
  const v = field.value!;
  if (
    (field.type === 'SIGNATURE' || field.type === 'INITIAL') &&
    /^data:image\//i.test(v)
  ) {
    return <img src={v} alt="" className="max-h-full max-w-full object-contain" />;
  }
  if (field.type === 'CHECKBOX') {
    return <span className="text-base">{isCheckboxTruthy(v) ? '✓' : '☐'}</span>;
  }
  return <span className="truncate px-1 italic">{v}</span>;
}

function UnfilledHint({ field }: { field: SignerField }) {
  return (
    <span className="font-medium">
      {FIELD_LABEL[field.type]}
      {field.required ? ' *' : ''}
    </span>
  );
}

function FillModal({
  field,
  busy,
  onClose,
  onSave,
}: {
  field: SignerField;
  busy: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const [text, setText] = useState(field.value ?? '');
  const [drawn, setDrawn] = useState<string | null>(null);
  const [boxValue, setBoxValue] = useState(field.value ? isCheckboxTruthy(field.value) : false);

  const isSignature = field.type === 'SIGNATURE' || field.type === 'INITIAL';

  const submit = () => {
    let final = text;
    if (isSignature) {
      // Drawing wins if present; otherwise typed name
      final = drawn ?? text.trim();
      if (!final) return;
    } else if (field.type === 'CHECKBOX') {
      final = boxValue ? 'true' : 'false';
    } else {
      final = text.trim();
      if (!final) return;
    }
    onSave(final);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <h3 className="text-lg font-semibold">{TITLE[field.type]}</h3>
        <p className="mt-1 text-xs text-slate-500">
          {field.required ? 'Required' : 'Optional'} · page {field.page}
        </p>

        {isSignature && (
          <div className="mt-4 space-y-4">
            <div>
              <Label>Draw</Label>
              <SignaturePad onChange={setDrawn} />
            </div>
            <div>
              <Label htmlFor="fm-text">Or type your {field.type === 'INITIAL' ? 'initials' : 'name'}</Label>
              <Input
                id="fm-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={field.type === 'INITIAL' ? 'AL' : 'Alice Liddell'}
              />
              <p className="mt-1 text-xs text-slate-500">
                If you both draw and type, the drawing is used.
              </p>
            </div>
          </div>
        )}

        {field.type === 'DATE' && (
          <div className="mt-4">
            <Label htmlFor="fm-date">Date</Label>
            <Input
              id="fm-date"
              type="date"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        )}

        {field.type === 'TEXT' && (
          <div className="mt-4">
            <Label htmlFor="fm-text2">Text</Label>
            <Textarea
              id="fm-text2"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        )}

        {field.type === 'CHECKBOX' && (
          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={boxValue}
                onChange={(e) => setBoxValue(e.target.checked)}
                className="h-4 w-4"
              />
              Confirm
            </label>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SuccessView({ ctx, token }: { ctx: SigningContext; token: string }) {
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const download = async () => {
    setDownloading(true);
    setErr(null);
    try {
      await downloadFile(`/api/sign/${token}/signed`, `${ctx.document.name}-signed.pdf`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <div className="text-center">
        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">
          ✓
        </div>
        <h2 className="text-xl font-semibold">Thanks for signing</h2>
        <p className="mt-2 text-sm text-slate-600">
          You signed <span className="font-medium">{ctx.document.name}</span>. The signed copy is
          {ctx.document.signedReady ? ' ready below.' : ' being prepared — this usually takes a few seconds.'}
        </p>
      </div>

      <ErrorBanner message={err} />

      <div className="mt-6 flex flex-col items-center gap-3">
        <Button onClick={download} disabled={!ctx.document.signedReady || downloading}>
          {ctx.document.signedReady
            ? downloading
              ? 'Downloading…'
              : 'Download signed copy'
            : 'Generating signed copy…'}
        </Button>
        {ctx.otherSigners.length > 0 && (
          <p className="text-xs text-slate-500">
            Other signers: {ctx.otherSigners.map((s) => `${s.name} (${s.status})`).join(', ')}
          </p>
        )}
      </div>
    </Card>
  );
}

function DeclinedView({ ctx }: { ctx: SigningContext }) {
  return (
    <Card>
      <div className="text-center">
        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl text-red-700">
          ✕
        </div>
        <h2 className="text-xl font-semibold">You declined</h2>
        <p className="mt-2 text-sm text-slate-600">
          You declined to sign <span className="font-medium">{ctx.document.name}</span>. The
          sender has been notified.
        </p>
      </div>
    </Card>
  );
}
