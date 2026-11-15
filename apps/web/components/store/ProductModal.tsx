"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CartLine, PublicProduct } from "@/lib/store";
import { priceLabel, whatsappLink } from "@/lib/store";
import { focusStyle } from "@/lib/focus";
import { useOverlayHistory } from "@/lib/use-overlay-history";
import {
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconMinus,
  IconPlus,
  IconWhatsapp,
  useSwipe,
} from "./ui";
import { IMG_WIDTH, imgSrc } from "@/lib/img";
import { IconCube, Model3D, ProductionEta, RelatedProducts, ShareProductButton } from "./extras";

export function ProductModal({
  product,
  line,
  storeName,
  whatsapp,
  onClose,
  onSave,
  related = [],
  onOpenProduct,
  productionDays,
  shareUrl,
}: {
  product: PublicProduct;
  line: CartLine | undefined;
  storeName: string;
  whatsapp: string;
  onClose: () => void;
  onSave: (qty: number, note: string) => void;
  related?: PublicProduct[];
  onOpenProduct?: (id: string) => void;
  productionDays?: string;
  shareUrl?: string;
}) {
  const [photo, setPhoto] = useState(0);
  const [qty, setQty] = useState(line?.qty ?? 1);
  const [note, setNote] = useState(line?.note ?? "");
  const photos = product.photo_urls;
  const maxQty = product.stock_quantity ?? 99;
  // Zoom na foto: segue o mouse no computador; no celular, um toque amplia
  // no ponto tocado e outro volta.
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [view, setView] = useState<"fotos" | "3d">("fotos");
  const [leaving, setLeaving] = useState(false);
  const has3d = !!product.model_url;
  // Trocar de produto ("Você também pode gostar") reaproveita a janela aberta:
  // volta para a primeira foto, a quantidade do pedido e o topo.
  const [shownId, setShownId] = useState(product.id);
  if (shownId !== product.id) {
    setShownId(product.id);
    setPhoto(0);
    setQty(line?.qty ?? 1);
    setNote(line?.note ?? "");
    setZoom(null);
    setView("fotos");
  }
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialogRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [product.id]);
  // Fechar pelo botão/fundo: anima a saída antes de sumir.
  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(onClose, 200);
  }, [onClose]);
  const zoomAt = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };
  const zoomStyle: React.CSSProperties = zoom
    ? {
        transform: "scale(2.2)",
        transformOrigin: `${zoom.x}% ${zoom.y}%`,
        transition: "opacity 0.7s ease, transform 0.3s ease-out",
        cursor: "zoom-out",
      }
    : {};

  // Back closes the dialog instead of leaving the page.
  useOverlayHistory(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [close]);

  const next = () => {
    setZoom(null);
    if (photos.length > 0) setPhoto((i) => (i + 1) % photos.length);
  };
  const prev = () => {
    setZoom(null);
    if (photos.length > 0) setPhoto((i) => (i - 1 + photos.length) % photos.length);
  };
  const swipe = useSwipe(next, prev);

  const ask = whatsappLink(
    whatsapp,
    `Olá, ${storeName}! Tenho uma dúvida sobre o produto *${product.name}*${
      product.size ? ` (${product.size})` : ""
    }.`
  );

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6 ${leaving ? "fx-fade-out" : "animate-fade-in"}`}
      onClick={close}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={product.name}
        onClick={(e) => e.stopPropagation()}
        className={`relative grid max-h-[94vh] w-full max-w-4xl ${leaving ? "fx-sheet-out" : "animate-sheet-up"} grid-cols-1 overflow-y-auto rounded-t-[32px] bg-[var(--surface)] text-[var(--ink)] shadow-2xl sm:max-h-[88vh] sm:grid-cols-2 sm:rounded-[32px]`}
      >
        <button
          onClick={close}
          aria-label="Fechar"
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65"
        >
          <IconClose className="h-5 w-5" />
        </button>

        <div className="relative bg-[var(--accent-soft)] sm:min-h-[520px]" {...(zoom || view === "3d" ? {} : swipe)}>
          <div
            className={`relative aspect-[4/5] w-full overflow-hidden sm:aspect-auto sm:h-full ${
              view === "fotos" && photos.length > 0 ? (zoom ? "cursor-zoom-out" : "cursor-zoom-in") : ""
            }`}
            onMouseMove={(e) => {
              if (view === "fotos" && photos.length > 0 && window.matchMedia("(hover: hover)").matches) setZoom(zoomAt(e));
            }}
            onMouseLeave={() => {
              if (window.matchMedia("(hover: hover)").matches) setZoom(null);
            }}
            onClick={(e) => {
              if (view !== "fotos" || photos.length === 0 || window.matchMedia("(hover: hover)").matches) return;
              const at = zoomAt(e);
              setZoom((z) => (z ? null : at));
            }}
          >
            {view === "3d" && product.model_url ? (
              <Model3D
                src={product.model_url}
                poster={photos[0] ? imgSrc(photos[0], IMG_WIDTH.large) : undefined}
                alt={product.name}
              />
            ) : photos.length > 0 ? (
              photos.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={imgSrc(src, IMG_WIDTH.large)}
                  alt={`${product.name} - foto ${i + 1}`}
                  style={{ ...focusStyle(product.photo_focus, src), ...(i === photo ? zoomStyle : {}) }}
                  className={`absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    i === photo ? "scale-100 opacity-100" : "scale-105 opacity-0"
                  }`}
                />
              ))
            ) : (
              <div className="flex h-full w-full items-center justify-center font-[family-name:var(--font-display)] text-8xl text-[var(--accent-text)] opacity-30">
                {product.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          {has3d && (
            <div className="absolute left-3 top-3 z-[5] flex rounded-full bg-black/45 p-1 text-xs font-semibold text-white backdrop-blur">
              {(["fotos", "3d"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setView(v);
                    setZoom(null);
                  }}
                  className={`flex items-center gap-1 rounded-full px-3 py-1.5 transition ${
                    view === v ? "bg-white text-neutral-900" : "text-white/85 hover:text-white"
                  }`}
                >
                  {v === "3d" && <IconCube className="h-3.5 w-3.5" />}
                  {v === "fotos" ? "Fotos" : "Ver em 3D"}
                </button>
              ))}
            </div>
          )}

          {view === "fotos" && photos.length > 0 && !zoom && (
            <span className="pointer-events-none absolute bottom-10 right-3 rounded-full bg-black/40 px-2.5 py-1 text-[10px] text-white/90 backdrop-blur">
              <span className="[@media(hover:hover)]:hidden">Toque para ampliar</span>
              <span className="hidden [@media(hover:hover)]:inline">Passe o mouse para ampliar</span>
            </span>
          )}

          {view === "fotos" && photos.length > 1 && (
            <>
              <button
                onClick={prev}
                aria-label="Foto anterior"
                className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
              >
                <IconChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={next}
                aria-label="Próxima foto"
                className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
              >
                <IconChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPhoto(i)}
                    aria-label={`Foto ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === photo ? "w-6 bg-white" : "w-1.5 bg-white/55"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div className="space-y-2 pr-8">
            {product.featured && (
              <span className="fx-shine inline-block rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-text)]">
                Destaque
              </span>
            )}
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">
              {product.name}
            </h2>
            <p
              className={`font-[family-name:var(--font-display)] font-semibold text-[var(--accent-text)] ${
                product.price_on_request ? "text-2xl" : "text-3xl"
              }`}
            >
              {priceLabel(product)}
            </p>
          </div>

          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {product.size && (
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-[var(--muted)]">Tamanho</dt>
                <dd className="font-medium">{product.size}</dd>
              </div>
            )}
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-[var(--muted)]">Disponibilidade</dt>
              <dd className={`font-medium ${product.available ? "" : "text-red-500"}`}>
                {!product.available
                  ? "Esgotado"
                  : product.stock_quantity != null
                    ? `${product.stock_quantity} em estoque`
                    : "Sob encomenda / disponível"}
              </dd>
            </div>
          </dl>

          {product.description && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--muted)]">
              {product.description}
            </p>
          )}

          <ProductionEta text={productionDays} variant="inline" />

          {product.available && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-2">
                <span className="pl-3 text-sm font-medium">Quantidade</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    aria-label="Diminuir"
                    className="flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-[var(--accent-soft)]"
                  >
                    <IconMinus className="h-4 w-4" />
                  </button>
                  <span className="w-10 text-center text-base font-semibold">{qty}</span>
                  <button
                    onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                    aria-label="Aumentar"
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-ink)] transition hover:brightness-110"
                  >
                    <IconPlus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder="Informações adicionais: cor, personalização, nome na peça…"
                className="w-full resize-none rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
              />
            </div>
          )}

          <div className="mt-auto flex flex-col gap-2.5">
            {product.available && (
              <button
                onClick={() => onSave(qty, note.trim())}
                className="fx-btn inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 text-sm font-semibold text-[var(--accent-ink)] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
              >
                {line ? "Atualizar no pedido" : "Adicionar ao pedido"}
                {product.price_on_request ? "" : ` · ${priceLabel(product, qty)}`}
              </button>
            )}
            <a
              href={ask}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[var(--line)] px-6 text-sm font-semibold transition hover:border-[#25d366] hover:text-[#25d366]"
            >
              <IconWhatsapp className="h-4 w-4 text-[#25d366]" />
              Tirar dúvidas no WhatsApp
            </a>
            {shareUrl && <ShareProductButton url={shareUrl} title={product.name} />}
          </div>

          {onOpenProduct && <RelatedProducts products={related} onOpen={onOpenProduct} />}
        </div>
      </div>
    </div>
  );
}
