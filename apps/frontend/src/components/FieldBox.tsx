'use client';

import { useRef, type PointerEvent } from 'react';
import type { PageSize } from './PdfPage';

export interface BoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FieldShape extends BoxRect {
  id: string;
  signerId: string;
  type: string;
}

interface FieldBoxProps {
  field: FieldShape;
  pageSize: PageSize;
  selected: boolean;
  editable: boolean;
  signerName: string;
  onSelect: () => void;
  /** Called continuously during drag/resize for live visual updates. */
  onChange: (rect: BoxRect) => void;
  /** Called once on pointer-up — the right place to PATCH the backend. */
  onCommit: (rect: BoxRect) => void;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const cn = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ');

export function FieldBox({
  field,
  pageSize,
  selected,
  editable,
  signerName,
  onSelect,
  onChange,
  onCommit,
}: FieldBoxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    mode: 'idle' as 'idle' | 'drag' | 'resize',
    startX: 0,
    startY: 0,
    initial: { x: 0, y: 0, width: 0, height: 0 },
  });

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    onSelect();
    if (!editable) return;
    e.stopPropagation();
    const isResize = (e.target as HTMLElement).dataset.handle === 'resize';
    containerRef.current?.setPointerCapture(e.pointerId);
    stateRef.current = {
      mode: isResize ? 'resize' : 'drag',
      startX: e.clientX,
      startY: e.clientY,
      initial: { x: field.x, y: field.y, width: field.width, height: field.height },
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = stateRef.current;
    if (s.mode === 'idle') return;
    const dxPct = ((e.clientX - s.startX) / pageSize.width) * 100;
    const dyPct = ((e.clientY - s.startY) / pageSize.height) * 100;
    if (s.mode === 'drag') {
      onChange({
        x: clamp(s.initial.x + dxPct, 0, 100 - s.initial.width),
        y: clamp(s.initial.y + dyPct, 0, 100 - s.initial.height),
        width: s.initial.width,
        height: s.initial.height,
      });
    } else {
      onChange({
        x: s.initial.x,
        y: s.initial.y,
        width: clamp(s.initial.width + dxPct, 3, 100 - s.initial.x),
        height: clamp(s.initial.height + dyPct, 2, 100 - s.initial.y),
      });
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (stateRef.current.mode === 'idle') return;
    stateRef.current.mode = 'idle';
    containerRef.current?.releasePointerCapture(e.pointerId);
    onCommit({ x: field.x, y: field.y, width: field.width, height: field.height });
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'absolute',
        left: `${field.x}%`,
        top: `${field.y}%`,
        width: `${field.width}%`,
        height: `${field.height}%`,
        touchAction: 'none',
      }}
      className={cn(
        'flex select-none items-center justify-center rounded border-2 text-xs font-medium',
        editable && 'cursor-move',
        selected
          ? 'border-blue-500 bg-blue-100/60 text-blue-900'
          : 'border-slate-500 bg-slate-200/40 text-slate-800 hover:bg-slate-200/60',
      )}
    >
      <span className="truncate px-1">
        {field.type} · {signerName}
      </span>
      {editable && (
        <div
          data-handle="resize"
          className="absolute -bottom-1 -right-1 h-3 w-3 cursor-se-resize rounded-sm bg-slate-700"
        />
      )}
    </div>
  );
}
