"use client";

// Abertura da loja (no estilo da abertura do Driver Booster): fundo preto, um
// cometa de luz cobre gira, o anel acende com faíscas e a logo surge num
// disco escuro no centro. Depois tudo se dissolve e a loja aparece.
//
// - Toda vez que o site abre: três voltas do anel e explosão (~3,6 s), e só
//   sai quando a loja já carregou (serve de tela de carregamento).
// - Clicar/tocar pula a abertura (quando a loja já carregou).
import { useEffect, useRef, useState } from "react";
import { IMG_WIDTH, imgSrc } from "@/lib/img";

const LOGO_KEY = "keystudio-abertura-logo";
// Três voltas (~2,6 s) + explosão que esmaece (~1 s); só então a loja abre.
const INTRO_MS = 3650;
const EXIT_MS = 650;
const MAX_WAIT_MS = 7000;

type Phase = "intro" | "loader" | "exit" | "done";

// Faíscas que saem do anel quando ele se fecha: ângulo e distância de cada uma.
const SPARKS = Array.from({ length: 28 }, (_, i) => ({
  angle: (360 / 28) * i + (i % 2 ? 7 : -5),
  distance: 70 + ((i * 47) % 90),
  delay: 2600 + ((i * 29) % 140),
  size: i % 4 === 0 ? 7 : i % 2 ? 4 : 5,
}));

export function SplashIntro({ logoUrl, name, ready }: { logoUrl?: string; name: string; ready: boolean }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [cachedLogo, setCachedLogo] = useState<string | null>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const startedAt = useRef(0);
  const minMs = useRef(INTRO_MS);

  // A abertura completa (três voltas e explosão) toca sempre que o site abre.
  useEffect(() => {
    startedAt.current = performance.now();
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCachedLogo(window.localStorage.getItem(LOGO_KEY));
    } catch {
      // navegação privada: segue sem a logo guardada
    }
  }, []);

  // Guarda a logo para a próxima abertura já começar com ela.
  useEffect(() => {
    if (!logoUrl) return;
    try {
      window.localStorage.setItem(LOGO_KEY, logoUrl);
    } catch {
      // sem armazenamento: tudo bem
    }
  }, [logoUrl]);

  // Sai quando a loja carregou e a animação mínima terminou (ou no tempo máximo).
  useEffect(() => {
    if (phase === "exit" || phase === "done") return;
    const elapsed = startedAt.current ? performance.now() - startedAt.current : 0;
    const wait = ready ? Math.max(0, minMs.current - elapsed) : Math.max(0, MAX_WAIT_MS - elapsed);
    const id = setTimeout(() => setPhase("exit"), wait);
    return () => clearTimeout(id);
  }, [ready, phase]);

  useEffect(() => {
    if (phase !== "exit") return;
    const id = setTimeout(() => setPhase("done"), EXIT_MS);
    return () => clearTimeout(id);
  }, [phase]);

  // Trava a rolagem da página enquanto a abertura está na tela.
  useEffect(() => {
    if (phase === "done") return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [phase]);

  if (phase === "done") return null;

  const logo = logoUrl || cachedLogo || "";
  const loader = phase === "loader";

  return (
    <div
      role="presentation"
      aria-hidden
      onClick={() => ready && setPhase("exit")}
      className={`moria-splash ${loader ? "is-loader" : "is-intro"} ${phase === "exit" ? "is-exit" : ""}`}
    >
      <div className="moria-splash-stage">
        {/* Anel feito só de camadas que giram e esmaecem (transform/opacity):
            a placa de vídeo anima sozinha, sem travar enquanto a loja monta. */}
        <div className="ms-ring">
          <div className="ms-track" />
          <div className="ms-thin" />
          <div className="ms-spin">
            <div className="ms-arc ms-glow" />
            <div className="ms-arc" />
            <span className="ms-head" />
          </div>
          <div className="ms-full">
            <div className="ms-solid ms-glow" />
            <div className="ms-solid" />
          </div>
          <div className="ms-halo" />
          {/* explosão: duas ondas de luz que se expandem quando o anel fecha */}
          <div className="ms-wave" />
          <div className="ms-wave ms-wave-2" />
        </div>

        {!loader &&
          SPARKS.map((s, i) => (
            <span
              key={i}
              className="moria-splash-spark"
              style={
                {
                  "--a": `${s.angle}deg`,
                  "--d": `${s.distance}px`,
                  "--s": `${s.size}px`,
                  animationDelay: `${s.delay}ms`,
                } as React.CSSProperties
              }
            />
          ))}

        <div className="moria-splash-disc">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc(logo, IMG_WIDTH.thumb)}
              alt=""
              onLoad={() => setLogoLoaded(true)}
              className={`moria-splash-logo ${logoLoaded ? "is-loaded" : ""}`}
            />
          ) : (
            <span className="moria-splash-initial">{name.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
      </div>
      <p className="moria-splash-name">{name}</p>
    </div>
  );
}
