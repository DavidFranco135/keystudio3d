"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "./ui";

const AUTO_MS = 4200;

// Faixa horizontal de cards que desliza sozinha (e com o dedo/setas). Usa o
// scroll nativo com snap, então o arraste no celular é o do próprio navegador.
export function FeaturedSlider({ children }: { children: React.ReactNode[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const count = children.length;

  const updateEdges = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  const step = useCallback((direction: 1 | -1, loop = false) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(el).columnGap || "0") || 0;
    const width = card ? card.offsetWidth + gap : el.clientWidth;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    if (loop && direction === 1 && end) el.scrollTo({ left: 0, behavior: "smooth" });
    else el.scrollBy({ left: width * direction, behavior: "smooth" });
  }, []);

  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, [updateEdges, count]);

  useEffect(() => {
    if (paused || count < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") step(1, true);
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [paused, count, step]);

  return (
    <div
      className="group/slider relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      // O arraste aqui rola a faixa; não deve trocar a aba da loja.
      onTouchStart={(e) => {
        setPaused(true);
        e.stopPropagation();
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        setTimeout(() => setPaused(false), 2500);
      }}
    >
      <div
        ref={trackRef}
        onScroll={updateEdges}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:gap-5 sm:scroll-px-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {children.map((child, i) => (
          <div
            key={i}
            className="w-[68%] shrink-0 snap-start min-[480px]:w-[46%] md:w-[31%] lg:w-[calc((100%-3*1.25rem)/4)]"
          >
            {child}
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            onClick={() => step(-1)}
            disabled={atStart}
            aria-label="Destaques anteriores"
            className="absolute -left-3 top-[38%] hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-glass)] text-[var(--ink)] shadow-lg backdrop-blur transition hover:scale-105 disabled:pointer-events-none disabled:opacity-0 sm:flex"
          >
            <IconChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => step(1, true)}
            aria-label="Próximos destaques"
            className={`absolute -right-3 top-[38%] hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-glass)] text-[var(--ink)] shadow-lg backdrop-blur transition hover:scale-105 sm:flex ${
              atStart && atEnd ? "pointer-events-none opacity-0" : ""
            }`}
          >
            <IconChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}
