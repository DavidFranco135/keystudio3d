"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { IMG_WIDTH, imgSrc } from "@/lib/img";
import { matchesSearch } from "@/lib/search";

// Escolha de produto com busca (lupa): substitui o <select> comum, que fica
// inviável com dezenas de produtos. Digita parte do nome, escolhe na lista.
export function ProductPicker({
  products,
  value,
  onChange,
  placeholder = "Buscar produto pelo nome…",
  className = "",
}: {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = products.find((p) => p.id === value) ?? null;
  const matches = useMemo(
    () => products.filter((p) => matchesSearch(query, p.name, p.description)),
    [products, query]
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(product: Product) {
    onChange(product.id);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && matches[active]) {
        e.preventDefault();
        choose(matches[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const price = (p: Product) => (p.manual_price != null ? formatCurrency(p.manual_price) : null);

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <div className="relative">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-label="Produto"
          inputMode="search"
          value={open ? query : selected?.name ?? ""}
          placeholder={selected && !open ? selected.name : placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setActive(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="w-full rounded border border-neutral-700 bg-neutral-900 py-2 pl-9 pr-9 text-sm placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none"
        />
        {(selected || query) && (
          <button
            type="button"
            aria-label="Limpar produto"
            onClick={() => {
              setQuery("");
              onChange("");
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          // Na própria página (não flutuante): o painel de Detalhes do pedido
          // tem overflow-hidden e cortaria uma lista sobreposta.
          className="mt-1 max-h-72 overflow-auto rounded-lg border border-neutral-700 bg-neutral-950 py-1 shadow-2xl"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-neutral-500">Nenhum produto encontrado.</li>
          ) : (
            matches.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={p.id === value}
                onPointerDown={(e) => {
                  e.preventDefault();
                  choose(p);
                }}
                onPointerEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm ${
                  i === active ? "bg-neutral-800" : ""
                } ${p.id === value ? "text-blue-300" : "text-neutral-200"}`}
              >
                <span className="h-8 w-8 shrink-0 overflow-hidden rounded bg-neutral-800">
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
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {price(p) && <span className="shrink-0 text-xs text-neutral-500">{price(p)}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
