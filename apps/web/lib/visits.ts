"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/api-client";

const VISITOR_KEY = "ks-visitor-id";
const HEARTBEAT_MS = 30_000;
const ID_FORMAT = /^[A-Za-z0-9_-]{8,64}$/;

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID().replace(/-/g, "");
    }
  } catch {
    // cai no gerador simples abaixo
  }
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
}

// Identificador aleatório e anônimo do navegador (não é IP nem dado pessoal).
function getVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id || !ID_FORMAT.test(id)) {
      id = randomId();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return randomId();
  }
}

const seenProductViews = new Set<string>();

/**
 * Registra uma ação anônima na vitrine (produto aberto ou clique no WhatsApp).
 * Falhas são ignoradas. Cada produto conta uma vez por abertura da página.
 */
export function trackStoreEvent(slug: string, kind: "product_view" | "whatsapp_click", productId?: string) {
  if (kind === "product_view") {
    if (!productId) return;
    const key = `${slug}:${productId}`;
    if (seenProductViews.has(key)) return;
    seenProductViews.add(key);
  }
  apiFetch(`/api/v1/public/stores/${encodeURIComponent(slug)}/event`, {
    method: "POST",
    body: JSON.stringify({ kind, ...(productId ? { product_id: productId } : {}) }),
    keepalive: true,
  }).catch(() => {});
}

/**
 * Conta a visita na vitrine e avisa a cada 30 s que a pessoa ainda está lá
 * (é o que alimenta o "online agora" do painel). Também conta os cliques em
 * qualquer link do WhatsApp da loja (wa.me). Falhas são ignoradas: o contador
 * nunca pode atrapalhar a loja.
 */
export function useVisitTracker(slug: string) {
  useEffect(() => {
    const visitorId = getVisitorId();
    const sessionKey = `ks-visit-${slug}`;
    // Recarregar a página na mesma aba não conta como nova visita.
    let isNewVisit = true;
    try {
      isNewVisit = sessionStorage.getItem(sessionKey) !== "1";
      sessionStorage.setItem(sessionKey, "1");
    } catch {
      // sem sessionStorage: conta como visita nova
    }

    const send = (newVisit: boolean) => {
      apiFetch(`/api/v1/public/stores/${encodeURIComponent(slug)}/ping`, {
        method: "POST",
        body: JSON.stringify({ visitor_id: visitorId, new_visit: newVisit }),
        keepalive: true,
      }).catch(() => {});
    };

    send(isNewVisit);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") send(false);
    }, HEARTBEAT_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") send(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Um só ouvinte cobre todos os botões de WhatsApp (capa, produto, pedido…).
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('a[href^="https://wa.me/"]')) trackStoreEvent(slug, "whatsapp_click");
    };
    document.addEventListener("click", onClick, true);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("click", onClick, true);
    };
  }, [slug]);
}
