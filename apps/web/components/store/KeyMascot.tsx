"use client";

// Key, a mascote da KeyStudio, no canto da loja: flutua de leve, mostra
// dicas num balão e fala em voz alta (voz do próprio navegador, sem custo)
// quando o cliente toca nela ou no 🔊. Não incomoda: poucas dicas sozinha,
// some enquanto um produto/carrinho/busca está aberto e pode ser escondida.
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

// Texto falado: sem emojis e com a pronúncia certa.
function spoken(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/KeyStudio\s*3D/gi, "Kí Estúdio três dê")
    .replace(/KeyStudio/gi, "Kí Estúdio")
    .replace(/3D/g, "três dê")
    .trim();
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const br = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("pt-br"));
  const pt = br.length ? br : voices.filter((v) => v.lang.toLowerCase().startsWith("pt"));
  // Prefere vozes femininas conhecidas (Windows, Android, Apple, Google).
  return (
    pt.find((v) => /francisca|luciana|maria|vit[oó]ria|thalita|leila|female|feminina/i.test(v.name)) ??
    pt.find((v) => /google/i.test(v.name)) ??
    pt[0]
  );
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
  const [talking, setTalking] = useState(false);
  const [hello, setHello] = useState(false);
  const autoShown = useRef(0);
  const next = useRef(0);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

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

  // O balão some sozinho depois de um tempo (se ela não estiver falando).
  useEffect(() => {
    if (bubble === null || talking) return;
    const t = window.setTimeout(() => setBubble(null), 9000);
    return () => window.clearTimeout(t);
  }, [bubble, talking]);

  // Fecha a fala ao sair de cena.
  useEffect(() => {
    if ((paused || hidden) && canSpeak) window.speechSynthesis.cancel();
  }, [paused, hidden, canSpeak]);
  useEffect(() => () => {
    if (canSpeak) window.speechSynthesis.cancel();
  }, [canSpeak]);

  const speak = useCallback(
    (index: number) => {
      if (!canSpeak) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(spoken(list[index].text));
      u.lang = "pt-BR";
      const voice = pickVoice();
      if (voice) u.voice = voice;
      u.pitch = 1.35; // voz mais fofinha
      u.rate = 1.05;
      u.onstart = () => setTalking(true);
      u.onend = () => setTalking(false);
      u.onerror = () => setTalking(false);
      synth.speak(u);
    },
    [canSpeak, list]
  );

  // Toque na Key: próxima dica, falando.
  function onKeyClick() {
    const index = bubble === null ? next.current : (bubble + 1) % list.length;
    next.current = (index + 1) % list.length;
    autoShown.current = AUTO_TIPS; // o cliente assumiu: ela para de falar sozinha
    show(index);
    speak(index);
  }

  function hide() {
    if (canSpeak) window.speechSynthesis.cancel();
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
        aria-label={`Key, a mascote da ${storeName}: tocar para ouvir uma dica`}
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
          className={`key-float block w-[78px] select-none drop-shadow-[0_10px_18px_rgba(120,60,80,0.35)] sm:w-[110px] ${
            talking ? "key-talk" : hello ? "key-hello" : ""
          }`}
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
            {canSpeak && (
              <button
                type="button"
                onClick={() => (talking ? (window.speechSynthesis.cancel(), setTalking(false)) : speak(bubble!))}
                aria-label={talking ? "Parar a voz" : "Ouvir a Key"}
                className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs"
              >
                {talking ? "⏹ Parar" : "🔊 Ouvir"}
              </button>
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
