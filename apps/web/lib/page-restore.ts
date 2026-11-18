"use client";

// Volta para onde o cliente estava quando o celular recarrega a página.
//
// Ao minimizar o navegador, o Android/iPhone muitas vezes descarta a aba para
// liberar memória; ao voltar, ela é carregada do zero (abertura animada, topo
// da página, aba Início). Por isso, sempre que a página sai da tela, guardamos
// aba, categoria, busca, produto aberto e a rolagem nesta aba do navegador
// (sessionStorage). Se a página abrir de novo em até 30 minutos, tudo é
// restaurado e a abertura animada é pulada.
import { useEffect, useRef } from "react";

const KEY = "loja-volta";
const MAX_AGE_MS = 30 * 60 * 1000;

export type PageSnap = {
  tab: number;
  category: string | null;
  search: string;
  product: string | null;
  y: number;
  at: number;
};

let taken: PageSnap | null | undefined;

/** Lê (uma vez por carregamento) o estado guardado antes de a aba ser descartada. */
export function takeSnap(): PageSnap | null {
  if (taken !== undefined) return taken;
  taken = null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) {
      const snap = JSON.parse(raw) as PageSnap;
      if (Date.now() - snap.at < MAX_AGE_MS) taken = snap;
    }
  } catch {
    // sem armazenamento: abre normal
  }
  return taken;
}

/** Guarda o estado da loja sempre que a página sai da tela (minimizar, trocar de app). */
export function useSnapSaver(get: () => Omit<PageSnap, "y" | "at">) {
  const getRef = useRef(get);
  useEffect(() => {
    getRef.current = get;
  });
  useEffect(() => {
    const save = () => {
      try {
        const snap: PageSnap = { ...getRef.current(), y: Math.round(window.scrollY), at: Date.now() };
        window.sessionStorage.setItem(KEY, JSON.stringify(snap));
      } catch {
        // sem armazenamento: tudo bem
      }
    };
    const onVisibility = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", save);
    };
  }, []);
}

/** Rola até a posição guardada, tentando de novo enquanto fotos terminam de carregar. */
export function restoreScroll(y: number) {
  if (y <= 0) return;
  let tries = 0;
  const go = () => {
    window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
    if (Math.abs(window.scrollY - y) > 40 && tries++ < 12) setTimeout(go, 150);
  };
  requestAnimationFrame(go);
}
