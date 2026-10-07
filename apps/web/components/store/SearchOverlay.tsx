"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicProduct } from "@/lib/store";
import { priceLabel } from "@/lib/store";
import { IMG_WIDTH, imgSrc } from "@/lib/img";
import { matchesSearch } from "@/lib/search";
import { useOverlayHistory } from "@/lib/use-overlay-history";
import { IconArrowRight, IconClose, IconSearch } from "./ui";

const MAX_RESULTS = 30;

// Pesquisa geral da loja pública ("O que você está procurando?"): resultados
// aparecem enquanto o cliente digita, por qualquer parte do nome. Tocar num
// resultado abre o produto por cima (fechando o produto, volta à pesquisa).
export function SearchOverlay({
  open,
  products,
  onClose,
  onOpenProduct,
  onSeeAll,
}: {
  open: boolean;
  products: PublicProduct[];
  onClose: () => void;
  onOpenProduct: (id: string) => void;
  onSeeAll: (term: string) => void;
}) {
  const [term, setTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useOverlayHistory(open, onClose);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(id);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const results = useMemo(
    () => (term.trim() ? products.filter((p) => matchesSearch(term, p.name, p.description)) : []),
    [products, term]
  );
  const suggestions = useMemo(() => {
    const featured = products.filter((p) => p.featured);
    return (featured.length > 0 ? featured : products).slice(0, 6);
  }, [products]);

  if (!open) return null;

  const list = term.trim() ? results.slice(0, MAX_RESULTS) : suggestions;

  return (
    <div className="fixed inset-0 z-[65] animate-fade-in bg-black/45 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pesquisar produtos"
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[100dvh] w-full max-w-2xl animate-sheet-up flex-col bg-[var(--bg)] shadow-2xl sm:mt-16 sm:max-h-[80vh] sm:rounded-3xl sm:border sm:border-[var(--line)]"
      >
        <div className="flex items-center gap-2 border-b border-[var(--line)] p-3 sm:p-4">
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--accent)]" />
            <input
              ref={inputRef}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && term.trim()) {
                  e.preventDefault();
                  if (results.length === 1) onOpenProduct(results[0].id);
                  else onSeeAll(term);
                }
              }}
              placeholder="O que você está procurando?"
              aria-label="O que você está procurando?"
              inputMode="search"
              enterKeyHint="search"
              className="h-12 w-full rounded-full border border-[var(--line)] bg-[var(--surface)] pl-12 pr-10 text-base outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
            />
            {term && (
              <button
                onClick={() => {
                  setTerm("");
                  inputRef.current?.focus();
                }}
                aria-label="Limpar"
                className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--accent-soft)]"
              >
                <IconClose className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="h-12 shrink-0 rounded-full px-3 text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Fechar
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
          {term.trim() ? (
            <p className="px-3 pb-2 pt-1 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
              {results.length === 0
                ? "Nenhum produto encontrado"
                : `${results.length} ${results.length === 1 ? "produto encontrado" : "produtos encontrados"}`}
            </p>
          ) : (
            <p className="px-3 pb-2 pt-1 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
              Digite parte do nome — ex.: chaveiro, vaso, natal
              {suggestions.length > 0 ? " · Sugestões" : ""}
            </p>
          )}

          {term.trim() && results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--muted)]">
              Não achamos “{term.trim()}”. Tente outra palavra ou fale com a gente no WhatsApp.
            </p>
          ) : (
            <ul className="space-y-1">
              {list.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => onOpenProduct(p.id)}
                    className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-[var(--accent-soft)] active:scale-[0.99]"
                  >
                    <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--accent-soft)]">
                      {p.photo_urls[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={imgSrc(p.photo_urls[0], IMG_WIDTH.thumb)}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-semibold leading-snug text-[var(--ink)]">
                        {p.name}
                      </span>
                      <span
                        className={`block text-sm ${p.price_on_request ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}
                      >
                        {priceLabel(p)}
                        {!p.available ? " · Esgotado" : ""}
                      </span>
                    </span>
                    <IconArrowRight className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {term.trim() && results.length > 0 && (
          <div className="border-t border-[var(--line)] p-3">
            <button
              onClick={() => onSeeAll(term)}
              className="fx-btn flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--accent-ink)]"
            >
              Ver {results.length === 1 ? "o resultado" : `os ${results.length} resultados`} no catálogo
              <IconArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
