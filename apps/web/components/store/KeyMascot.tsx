"use client";

// Key, a mascote da KeyStudio, no canto da loja: flutua de leve e mostra
// dicas num balão (tocar nela mostra a próxima). Sem voz: a voz da Key é a
// dos vídeos. Não incomoda: poucas dicas sozinha, some enquanto um
// produto/carrinho/busca está aberto e pode ser escondida.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const HIDE_KEY = "key-mascote-oculta";
const SEEN_KEY = "key-mascote-vista";
const AUTO_TIPS = 3; // dicas que ela mostra sozinha por visita

type Tip = { text: string; action?: "catalog" | "whatsapp" };

function tips(storeName: string): Tip[] {
  return [
    { text: `Oi! Eu sou a Key, a mascote da ${storeName}! 👋 Posso te ajudar?`, action: "catalog" },
    { text: "Sabia que dá pra imprimir quase tudo em 3D? Dá uma olhada nas nossas peças!", action: "catalog" },
    { text: "Tem uma ideia na cabeça? Manda pra gente no WhatsApp que a gente transforma em peça de verdade!", action: "whatsapp" },
    { text: "Procurando um presente diferente? Peças personalizadas são a nossa especialidade 💗", action: "whatsapp" },
    { text: "Eu nasci aqui, camada por camada, nas nossas impressoras 3D. Olha a tela no meu peito! 😄" },
  ];
}

export function KeyMascot({
  storeName,
  whatsappUrl,
  onOpenCatalog,
  paused,
}: {
  storeName: string;
  whatsappUrl: string;
  onOpenCatalog: () => void;
  // Produto, carrinho ou busca aberto: a Key sai de cena.
  paused: boolean;
}) {
  const list = useMemo(() => tips(storeName), [storeName]);
  const [visible, setVisible] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [bubble, setBubble] = useState<number | null>(null);
  const [hello, setHello] = useState(false);
  const autoShown = useRef(0);
  const next = useRef(0);

  // Entra depois da abertura da loja.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(HIDE_KEY)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHidden(true);
        return;
      }
    } catch {
      // sem armazenamento: segue
    }
    const t = window.setTimeout(() => setVisible(true), 4500);
    return () => window.clearTimeout(t);
  }, []);

  const show = useCallback((index: number) => {
    setBubble(index);
    setHello(true);
    window.setTimeout(() => setHello(false), 1400);
  }, []);

  // Primeira saudação e algumas dicas sozinha, sem exagero.
  useEffect(() => {
    if (!visible || hidden || paused) return;
    let seenBefore = false;
    try {
      seenBefore = !!window.localStorage.getItem(SEEN_KEY);
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // segue
    }
    if (autoShown.current === 0) {
      // Quem já conhece a Key começa direto por uma dica.
      next.current = seenBefore ? 1 + Math.floor(Math.random() * (list.length - 1)) : 0;
    }
    const first = window.setTimeout(() => {
      if (autoShown.current >= AUTO_TIPS) return;
      autoShown.current++;
      show(next.current);
      next.current = (next.current + 1) % list.length;
    }, autoShown.current === 0 ? 800 : 25000);
    return () => window.clearTimeout(first);
  }, [visible, hidden, paused, bubble, show, list.length]);

  // O balão some sozinho depois de um tempo.
  useEffect(() => {
    if (bubble === null) return;
    const t = window.setTimeout(() => setBubble(null), 9000);
    return () => window.clearTimeout(t);
  }, [bubble]);

  // Toque na Key: próxima dica.
  function onKeyClick() {
    const index = bubble === null ? next.current : (bubble + 1) % list.length;
    next.current = (index + 1) % list.length;
    autoShown.current = AUTO_TIPS; // o cliente assumiu: ela para de falar sozinha
    show(index);
  }

  function hide() {
    setHidden(true);
    try {
      window.sessionStorage.setItem(HIDE_KEY, "1");
    } catch {
      // segue
    }
  }

  if (hidden || !visible) return null;
  const tip = bubble === null ? null : list[bubble];

  return (
    <div
      className={`key-mascot fixed bottom-3 left-2 z-40 flex items-end gap-1 transition-all duration-500 sm:bottom-4 sm:left-4 ${
        paused ? "pointer-events-none translate-y-6 opacity-0" : "animate-key-in"
      }`}
    >
      <button
        type="button"
        onClick={onKeyClick}
        aria-label={`Key, a mascote da ${storeName}: tocar para ver uma dica`}
        className="relative shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 rounded-full"
      >
        <span className="key-glow" aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mascote/key.webp"
          alt=""
          width={360}
          height={488}
          draggable={false}
          className={`key-float block w-[78px] select-none drop-shadow-[0_10px_18px_rgba(120,60,80,0.35)] sm:w-[110px] ${hello ? "key-hello" : ""}`}
        />
      </button>

      {tip && (
        <div
          role="status"
          className="key-bubble relative mb-10 w-[min(230px,calc(100vw-170px))] rounded-2xl rounded-bl-sm border border-[var(--line)] bg-[var(--surface)] p-3 pr-7 text-[13px] leading-snug text-[var(--ink)] shadow-2xl sm:mb-14 sm:w-[270px] sm:text-sm"
        >
          <button
            type="button"
            onClick={() => setBubble(null)}
            aria-label="Fechar o balão"
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--accent-soft)]"
          >
            ×
          </button>
          <p>{tip.text}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {tip.action === "catalog" && (
              <button
                type="button"
                onClick={() => {
                  setBubble(null);
                  onOpenCatalog();
                }}
                className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-[var(--accent-ink)]"
              >
                Ver as peças
              </button>
            )}
            {tip.action === "whatsapp" && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-[#25d366] px-3 py-1 text-xs font-semibold text-white"
              >
                Chamar no WhatsApp
              </a>
            )}
            <button type="button" onClick={hide} className="ml-auto text-[11px] text-[var(--muted)] underline">
              Esconder a Key
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
