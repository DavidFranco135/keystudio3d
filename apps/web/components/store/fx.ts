"use client";

import { useEffect } from "react";

// Efeitos da loja pública (estilos em app/globals.css, seção "Loja pública:
// efeitos"). Tudo por delegação a partir da raiz, então os componentes só
// precisam das classes fx-btn / fx-spotlight / fx-shine / fx-header.
export function useStoreFx(root: React.RefObject<HTMLElement | null>, ready: boolean) {
  useEffect(() => {
    const el = root.current;
    if (!el || !ready) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // Fotos entram em foco ao carregar (inclusive as que já vieram do cache).
    const markLoaded = (img: HTMLImageElement) => img.classList.add("is-loaded");
    const settle = (node: ParentNode) =>
      node.querySelectorAll?.("main img").forEach((img) => {
        const i = img as HTMLImageElement;
        if (i.complete) markLoaded(i);
      });
    const onLoadOrError = (e: Event) => {
      if (e.target instanceof HTMLImageElement) markLoaded(e.target);
    };
    el.addEventListener("load", onLoadOrError, true);
    el.addEventListener("error", onLoadOrError, true);
    const observer = new MutationObserver(() => settle(el));
    observer.observe(el, { childList: true, subtree: true });
    settle(el);
    el.classList.add("fx-ready");

    // Onda a partir do ponto do clique nos botões principais.
    const onPointerDown = (e: PointerEvent) => {
      if (reduceMotion) return;
      const btn = (e.target as Element | null)?.closest?.(".fx-btn") as HTMLElement | null;
      if (!btn || !el.contains(btn)) return;
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.2;
      const ripple = document.createElement("span");
      ripple.className = "fx-ripple";
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 700);
    };

    // Luz dos cards segue o ponteiro.
    let frame = 0;
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const card = (e.target as Element | null)?.closest?.(".fx-spotlight") as HTMLElement | null;
      if (!card) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--fx-x", `${e.clientX - rect.left}px`);
        card.style.setProperty("--fx-y", `${e.clientY - rect.top}px`);
      });
    };

    // Sombra no cabeçalho + barra de progresso da rolagem.
    const header = el.querySelector<HTMLElement>(".fx-header");
    const onScroll = () => {
      if (!header) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      header.style.setProperty("--fx-scroll", String(max > 0 ? Math.min(1, window.scrollY / max) : 0));
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      observer.disconnect();
      el.removeEventListener("load", onLoadOrError, true);
      el.removeEventListener("error", onLoadOrError, true);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      el.classList.remove("fx-ready");
    };
  }, [root, ready]);
}
