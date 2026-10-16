"use client";

import { useRef, useState } from "react";
import { useOverlayHistory } from "@/lib/use-overlay-history";

type Pos = { x: number; y: number };

const clamp = (v: number) => Math.max(0, Math.min(100, v));

type Preview = { label: string; aspect: number; width: number };

// Padrão (catálogo): quadro quadrado + pré-visualização da grade e da loja.
const DEFAULT_PREVIEWS: Preview[] = [
  { label: "Grade (quadrado)", aspect: 1, width: 96 },
  { label: "Loja (retrato)", aspect: 4 / 5, width: 80 },
];

export function PhotoFramer({
  url,
  initial,
  saving,
  onCancel,
  onSave,
  aspect = 1,
  title = "Enquadrar foto na grade",
  hint = "Arraste a foto dentro do quadrado para escolher a parte que aparece no catálogo.",
  previews = DEFAULT_PREVIEWS,
}: {
  url: string;
  initial: Pos;
  saving: boolean;
  onCancel: () => void;
  onSave: (pos: Pos) => void;
  /** Proporção (largura / altura) do quadro de edição. Padrão: quadrado. */
  aspect?: number;
  title?: string;
  hint?: string;
  previews?: Preview[];
}) {
  useOverlayHistory(true, onCancel);
  const [pos, setPos] = useState<Pos>(initial);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; start: Pos } | null>(null);

  function overflow(): { x: number; y: number } {
    const box = boxRef.current;
    if (!box || !natural) return { x: 0, y: 0 };
    const scale = Math.max(box.clientWidth / natural.w, box.clientHeight / natural.h);
    return {
      x: Math.max(0, natural.w * scale - box.clientWidth),
      y: Math.max(0, natural.h * scale - box.clientHeight),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture is only a nicety (keeps tracking outside the box)
    }
    drag.current = { px: e.clientX, py: e.clientY, start: pos };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const o = overflow();
    const dx = e.clientX - drag.current.px;
    const dy = e.clientY - drag.current.py;
    setPos({
      x: o.x > 0 ? clamp(drag.current.start.x - (dx / o.x) * 100) : 50,
      y: o.y > 0 ? clamp(drag.current.start.y - (dy / o.y) * 100) : 50,
    });
  }

  const objectPosition = `${pos.x}% ${pos.y}%`;
  // A foto só pode ser reposicionada se a proporção dela for diferente da do quadro.
  const movable = natural ? Math.abs(natural.w / natural.h - aspect) / aspect > 0.01 : true;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Enquadrar foto"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[95vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-5"
      >
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="text-xs text-neutral-500">{hint}</p>
        </div>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div
            ref={boxRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            style={{ aspectRatio: String(aspect) }}
            className={`relative w-full max-w-[320px] touch-none select-none overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 ${
              movable ? "cursor-grab active:cursor-grabbing" : ""
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={(el) => {
                // A cached image can finish loading before React attaches onLoad.
                if (el && el.complete && el.naturalWidth > 0) {
                  setNatural((prev) => prev ?? { w: el.naturalWidth, h: el.naturalHeight });
                }
              }}
              src={url}
              alt=""
              draggable={false}
              onLoad={(e) =>
                setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
              }
              className="pointer-events-none h-full w-full object-cover"
              style={{ objectPosition }}
            />
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-white/15" />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 sm:flex-col">
            {previews.map((pv) => (
              <div key={pv.label} className="space-y-1">
                <p className="text-[11px] text-neutral-500">{pv.label}</p>
                <div
                  className="overflow-hidden rounded-lg border border-neutral-800"
                  style={{ width: pv.width, aspectRatio: String(pv.aspect) }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" style={{ objectPosition }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {!movable && (
          <p className="text-xs text-yellow-400">
            Esta foto já tem a proporção do quadro: não há o que reposicionar.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={() => setPos({ x: 50, y: 50 })}
            className="rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500"
          >
            Centralizar
          </button>
          <button
            onClick={onCancel}
            className="rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave({ x: Math.round(pos.x * 10) / 10, y: Math.round(pos.y * 10) / 10 })}
            disabled={saving}
            className="rounded bg-blue-600 px-5 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar enquadramento"}
          </button>
        </div>
      </div>
    </div>
  );
}
