"use client";

import { useCallback, useEffect, useState } from "react";
import type { StoreSlide } from "@/lib/store";
import { IconArrowRight, IconChevronLeft, IconChevronRight, IconWhatsapp, useSwipe } from "./ui";
import { IMG_WIDTH, imgSrc } from "@/lib/img";

const SLIDE_MS = 5500;
// Formato usado até a primeira foto carregar, e limites para fotos muito
// estreitas/largas não deixarem a capa alta demais ou fina demais.
const DEFAULT_RATIO = 16 / 9;
const MIN_RATIO = 1;
const MAX_RATIO = 3;

export function HeroSlider({
  slides,
  storeName,
  tagline,
  whatsappHref,
  onCatalog,
}: {
  slides: StoreSlide[];
  storeName: string;
  tagline: string;
  whatsappHref: string;
  onCatalog: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);

  // A capa assume o formato da primeira foto, então as seguintes não mudam a
  // altura da página no meio da troca.
  const measureFirst = useCallback((img: HTMLImageElement | null) => {
    if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) return;
    setRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, img.naturalWidth / img.naturalHeight)));
  }, []);
  const count = slides.length;

  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      setIndex(((next % count) + count) % count);
      setProgressKey((k) => k + 1);
    },
    [count]
  );

  useEffect(() => {
    if (count < 2 || paused) return;
    const id = setTimeout(() => go(index + 1), SLIDE_MS);
    return () => clearTimeout(id);
  }, [index, paused, count, go, progressKey]);

  const swipe = useSwipe(
    () => go(index + 1),
    () => go(index - 1)
  );

  const current = slides[index];
  // Só o texto escrito para o slide: o nome da loja já está no cabeçalho
  // (e normalmente na própria arte da capa), repetir aqui fica redundante.
  const title = current?.title ?? "";
  const subtitle = current?.subtitle ?? "";
  const hasText = Boolean(title || subtitle);

  return (
    <section
      aria-roledescription="carrossel"
      className="group relative isolate w-full overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.45)] lg:rounded-none lg:border-x-0 lg:border-t-0 lg:shadow-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => {
        setPaused(false);
        setProgressKey((k) => k + 1);
      }}
      onTouchStart={(e) => {
        setPaused(true);
        swipe.onTouchStart(e);
        e.stopPropagation();
      }}
      onTouchEnd={(e) => {
        swipe.onTouchEnd(e);
        setPaused(false);
        e.stopPropagation();
      }}
    >

      {/* Área da foto: tem o formato da própria foto, então nada é cortado.
          No celular o texto vem logo abaixo; do tablet pra cima, por cima. */}
      {/* No computador a altura é limitada à tela (menos o cabeçalho): a capa
          cabe inteira na primeira vista, e o fundo desfocado completa as laterais. */}
      <div
        className={`relative w-full overflow-hidden lg:max-h-[calc(100vh-8rem)] ${hasText ? "" : "cursor-pointer"}`}
        style={{ aspectRatio: String(ratio) }}
        // Capa sem texto (arte pronta, com o botão já desenhado): clicar abre o catálogo.
        onClick={() => {
          if (!hasText) onCatalog();
        }}
      >
      {slides.map((slide, i) => {
        // Slide enquadrado pelo lojista: a foto preenche a capa a partir do ponto
        // escolhido. Sem enquadramento: foto inteira, sem corte (como sempre foi).
        const framed = slide.x != null && slide.y != null;
        return (
        <div
          key={`${slide.url}-${i}`}
          aria-hidden={i !== index}
          className={`absolute inset-0 transition-opacity duration-[1100ms] ease-in-out ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* Fundo desfocado da própria foto: preenche as sobras quando o
              formato da foto não bate com o da capa (ex.: celular). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc(slide.url, IMG_WIDTH.hero)}
            alt=""
            aria-hidden
            loading={i === 0 ? "eager" : "lazy"}
            className={`absolute inset-0 h-full w-full scale-110 object-cover blur-2xl ${
              i === index ? "animate-kenburns" : ""
            }`}
          />
          {/* A foto em si: inteira (sem corte) ou enquadrada, se o lojista escolheu. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc(slide.url, IMG_WIDTH.hero)}
            alt={slide.title || storeName}
            loading={i === 0 ? "eager" : "lazy"}
            ref={i === 0 ? measureFirst : undefined}
            onLoad={i === 0 ? (e) => measureFirst(e.currentTarget) : undefined}
            className={`relative h-full w-full ${framed ? "object-cover" : "object-contain"}`}
            style={framed ? { objectPosition: `${slide.x}% ${slide.y}%` } : undefined}
          />
        </div>
        );
      })}

      {/* Sombra só na base e só quando o slide tem texto: a foto fica com as cores originais. */}
      {hasText && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-3/5 bg-gradient-to-t from-black/60 via-black/20 to-transparent sm:block" />
      )}
      </div>

      <div className={`relative px-5 pt-5 sm:absolute sm:bottom-0 sm:left-0 sm:right-0 sm:p-10 sm:pb-20 lg:mx-auto lg:max-w-[1600px] lg:px-14 lg:pb-24 ${count > 1 ? "pb-12" : "pb-5"} ${hasText ? "" : "sm:hidden"}`}>
        <div key={`${index}-${title}`} className={`max-w-2xl text-[var(--ink)] sm:text-white ${hasText ? "space-y-4" : ""}`}>
          {title ? (
            <h1
              className="animate-fade-up font-[family-name:var(--font-display)] text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
              style={{ animationDelay: "80ms" }}
            >
              {title}
            </h1>
          ) : (
            <h1 className="sr-only">
              {storeName}
              {tagline ? ` — ${tagline}` : ""}
            </h1>
          )}
          {subtitle && (
            <p
              className="max-w-xl animate-fade-up text-base text-[var(--muted)] sm:text-lg sm:text-white/85"
              style={{ animationDelay: "160ms" }}
            >
              {subtitle}
            </p>
          )}
          <div
            className={`flex animate-fade-up gap-2.5 sm:flex-wrap sm:gap-3 [&>*]:flex-1 [&>*]:justify-center sm:[&>*]:flex-none ${hasText ? "pt-2" : ""}`}
            style={{ animationDelay: "240ms" }}
          >
            <button
              onClick={onCatalog}
              className="fx-btn group/btn inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold sm:px-6 sm:py-3 text-[var(--accent-ink)] shadow-lg sm:bg-white sm:text-neutral-900 transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
            >
              Ver catálogo
              <IconArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
            </button>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[var(--line)] px-4 py-2.5 text-sm font-semibold sm:px-6 sm:py-3 text-[var(--ink)] transition hover:-translate-y-0.5 sm:border-white/40 sm:bg-black/25 sm:text-white sm:backdrop-blur-md sm:hover:bg-black/40"
            >
              <IconWhatsapp className="h-4 w-4" />
              <span className="whitespace-nowrap sm:hidden">WhatsApp</span>
              <span className="hidden whitespace-nowrap sm:inline">Falar no WhatsApp</span>
            </a>
          </div>
        </div>
      </div>

      {count > 1 && (
        <>
          <div className="absolute inset-x-5 bottom-5 flex items-center gap-2 sm:inset-x-10 sm:bottom-8 lg:left-1/2 lg:w-[min(560px,60%)] lg:-translate-x-1/2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => go(i)}
                aria-label={`Ir para o slide ${i + 1}`}
                className="relative h-1 flex-1 overflow-hidden rounded-full bg-[var(--line)] sm:bg-white/40"
              >
                {i < index && <span className="absolute inset-0 bg-[var(--accent)] sm:bg-white" />}
                {i === index && (
                  <span
                    key={progressKey}
                    className="absolute inset-0 origin-left animate-progress bg-[var(--accent)] sm:bg-white"
                    style={{ animationPlayState: paused ? "paused" : "running" }}
                  />
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => go(index - 1)}
            aria-label="Slide anterior"
            className="absolute left-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/25 text-white opacity-0 backdrop-blur-md transition hover:bg-black/45 group-hover:opacity-100 sm:flex"
          >
            <IconChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => go(index + 1)}
            aria-label="Próximo slide"
            className="absolute right-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/25 text-white opacity-0 backdrop-blur-md transition hover:bg-black/45 group-hover:opacity-100 sm:flex"
          >
            <IconChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </section>
  );
}
