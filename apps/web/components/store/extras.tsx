"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PublicProduct } from "@/lib/store";
import { formatReadyDate, priceLabel, productionReadyDate } from "@/lib/store";
import { IMG_WIDTH, imgSrc } from "@/lib/img";

// Recursos extras da vitrine: selos de confiança, prazo de produção, modelo
// 3D, compartilhar produto, relacionados, modo escuro automático e
// "instalar como app". Iguais na KeyStudio3D e na Moriá.

type IconProps = { className?: string };
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
};
export const IconTruck = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" />
    <circle cx="7" cy="17.5" r="1.6" />
    <circle cx="17.5" cy="17.5" r="1.6" />
  </svg>
);
export const IconHand = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v7.5c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4l-1.8-3a1.5 1.5 0 0 1 2.6-1.5L8 14" />
  </svg>
);
export const IconChat = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 5h16v11H9l-5 4z" />
    <path d="M8 9.5h8M8 12.5h5" />
  </svg>
);
export const IconShield = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
export const IconCube = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
  </svg>
);
export const IconShare = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="18" cy="5.5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="18.5" r="2.5" />
    <path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4" />
  </svg>
);
export const IconCalendar = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
export const IconDownload = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
  </svg>
);

function badgeIcon(text: string) {
  const t = text.toLowerCase();
  if (/envio|entrega|frete|brasil/.test(t)) return IconTruck;
  if (/whats|pagamento|pix|combinad|atendimento/.test(t)) return IconChat;
  if (/m[aã]o|artesan|feito|3d|impress|sob medida|personaliz/.test(t)) return IconHand;
  return IconShield;
}

const COLS: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" };

// Selos de confiança. "strip": faixa da página inicial; "compact": pedido e rodapé.
export function TrustBadges({
  badges,
  variant = "strip",
  className = "",
}: {
  badges: string[] | undefined;
  variant?: "strip" | "compact";
  className?: string;
}) {
  const list = (badges ?? []).filter((b) => b.trim());
  if (list.length === 0) return null;
  if (variant === "compact") {
    return (
      <ul className={`flex flex-wrap gap-x-4 gap-y-1.5 text-xs ${className}`}>
        {list.map((b) => {
          const Icon = badgeIcon(b);
          return (
            <li key={b} className="flex items-center gap-1.5">
              <Icon className="h-4 w-4 shrink-0 opacity-80" />
              {b}
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <ul className={`grid gap-3 ${COLS[Math.min(list.length, 3)]} ${className}`}>
      {list.map((b, i) => {
        const Icon = badgeIcon(b);
        return (
          <li
            key={b}
            className="fx-badge flex animate-fade-up items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 text-sm font-medium"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
              <Icon className="h-5 w-5" />
            </span>
            {b}
          </li>
        );
      })}
    </ul>
  );
}

// "Pedindo hoje, fica pronto até qui, 27/11". Só aparece com prazo cadastrado.
export function ProductionEta({
  text,
  variant = "card",
  className = "",
}: {
  text: string | undefined;
  variant?: "card" | "inline";
  className?: string;
}) {
  // A data depende do dia de hoje: calcula só no navegador (o HTML estático é de outro dia).
  const today = useSyncExternalStore(
    noopSubscribe,
    () => new Date().toDateString(),
    () => ""
  );
  const value = (text ?? "").trim();
  if (!value) return null;
  const ready = today ? productionReadyDate(value, new Date(today)) : null;
  if (variant === "inline") {
    return (
      <p className={`flex items-start gap-2 text-sm ${className}`}>
        <IconCalendar className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-text)]" />
        <span>
          Prazo de produção: <strong className="font-semibold">{value}</strong>
          {ready && (
            <span className="text-[var(--muted)]"> · pedindo hoje, fica pronto até {formatReadyDate(ready)}</span>
          )}
        </span>
      </p>
    );
  }
  return (
    <div
      className={`flex items-center gap-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6 ${className}`}
    >
      <span className="fx-eta-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--accent-ink)]">
        <IconCalendar className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-text)]">
          Prazo de produção
        </p>
        <p className="font-[family-name:var(--font-display)] text-xl font-semibold leading-tight sm:text-2xl">
          {ready ? (
            <>
              Pedidos feitos hoje ficam prontos até <span className="whitespace-nowrap">{formatReadyDate(ready)}</span>
            </>
          ) : (
            value
          )}
        </p>
        {ready && <p className="text-sm text-[var(--muted)]">Produção em {value}, a partir da confirmação.</p>}
      </div>
    </div>
  );
}

const noopSubscribe = () => () => {};

// Modo escuro automático: acompanha o celular/computador (inclusive quando o
// cliente troca com a página aberta).
const DARK_QUERY = "(prefers-color-scheme: dark)";
function subscribeDark(callback: () => void) {
  const mq = window.matchMedia?.(DARK_QUERY);
  mq?.addEventListener?.("change", callback);
  return () => mq?.removeEventListener?.("change", callback);
}
export function usePrefersDark(): boolean {
  return useSyncExternalStore(
    subscribeDark,
    () => window.matchMedia?.(DARK_QUERY).matches ?? false,
    () => false
  );
}

// Visualizador 3D: o componente <model-viewer> (Google) é carregado só quando
// algum produto tem modelo, e criado por código (não é um elemento do React).
const MODEL_VIEWER_SRC = "https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js";
let modelViewerLoading: Promise<void> | null = null;
function loadModelViewer(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.customElements?.get("model-viewer")) return Promise.resolve();
  if (!modelViewerLoading) {
    modelViewerLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.type = "module";
      script.src = MODEL_VIEWER_SRC;
      script.onload = () => resolve();
      script.onerror = () => {
        modelViewerLoading = null;
        reject(new Error("model-viewer"));
      };
      document.head.appendChild(script);
    });
  }
  return modelViewerLoading;
}

export function Model3D({ src, poster, alt }: { src: string; poster?: string; alt: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let viewer: HTMLElement | null = null;
    loadModelViewer()
      .then(() => {
        if (cancelled || !boxRef.current) return;
        viewer = document.createElement("model-viewer");
        viewer.setAttribute("src", src);
        if (poster) viewer.setAttribute("poster", poster);
        viewer.setAttribute("alt", alt);
        viewer.setAttribute("camera-controls", "");
        viewer.setAttribute("auto-rotate", "");
        viewer.setAttribute("touch-action", "pan-y");
        viewer.setAttribute("shadow-intensity", "1");
        viewer.setAttribute("exposure", "1.05");
        viewer.setAttribute("ar", "");
        viewer.setAttribute("ar-modes", "webxr scene-viewer quick-look");
        viewer.style.width = "100%";
        viewer.style.height = "100%";
        viewer.style.background = "transparent";
        viewer.addEventListener("load", () => !cancelled && setStatus("ready"));
        viewer.addEventListener("error", () => !cancelled && setStatus("error"));
        boxRef.current.appendChild(viewer);
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
      viewer?.remove();
    };
  }, [src, poster, alt]);

  return (
    <div className="relative h-full w-full">
      <div ref={boxRef} className="absolute inset-0" />
      {status !== "ready" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-[var(--muted)]">
          {status === "loading" ? (
            <>
              <span className="fx-cube-spin">
                <IconCube className="h-10 w-10 text-[var(--accent-text)]" />
              </span>
              Carregando modelo 3D…
            </>
          ) : (
            <>Não foi possível abrir o modelo 3D.</>
          )}
        </div>
      )}
      {status === "ready" && (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-[var(--muted)]">
          Arraste para girar · pinça para aproximar
        </p>
      )}
    </div>
  );
}

// Compartilhar o link do produto (WhatsApp, Instagram, copiar link…).
export function ShareProductButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title, text: title, url });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copie o link do produto:", url);
    }
  };
  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[var(--line)] px-6 text-sm font-semibold transition hover:border-[var(--accent)] hover:text-[var(--accent-text)]"
    >
      <IconShare className="h-4 w-4" />
      {copied ? "Link copiado!" : "Compartilhar produto"}
    </button>
  );
}

// Link direto do produto: a mesma página da loja com ?p=<id>.
export function productLink(id: string): string {
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.set("p", id);
  return url.toString();
}

// "Você também pode gostar": mesma categoria primeiro, depois destaques.
export function pickRelated(product: PublicProduct, all: PublicProduct[], limit = 4): PublicProduct[] {
  const others = all.filter((p) => p.id !== product.id && p.available);
  const shared = (p: PublicProduct) => p.category_ids.filter((c) => product.category_ids.includes(c)).length;
  return [...others]
    .map((p, i) => ({ p, score: shared(p) * 10 + (p.featured ? 3 : 0) + (p.photo_urls.length > 0 ? 1 : 0), i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.p);
}

export function RelatedProducts({
  products,
  onOpen,
}: {
  products: PublicProduct[];
  onOpen: (id: string) => void;
}) {
  if (products.length === 0) return null;
  return (
    <div className="space-y-3 border-t border-[var(--line)] pt-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-text)]">
        Você também pode gostar
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {products.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            className="group space-y-1.5 text-left"
          >
            <span className="relative block aspect-square overflow-hidden rounded-2xl bg-[var(--accent-soft)]">
              {p.photo_urls[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imgSrc(p.photo_urls[0], IMG_WIDTH.thumb)}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                />
              )}
            </span>
            <span className="line-clamp-2 block text-xs font-medium leading-snug">{p.name}</span>
            <span className="block text-xs text-[var(--muted)]">{priceLabel(p)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// "Instalar como app": Android/computador usam o pedido do próprio navegador;
// no iPhone mostra como adicionar à Tela de Início.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferredInstall: InstallEvent | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  // O navegador pode avisar antes deste código carregar: o layout da loja
  // guarda o aviso em window.__bip, e aqui ele é recuperado.
  const early = (window as Window & { __bip?: InstallEvent }).__bip;
  if (early) deferredInstall = early;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e as InstallEvent;
    installListeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    installListeners.forEach((l) => l());
  });
}
function subscribeInstall(cb: () => void) {
  installListeners.add(cb);
  return () => installListeners.delete(cb);
}
function installSnapshot(): "prompt" | "ios" | "manual" | "none" {
  // Já aberto como app: não mostra o botão.
  if (window.matchMedia?.("(display-mode: standalone)").matches) return "none";
  if ((navigator as Navigator & { standalone?: boolean }).standalone) return "none";
  if (deferredInstall) return "prompt";
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  // Sem o pedido automático do navegador (app já instalado, navegador que
  // não oferece, ou aviso ainda não chegou): mostra como instalar pelo menu.
  return isIos ? "ios" : "manual";
}

export function InstallAppButton({ storeName, className = "" }: { storeName: string; className?: string }) {
  const mode = useSyncExternalStore(subscribeInstall, installSnapshot, () => "none" as const);
  const [iosHelp, setIosHelp] = useState(false);
  if (mode === "none") return null;
  const onClick = async () => {
    if (mode === "ios" || mode === "manual") {
      setIosHelp((v) => !v);
      return;
    }
    const ev = deferredInstall;
    if (!ev) return;
    await ev.prompt();
    await ev.userChoice.catch(() => null);
    deferredInstall = null;
    installListeners.forEach((l) => l());
  };
  return (
    <div className={className}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-2 rounded-full border border-current px-4 py-2 text-xs font-semibold transition hover:-translate-y-0.5"
      >
        <IconDownload className="h-4 w-4" />
        Instalar app {storeName}
      </button>
      {iosHelp && mode === "ios" && (
        <p className="mt-2 max-w-xs text-xs opacity-80">
          No iPhone: toque em <strong>Compartilhar</strong> (quadrado com seta) e depois em{" "}
          <strong>Adicionar à Tela de Início</strong>.
        </p>
      )}
      {iosHelp && mode === "manual" && (
        <p className="mt-2 max-w-xs text-xs opacity-80">
          No menu do navegador (<strong>⋮</strong>), toque em <strong>Instalar app</strong> ou{" "}
          <strong>Adicionar à tela inicial</strong>. Se o app já estiver instalado, ele aparece na tela do celular.
        </p>
      )}
    </div>
  );
}

// Registra o service worker da loja (abre mais rápido e funciona sem internet
// com o que já foi visto). Só no site publicado.
export function useStoreServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
}
