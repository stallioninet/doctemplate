'use client';

import { useEffect, useRef, type DragEvent, type ReactNode } from 'react';
import type { PDFDocumentProxy } from '@/lib/pdfjs';

export interface PageSize {
  width: number;
  height: number;
}

interface PdfPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale?: number;
  onSize?: (size: PageSize) => void;
  children?: ReactNode;
  /** Optional HTML5 drag handlers wired to the absolute overlay div, so a
   *  parent can implement drag-from-sidebar-onto-page UX without computing
   *  offsets across labels or scroll containers. */
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: DragEvent<HTMLDivElement>) => void;
}

/**
 * Renders one PDF page to a canvas and stretches a child overlay div
 * across the same pixel area so callers can position field boxes via
 * percentage coordinates.
 */
export function PdfPage({
  pdf,
  pageNumber,
  scale = 1.5,
  onSize,
  children,
  onDragOver,
  onDrop,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    type RenderHandle = { promise: Promise<unknown>; cancel: () => void };
    let task: RenderHandle | null = null;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      onSize?.({ width: viewport.width, height: viewport.height });

      task = page.render({ canvasContext: ctx, viewport, canvas }) as unknown as RenderHandle;
      try {
        await task.promise;
      } catch {
        /* render aborted */
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, scale, onSize]);

  return (
    <div className="relative inline-block border border-slate-300 bg-white shadow-sm">
      <canvas ref={canvasRef} className="block" />
      <div
        className="absolute inset-0"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {children}
      </div>
    </div>
  );
}
