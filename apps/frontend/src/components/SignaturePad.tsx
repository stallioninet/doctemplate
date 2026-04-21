'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';

interface Props {
  onChange: (dataUrl: string | null) => void;
  height?: number;
}

/**
 * Pointer-event drawing pad. Calls `onChange(dataUrl)` on each pointer-up
 * with the canvas serialised to a PNG data URL — or `null` after the
 * Clear button is pressed. The canvas is sized at the device pixel ratio
 * so strokes stay crisp on hi-DPI displays.
 */
export function SignaturePad({ onChange, height = 144 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0f172a';
  }, []);

  const getPos = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawing.current = true;
    last.current = getPos(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !last.current) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    last.current = pos;
    if (empty) setEmpty(false);
  };

  const onUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    canvasRef.current?.releasePointerCapture(e.pointerId);
    onChange(empty ? null : canvasRef.current?.toDataURL('image/png') ?? null);
  };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ height: `${height}px`, touchAction: 'none' }}
        className="block w-full cursor-crosshair rounded-md border border-slate-300 bg-white"
      />
      <button
        type="button"
        onClick={clear}
        className="mt-2 text-xs font-medium text-slate-600 underline hover:text-slate-900"
      >
        Clear
      </button>
    </div>
  );
}
