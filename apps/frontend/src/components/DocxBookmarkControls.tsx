'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, ErrorBanner, Input, Label, Textarea } from '@/components/ui';

const PLACEHOLDER_TYPES = ['TEXT', 'DATE', 'NUMBER'] as const;
type PlaceholderType = (typeof PLACEHOLDER_TYPES)[number];

export interface BookmarkPlaceholder {
  id: string;
  name: string;
  type: PlaceholderType;
  kind: 'COORD' | 'BOOKMARK';
  required: boolean;
  defaultValue: string | null;
}

const slugify = (s: string): string => {
  const base = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  if (!base) return '';
  return /^[a-z_]/.test(base) ? base : `field_${base}`;
};

export function AddPlaceholderForm({
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
      className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3"
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

export function BookmarkRow({
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
