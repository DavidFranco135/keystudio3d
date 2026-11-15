"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import type { CartLine, OrderLine, PublicProduct, PublicStore, StoreSlide } from "@/lib/store";
import { PAYMENT_TERMS, computeTotals, darkVariant, promoNotices, unitPrice, formatWhatsappDisplay, priceLabel, themeVars, whatsappLink } from "@/lib/store";
import { focusStyle } from "@/lib/focus";
import { matchesSearch } from "@/lib/search";
import { trackStoreEvent, useVisitTracker } from "@/lib/visits";
import { CartDrawer, type CustomerInfo } from "./CartDrawer";
import { FeaturedSlider } from "./FeaturedSlider";
import { SearchOverlay } from "./SearchOverlay";
import { useStoreFx } from "./fx";
import { HeroSlider } from "./HeroSlider";
import { SplashIntro } from "./SplashIntro";
import { ProductCard } from "./ProductCard";
import { ProductModal } from "./ProductModal";
import {
  IconArrowRight,
  IconCart,
  IconCheck,
  IconClose,
  IconClock,
  IconInstagram,
  IconPin,
  IconSearch,
  IconSparkle,
  IconWhatsapp,
  Reveal,
  useSwipe,
} from "./ui";
import { IMG_WIDTH, imgSrc } from "@/lib/img";
import {
  InstallAppButton,
  ProductionEta,
  PromoBanner,
  TrustBadges,
  pickRelated,
  productLink,
  usePrefersDark,
  useStoreServiceWorker,
} from "./extras";

const TABS = ["Início", "Catálogo", "Como pedir", "Contato"] as const;

// Texto da seção "Quem somos" (ao lado da foto da Keyla).
const QUEM_SOMOS_PARAGRAPHS = [
  "Olá! Sou a Keyla, esposa do David, e juntos começamos a Key Studio 3D, um projeto que nasceu do nosso desejo de transformar ideias em realidade. Trabalhamos com impressão 3D, criando produtos personalizados, criativos e feitos para tornar cada detalhe especial.",
  "Aqui, cada ideia ganha forma e cada criação carrega um pouquinho de nós. Seja bem-vindo(a) ao nosso mundo!",
];

function useStoredState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) setValue(JSON.parse(raw) as T);
      } catch {
        // ignore corrupt/blocked storage
      }
      loaded.current = true;
    }, 0);
    return () => clearTimeout(id);
  }, [key]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage unavailable
    }
  }, [key, value]);

  return [value, setValue];
}

function TabBar({
  tab,
  onChange,
  catalogCount,
  className = "",
}: {
  tab: number;
  onChange: (index: number) => void;
  catalogCount: number;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[tab];
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    // Fonts load after first paint and change the tab widths.
    document.fonts?.ready.then(measure);
    return () => window.removeEventListener("resize", measure);
  }, [tab]);

  return (
    <div
      role="tablist"
      className={`relative inline-flex rounded-full border border-[var(--line)] bg-[var(--surface-glass)] p-1 shadow-sm backdrop-blur ${className}`}
    >
      <span
        aria-hidden
        className="absolute bottom-1 top-1 rounded-full bg-[var(--accent)] shadow-md transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ left: pill.left, width: pill.width }}
      />
      {TABS.map((label, i) => (
        <button
          key={label}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          aria-selected={tab === i}
          onClick={() => onChange(i)}
          className={`relative z-10 flex-1 whitespace-nowrap rounded-full px-2 py-2 text-[12.5px] font-semibold transition-colors duration-300 min-[400px]:px-3.5 min-[400px]:text-[13px] sm:px-5 sm:text-sm ${
            tab === i ? "text-[var(--accent-ink)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          {label}
          {i === 1 && catalogCount > 0 && (
            <span
              className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                tab === i ? "bg-white/25" : "bg-[var(--accent-soft)] text-[var(--accent-text)]"
              }`}
            >
              {catalogCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// Faixa de avisos que passa devagar no topo (condição de pagamento). O texto
// é repetido para o giro não ter emenda; para ao passar o mouse.
function AnnouncementBar({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  const run = (hidden: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((t, i) => (
        <span key={i} className="flex items-center whitespace-nowrap">
          <span className="px-6">{t}</span>
          <span className="opacity-50">✦</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="fx-marquee bg-[var(--accent)] text-[var(--accent-ink)]">
      <div className="overflow-hidden">
        <div className="fx-marquee-track flex w-max py-2 text-[11px] font-medium uppercase tracking-[0.18em]">
          {run(false)}
          {run(true)}
          {run(true)}
          {run(true)}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="space-y-2">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-text)]">
            {eyebrow}
          </p>
        )}
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

// Esqueleto com o formato da loja (cabeçalho, capa, busca e cards com texto)
// enquanto os dados chegam: a página "aparece" na hora, sem tela vazia.
function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[var(--line)] ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent" />
    </div>
  );
}

function SkeletonStore() {
  return (
    <div aria-busy="true" aria-label="Carregando a loja">
      <div className="h-8 bg-[var(--line)] opacity-60" />
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Shimmer className="h-11 w-11 rounded-2xl" />
          <Shimmer className="h-4 w-28 rounded-full" />
        </div>
        <Shimmer className="hidden h-10 w-80 rounded-full md:block" />
        <Shimmer className="h-10 w-24 rounded-full" />
      </div>
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6">
        <Shimmer className="h-[46vh] rounded-[28px]" />
        <Shimmer className="h-14 rounded-full" />
        <Shimmer className="h-8 w-56 rounded-full" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 overflow-hidden rounded-3xl border border-[var(--line)] pb-4">
              <Shimmer className="aspect-[4/5]" />
              <Shimmer className="mx-4 h-3.5 w-3/4 rounded-full" />
              <div className="mx-4 flex items-center justify-between">
                <Shimmer className="h-5 w-16 rounded-full" />
                <Shimmer className="h-9 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// No site publicado os dados vêm do cache da Cloudflare (functions/loja-data.js),
// que responde na hora; se essa função falhar, busca direto no servidor.
async function loadPublicStore(slug: string): Promise<PublicStore> {
  if (process.env.NODE_ENV === "production") {
    try {
      const res = await fetch(`/loja-data?s=${encodeURIComponent(slug)}`);
      if (res.ok) return (await res.json()) as PublicStore;
      if (res.status === 404) throw new ApiError(404, "Loja não encontrada.");
    } catch (err) {
      if (err instanceof ApiError) throw err;
    }
  }
  return apiFetch<PublicStore>(`/api/v1/public/stores/${encodeURIComponent(slug)}`);
}

export function Storefront({ slug }: { slug: string }) {
  // Conta a visita e o "online agora" (anônimo, sem IP) — aparece em Minha Loja.
  useVisitTracker(slug);
  const [store, setStore] = useState<PublicStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const [dir, setDir] = useState(1);
  const [lines, setLines] = useStoredState<CartLine[]>(`loja-cart-${slug}`, []);
  const [customer, setCustomer] = useStoredState<CustomerInfo>(`loja-customer-${slug}`, {
    name: "",
    extra: "",
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  // Conta a abertura do produto (alimenta "Produtos mais vistos" em Minha Loja).
  useEffect(() => {
    if (openProductId) trackStoreEvent(slug, "product_view", openProductId);
  }, [slug, openProductId]);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"relevance" | "price-asc" | "price-desc" | "name">("relevance");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [question, setQuestion] = useState({ name: "", text: "" });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useStoreFx(rootRef, store !== null);
  useStoreServiceWorker();
  const prefersDark = usePrefersDark();

  // Link direto do produto (?p=<id>): abre o produto assim que a loja carrega.
  // O ?p= sai do endereço de base para "voltar" não reabrir o mesmo produto.
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (!store || deepLinkDone.current) return;
    deepLinkDone.current = true;
    const url = new URL(window.location.href);
    const wanted = url.searchParams.get("p");
    if (!wanted) return;
    url.searchParams.delete("p");
    window.history.replaceState(window.history.state, "", url.toString());
    if (store.products.some((p) => p.id === wanted)) setTimeout(() => setOpenProductId(wanted), 0);
  }, [store]);

  // Produto aberto: o endereço vira o link do produto (para copiar/compartilhar)
  // e o título da aba mostra o nome dele.
  useEffect(() => {
    if (!openProductId || !store) return;
    const product = store.products.find((p) => p.id === openProductId);
    window.history.replaceState(window.history.state, "", productLink(openProductId));
    const previous = document.title;
    if (product) document.title = `${product.name} · ${store.settings.display_name || store.name}`;
    return () => {
      document.title = previous;
    };
  }, [openProductId, store]);

  useEffect(() => {
    let cancelled = false;
    loadPublicStore(slug)
      .then((data) => {
        if (cancelled) return;
        // Um servidor mais antigo que o site não manda as categorias; sem
        // isso a loja quebraria inteira em vez de só não mostrá-las.
        setStore({
          ...data,
          settings: {
            ...data.settings,
            categories: (data.settings.categories ?? []).map((c) => ({
              ...c,
              cover_url: c.cover_url ?? "",
            })),
          },
          products: data.products.map((p) => ({
            ...p,
            category_ids: p.category_ids ?? [],
            price_on_request: p.price_on_request ?? false,
          })),
        });
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof ApiError && err.status === 404
              ? "Loja não encontrada."
              : "Não foi possível carregar a loja agora. Tente novamente em instantes."
          );
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (store) document.title = `${store.settings.display_name} · Catálogo`;
  }, [store]);

  const productsById = useMemo(() => {
    const map = new Map<string, PublicProduct>();
    store?.products.forEach((p) => map.set(p.id, p));
    return map;
  }, [store]);

  const orderLines: OrderLine[] = useMemo(
    () =>
      lines
        .map((l) => ({ product: productsById.get(l.id), qty: l.qty, note: l.note }))
        .filter((l): l is OrderLine => !!l.product && l.product.available),
    [lines, productsById]
  );
  const units = orderLines.reduce((sum, l) => sum + l.qty, 0);
  const discountRules = useMemo(
    () => ({ tiers: store?.settings.cart_tiers ?? [], stack: !!store?.settings.discounts_stack }),
    [store]
  );
  const total = computeTotals(orderLines, discountRules).total;

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const clampQty = (id: string, qty: number) => {
    const max = productsById.get(id)?.stock_quantity ?? 99;
    return Math.min(max, qty);
  };

  const setLine = useCallback(
    (id: string, qty: number, note?: string) => {
      setLines((prev) => {
        const existing = prev.find((l) => l.id === id);
        const nextQty = clampQty(id, qty);
        if (nextQty <= 0) return prev.filter((l) => l.id !== id);
        if (existing)
          return prev.map((l) =>
            l.id === id ? { ...l, qty: nextQty, note: note ?? l.note } : l
          );
        return [...prev, { id, qty: nextQty, note: note ?? "" }];
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setLines, productsById]
  );

  const tabRef = useRef(0);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  // Lembra a aba (o celular pode recarregar a página quando o cliente vai a
  // outro app; ao voltar, continua onde estava).
  const tabKey = `loja-tab-${slug}`;
  const tabRestored = useRef(false);
  useEffect(() => {
    const id = setTimeout(() => {
      tabRestored.current = true;
      try {
        const saved = Number(window.sessionStorage.getItem(tabKey));
        if (saved > 0 && saved < TABS.length) {
          setTab(saved);
          window.history.replaceState({ tab: saved }, "");
        }
      } catch {
        // armazenamento indisponível
      }
    }, 0);
    return () => clearTimeout(id);
  }, [tabKey]);
  useEffect(() => {
    // Só grava depois de ler o valor salvo (senão a aba inicial o apagaria).
    if (!tabRestored.current) return;
    try {
      window.sessionStorage.setItem(tabKey, String(tab));
    } catch {
      // armazenamento indisponível
    }
  }, [tab, tabKey]);

  const goTab = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(TABS.length - 1, next));
      if (clamped === tab) return;
      setDir(clamped > tab ? 1 : -1);
      setTab(clamped);
      // One history entry per tab, so "back" returns to the previous tab
      // instead of leaving the store.
      window.history.pushState({ tab: clamped }, "");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [tab]
  );

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      if (event.state?.overlay) return;
      const target = typeof event.state?.tab === "number" ? event.state.tab : 0;
      if (target === tabRef.current) return;
      setDir(target > tabRef.current ? 1 : -1);
      setTab(target);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const swipe = useSwipe(
    () => goTab(tab + 1),
    () => goTab(tab - 1)
  );

  const filtered = useMemo(() => {
    if (!store) return [];
    let list = store.products.filter(
      (p) =>
        matchesSearch(search, p.name, p.description) &&
        (!onlyAvailable || p.available) &&
        (!category || p.category_ids.includes(category))
    );
    const byRequest = (a: PublicProduct, b: PublicProduct) =>
      Number(a.price_on_request) - Number(b.price_on_request);
    if (sort === "price-asc") list = [...list].sort((a, b) => byRequest(a, b) || unitPrice(a) - unitPrice(b));
    else if (sort === "price-desc") list = [...list].sort((a, b) => byRequest(a, b) || unitPrice(b) - unitPrice(a));
    else if (sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    // "Relevância": a ordem escolhida pelo lojista em Minha Loja (já vem do servidor).
    return list;
  }, [store, search, sort, onlyAvailable, category]);

  // A abertura fica sempre na primeira posição: assim ela não reinicia quando
  // a loja termina de carregar (o resto da página troca por baixo dela).
  const splash = (
    <SplashIntro
      logoUrl={store?.settings.logo_url || undefined}
      name={store?.settings.display_name || store?.name || "KeyStudio3D"}
      ready={store !== null || error !== null}
    />
  );

  if (error) {
    return (
      <>
      {splash}
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 text-center text-neutral-700">
        <div className="space-y-2">
          <p className="text-2xl font-semibold">{error}</p>
          <p className="text-sm text-neutral-500">Confira o endereço do link da loja.</p>
        </div>
      </div>
      </>
    );
  }

  const settings = store?.settings;
  // Modo escuro automático: no celular/computador escuro, usa o preto e cobre.
  const effectiveTheme =
    settings?.auto_dark && prefersDark ? darkVariant(settings.theme) : (settings?.theme ?? "light");
  const vars = themeVars(settings?.accent ?? "indigo", effectiveTheme);

  if (!store || !settings) {
    return (
      <>
        {splash}
        <div style={themeVars("copper", "keystudio")} className="min-h-screen bg-[var(--bg)]">
          <SkeletonStore />
        </div>
      </>
    );
  }

  const storeName = settings.display_name || store.name;
  const waGeneral = whatsappLink(
    settings.whatsapp,
    `Olá, ${storeName}! Gostaria de saber mais sobre os produtos.`
  );
  const openProduct = openProductId ? productsById.get(openProductId) ?? null : null;
  // Todos os destaques marcados, na ordem escolhida pelo lojista. (Antes a lista
  // era cortada em 8 e seguia a ordem de cadastro, por isso "sumiam" destaques.)
  // Só quando não há nenhum destaque mostramos os primeiros produtos.
  const featuredProducts = (() => {
    const flagged = store.products.filter((p) => p.featured);
    if (flagged.length === 0) return store.products.slice(0, 8);
    const order = settings.featured_product_ids;
    if (!order || order.length === 0) return flagged;
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...flagged].sort(
      (a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
  })();
  const slides: StoreSlide[] =
    settings.slides.length > 0
      ? settings.slides
      : store.products
          .filter((p) => p.photo_urls.length > 0)
          .slice(0, 5)
          .map((p) => ({ url: p.photo_urls[0], title: p.name, subtitle: priceLabel(p) }));

  const categories = settings.categories.map((c) => {
    const items = store.products.filter((p) => p.category_ids.includes(c.id));
    // Foto principal escolhida pelo lojista; sem escolha, a primeira foto dos produtos.
    const chosen = c.cover_url || "";
    const fallback = items.find((p) => p.photo_urls.length > 0) ?? null;
    const coverUrl = chosen || fallback?.photo_urls[0] || "";
    // Foto escolhida: usa o enquadramento definido na categoria. Automática: usa o
    // enquadramento do produto dono da foto.
    const coverStyle = chosen
      ? { objectPosition: `${c.cover_x ?? 50}% ${c.cover_y ?? 50}%` }
      : focusStyle(fallback?.photo_focus, coverUrl);
    return { ...c, count: items.length, coverUrl, coverStyle };
  });
  const activeCategory = categories.find((c) => c.id === category) ?? null;

  const openCategory = (id: string | null) => {
    setCategory(id);
    goTab(1);
  };

  // Lupa do cabeçalho: vai para o Catálogo e já deixa o cursor na busca.
  // Lupa do cabeçalho / barra da página inicial: abre a pesquisa geral.
  const openSearch = () => setSearchOpen(true);

  // "Ver todos no catálogo": fecha a pesquisa e mostra o catálogo filtrado.
  // O pequeno atraso deixa o "voltar" do fechamento terminar antes de trocar de aba.
  const seeAllResults = (term: string) => {
    setSearch(term);
    setCategory(null);
    setSearchOpen(false);
    setTimeout(() => {
      goTab(1);
      window.scrollTo({ top: 0 });
    }, 80);
  };

  const qtyOf = (id: string) => lines.find((l) => l.id === id)?.qty ?? 0;

  const cardFor = (product: PublicProduct) => (
    <ProductCard
      key={product.id}
      product={product}
      qty={qtyOf(product.id)}
      onOpen={() => setOpenProductId(product.id)}
      onAdd={() => {
        setLine(product.id, 1);
        showToast(`${product.name} adicionado ao pedido`);
      }}
      onChangeQty={(q) => setLine(product.id, q)}
    />
  );

  const steps = [
    { title: "Escolha seus produtos", text: "Navegue pelo catálogo e toque no produto para ver fotos, tamanho e detalhes." },
    { title: "Monte seu pedido", text: "Adicione ao pedido, ajuste a quantidade e escreva informações como cor ou personalização." },
    { title: "Envie pelo WhatsApp", text: "Um toque e o pedido completo vai pronto para o nosso WhatsApp, sem cadastro." },
    { title: "Combine e receba", text: "Confirmamos valor final, prazo, pagamento e entrega com você." },
  ];

  return (
    <>
    {splash}
    <div
      style={vars}
      ref={rootRef}
      className="store-fx fx-texture min-h-screen overflow-x-clip bg-[var(--bg)] font-[family-name:var(--font-sans)] text-[var(--ink)] antialiased selection:bg-[var(--accent)] selection:text-[var(--accent-ink)]"
    >
      <header className="fx-header sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--bg-glass)] backdrop-blur-xl">
        <AnnouncementBar
          items={[
            ...promoNotices(settings),
            PAYMENT_TERMS,
            "Pedidos pelo WhatsApp, sem cadastro",
            ...(settings.production_days?.trim() ? [`Prazo de produção: ${settings.production_days.trim()}`] : []),
          ]}
        />
        <div className="fx-head-row mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button onClick={() => goTab(0)} className="flex min-w-0 items-center gap-3 text-left">
            {settings.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgSrc(settings.logo_url, IMG_WIDTH.thumb)}
                alt={storeName}
                className="fx-logo h-11 w-11 shrink-0 rounded-2xl object-cover shadow-md"
              />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--accent-ink)] shadow-md">
                {storeName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate font-[family-name:var(--font-display)] text-lg font-semibold leading-tight">
                {storeName}
              </span>
              {settings.tagline && (
                <span className="hidden truncate text-xs text-[var(--muted)] sm:block">{settings.tagline}</span>
              )}
            </span>
          </button>

          <TabBar tab={tab} onChange={goTab} catalogCount={store.products.length} className="hidden md:inline-flex" />

          <div className="flex items-center gap-2">
            <button
              onClick={openSearch}
              aria-label="Buscar produto"
              title="Buscar produto"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent-text)] active:scale-95"
            >
              <IconSearch className="h-5 w-5" />
            </button>
            <a
              href={waGeneral}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Falar no WhatsApp"
              className="hidden h-10 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold transition hover:border-[#25d366] hover:text-[#25d366] sm:inline-flex"
            >
              <IconWhatsapp className="h-4 w-4 text-[#25d366]" />
              WhatsApp
            </a>
            <button
              onClick={() => setCartOpen(true)}
              aria-label="Abrir pedido"
              className="fx-btn relative flex h-10 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <IconCart className="h-5 w-5" />
              <span className="hidden sm:inline">Pedido</span>
              {units > 0 && (
                <span
                  key={units}
                  className="ml-0.5 animate-pop rounded-full bg-white px-2 py-0.5 text-xs font-bold text-neutral-900"
                >
                  {units}
                </span>
              )}
            </button>
          </div>
        </div>
        <div className="px-4 pb-3 md:hidden">
          <TabBar tab={tab} onChange={goTab} catalogCount={store.products.length} className="flex w-full" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-32 pt-6 sm:px-6 sm:pt-8" {...swipe}>
        <div key={tab} className={dir >= 0 ? "animate-slide-in-right" : "animate-slide-in-left"}>
          {tab === 0 && (
            <div className="space-y-20 sm:space-y-28">
              <div className="space-y-10 sm:space-y-14">
                <div className="lg:relative lg:left-1/2 lg:-mt-8 lg:w-screen lg:-translate-x-1/2">
                  <HeroSlider
                    slides={slides}
                    storeName={storeName}
                    tagline={settings.tagline}
                    whatsappHref={waGeneral}
                    onCatalog={() => openCategory(null)}
                  />
                </div>

                <button
                  onClick={openSearch}
                  className="group flex h-14 w-full items-center gap-3 rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 text-left text-[var(--muted)] shadow-sm transition hover:border-[var(--accent)] hover:shadow-md active:scale-[0.99] sm:h-16"
                >
                  <IconSearch className="h-5 w-5 shrink-0 text-[var(--accent-text)]" />
                  <span className="flex-1 truncate text-sm sm:text-base">O que você está procurando?</span>
                  <span className="hidden shrink-0 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-ink)] transition group-hover:brightness-110 sm:inline">
                    Pesquisar
                  </span>
                </button>

                <TrustBadges badges={settings.trust_badges} />

                <PromoBanner notices={promoNotices(settings)} stack={!!settings.discounts_stack} />

                {featuredProducts.length > 0 && (
                  <section className="space-y-6">
                    <SectionTitle
                      eyebrow="Seleção"
                      title="Destaques da loja"
                      action={
                        <button
                          onClick={() => openCategory(null)}
                          className="group hidden items-center gap-2 text-sm font-semibold text-[var(--accent-text)] sm:inline-flex"
                        >
                          Ver catálogo completo
                          <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </button>
                      }
                    />
                    <FeaturedSlider>{featuredProducts.map((p) => cardFor(p))}</FeaturedSlider>
                  </section>
                )}
              </div>

              {categories.length > 0 && (
                <section className="space-y-8">
                  <Reveal>
                    <SectionTitle eyebrow="Navegue" title="Categorias" />
                  </Reveal>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
                    {categories.map((c, i) => (
                      <Reveal key={c.id} delay={(i % 4) * 80}>
                        <button
                          onClick={() => openCategory(c.id)}
                          className="fx-spotlight group relative flex aspect-[5/4] w-full overflow-hidden rounded-3xl bg-[var(--accent)] text-left shadow-sm transition duration-500 hover:-translate-y-1 hover:shadow-xl"
                        >
                          {c.coverUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imgSrc(c.coverUrl, IMG_WIDTH.card)}
                              alt=""
                              loading="lazy"
                              style={c.coverStyle}
                              className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.07]"
                            />
                          )}
                          <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                          <span className="relative mt-auto block p-4 text-white sm:p-5">
                            <span className="block font-[family-name:var(--font-display)] text-lg font-semibold leading-tight sm:text-xl">
                              {c.name}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 text-xs text-white/80">
                              {c.count} {c.count === 1 ? "produto" : "produtos"}
                              <IconArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                            </span>
                          </span>
                        </button>
                      </Reveal>
                    ))}
                  </div>
                </section>
              )}

              <Reveal>
                <section
                  aria-labelledby="quem-somos"
                  className="grid items-center gap-8 overflow-hidden rounded-[32px] border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-8 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] md:gap-12 lg:p-12"
                >
                  {/* Foto inteira (sem corte), no formato dela. */}
                  <picture className="mx-auto block w-full max-w-sm overflow-hidden rounded-[24px] bg-[var(--accent-soft)] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.45)] md:max-w-none">
                    <source srcSet="/brand/quem-somos-keyla.webp?v=2" type="image/webp" />
                    <img
                      src="/brand/quem-somos-keyla.jpg?v=2"
                      alt="Keyla, da KeyStudio3D"
                      width={1200}
                      height={1600}
                      loading="lazy"
                      className="block h-auto w-full"
                    />
                  </picture>
                  <div className="space-y-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-text)]">
                      Quem somos
                    </p>
                    <div className="space-y-1">
                      <p className="font-[family-name:var(--font-display)] text-2xl italic text-[var(--accent-text)] sm:text-3xl">
                        Oi, prazer!
                      </p>
                      <h2
                        id="quem-somos"
                        className="font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight sm:text-5xl"
                      >
                        Eu sou a Keyla
                      </h2>
                    </div>
                    <div className="space-y-4 text-base leading-relaxed text-[var(--muted)] sm:text-lg">
                      {QUEM_SOMOS_PARAGRAPHS.map((t) => (
                        <p key={t}>{t}</p>
                      ))}
                    </div>
                    <p className="text-sm font-medium text-[var(--accent-text)]">
                      KeyStudio3D · Feito com amor · Criado do zero
                    </p>
                  </div>
                </section>
              </Reveal>

              {settings.production_days?.trim() && (
                <Reveal>
                  <ProductionEta text={settings.production_days} />
                </Reveal>
              )}

              {settings.highlights.some((h) => h.title) && (
                <div className="grid gap-4 sm:grid-cols-3">
                  {settings.highlights
                    .filter((h) => h.title)
                    .map((h, i) => (
                      <Reveal key={i} delay={i * 90}>
                        <div className="h-full rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 transition duration-500 hover:-translate-y-1 hover:shadow-xl">
                          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
                            <IconSparkle className="h-5 w-5" />
                          </div>
                          <h3 className="mb-1.5 font-semibold">{h.title}</h3>
                          <p className="text-sm leading-relaxed text-[var(--muted)]">{h.text}</p>
                        </div>
                      </Reveal>
                    ))}
                </div>
              )}

              {settings.about && (
                <Reveal>
                  <section className="grid gap-8 rounded-[32px] border border-[var(--line)] bg-[var(--surface)] p-8 sm:p-12 lg:grid-cols-[1fr_1.4fr]">
                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-text)]">
                        Sobre nós
                      </p>
                      <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
                        Feito com cuidado, do projeto à entrega.
                      </h2>
                    </div>
                    <p className="whitespace-pre-line text-base leading-relaxed text-[var(--muted)]">
                      {settings.about}
                    </p>
                  </section>
                </Reveal>
              )}

              <Reveal>
                <section className="relative overflow-hidden rounded-[32px] bg-[var(--accent)] p-8 text-[var(--accent-ink)] sm:p-14">
                  <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
                  <div className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
                    <div className="max-w-xl space-y-2">
                      <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
                        Não achou o que procurava?
                      </h2>
                      <p className="opacity-85">Fale com a gente: criamos peças sob medida e personalizadas.</p>
                    </div>
                    <a
                      href={waGeneral}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="fx-btn inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-neutral-900 shadow-xl transition hover:-translate-y-0.5"
                    >
                      <IconWhatsapp className="h-5 w-5 text-[#25d366]" />
                      Chamar no WhatsApp
                    </a>
                  </div>
                </section>
              </Reveal>
            </div>
          )}

          {tab === 1 && (
            <section className="space-y-8">
              <SectionTitle eyebrow="Catálogo" title={activeCategory ? activeCategory.name : "Todos os produtos"} />
              {categories.length > 0 && (
                <div
                  className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => e.stopPropagation()}
                >
                  {[{ id: null, name: "Todas", count: store.products.length }, ...categories].map((c) => {
                    const active = category === c.id;
                    return (
                      <button
                        key={c.id ?? "all"}
                        onClick={() => setCategory(c.id)}
                        aria-pressed={active}
                        className={`inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition ${
                          active
                            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                            : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]"
                        }`}
                      >
                        {c.name}
                        <span className={`text-xs ${active ? "opacity-80" : "opacity-60"}`}>{c.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar produto pelo nome…"
                    aria-label="Buscar produto pelo nome"
                    inputMode="search"
                    enterKeyHint="search"
                    className="h-12 w-full rounded-full border border-[var(--line)] bg-[var(--surface)] pl-12 pr-12 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                  />
                  {search && (
                    <button
                      onClick={() => {
                        setSearch("");
                        searchRef.current?.focus();
                      }}
                      aria-label="Limpar busca"
                      className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
                    >
                      <IconClose className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as typeof sort)}
                    className="h-12 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 text-sm outline-none focus:border-[var(--accent)]"
                  >
                    <option value="relevance">Relevância</option>
                    <option value="price-asc">Menor preço</option>
                    <option value="price-desc">Maior preço</option>
                    <option value="name">Nome (A–Z)</option>
                  </select>
                  <button
                    onClick={() => setOnlyAvailable((v) => !v)}
                    aria-pressed={onlyAvailable}
                    className={`inline-flex h-12 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition ${
                      onlyAvailable
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                        : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]"
                    }`}
                  >
                    {onlyAvailable && <IconCheck className="h-4 w-4" />}
                    Disponíveis
                  </button>
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[var(--line)] p-12 text-center text-[var(--muted)]">
                  Nenhum produto encontrado.
                </div>
              ) : (
                <div
                  key={`${category ?? "todas"}-${sort}-${onlyAvailable}`}
                  className="fx-grid-in grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4"
                >
                  {filtered.map((p, i) => (
                    <div
                      key={p.id}
                      className="animate-fade-up"
                      style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
                    >
                      {cardFor(p)}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === 2 && (
            <section className="space-y-12">
              <SectionTitle eyebrow="Passo a passo" title="Como fazer seu pedido" />
              <div className="grid gap-5 sm:grid-cols-2">
                {steps.map((step, i) => (
                  <Reveal key={step.title} delay={i * 100}>
                    <div className="relative h-full overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-7 transition duration-500 hover:-translate-y-1 hover:shadow-xl">
                      <span className="absolute -right-2 -top-4 font-[family-name:var(--font-display)] text-[110px] font-semibold leading-none text-[var(--accent-text)] opacity-[0.08]">
                        {i + 1}
                      </span>
                      <div className="relative space-y-2">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)]">
                          {i + 1}
                        </span>
                        <h3 className="pt-2 text-lg font-semibold">{step.title}</h3>
                        <p className="text-sm leading-relaxed text-[var(--muted)]">{step.text}</p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
              <div className="flex justify-center">
                <button
                  onClick={() => goTab(1)}
                  className="fx-btn inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-8 py-4 text-sm font-semibold text-[var(--accent-ink)] shadow-lg transition hover:-translate-y-0.5"
                >
                  Começar meu pedido <IconArrowRight className="h-4 w-4" />
                </button>
              </div>
            </section>
          )}

          {tab === 3 && (
            <section className="space-y-10">
              <SectionTitle eyebrow="Contato" title="Fale com a gente" />
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="grid gap-4">
                  <a
                    href={waGeneral}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-4 rounded-3xl bg-[#25d366] p-6 text-white shadow-lg shadow-[#25d366]/25 transition hover:-translate-y-1"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                      <IconWhatsapp className="h-7 w-7" />
                    </span>
                    <span>
                      <span className="block text-xs uppercase tracking-wider opacity-80">WhatsApp</span>
                      <span className="block text-xl font-semibold">{formatWhatsappDisplay(settings.whatsapp)}</span>
                    </span>
                    <IconArrowRight className="ml-auto h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </a>
                  {settings.instagram && (
                    <a
                      href={`https://instagram.com/${settings.instagram.replace(/^@/, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 transition hover:-translate-y-1 hover:shadow-lg"
                    >
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
                        <IconInstagram className="h-6 w-6" />
                      </span>
                      <span>
                        <span className="block text-xs uppercase tracking-wider text-[var(--muted)]">Instagram</span>
                        <span className="block font-semibold">@{settings.instagram.replace(/^@/, "")}</span>
                      </span>
                    </a>
                  )}
                  {settings.hours && (
                    <div className="flex items-start gap-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
                        <IconClock className="h-6 w-6" />
                      </span>
                      <span>
                        <span className="block text-xs uppercase tracking-wider text-[var(--muted)]">Atendimento</span>
                        <span className="block whitespace-pre-line font-medium">{settings.hours}</span>
                      </span>
                    </div>
                  )}
                  {settings.address && (
                    <div className="flex items-start gap-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
                        <IconPin className="h-6 w-6" />
                      </span>
                      <span>
                        <span className="block text-xs uppercase tracking-wider text-[var(--muted)]">Endereço</span>
                        <span className="block whitespace-pre-line font-medium">{settings.address}</span>
                      </span>
                    </div>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = `Olá, ${storeName}! ${question.text.trim()}${
                      question.name.trim() ? `\n\n— ${question.name.trim()}` : ""
                    }`;
                    trackStoreEvent(slug, "whatsapp_click");
                    window.open(whatsappLink(settings.whatsapp, text), "_blank", "noopener,noreferrer");
                  }}
                  className="space-y-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8"
                >
                  <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Tire suas dúvidas</h3>
                  <p className="text-sm text-[var(--muted)]">Escreva sua pergunta e enviamos direto para o nosso WhatsApp.</p>
                  <input
                    value={question.name}
                    onChange={(e) => setQuestion((q) => ({ ...q, name: e.target.value }))}
                    placeholder="Seu nome"
                    className="h-12 w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                  />
                  <textarea
                    required
                    value={question.text}
                    onChange={(e) => setQuestion((q) => ({ ...q, text: e.target.value }))}
                    rows={5}
                    placeholder="Como podemos ajudar?"
                    className="w-full resize-none rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                  />
                  <button
                    type="submit"
                    className="fx-btn fx-glow-wa flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#25d366] text-sm font-semibold text-white shadow-lg shadow-[#25d366]/25 transition hover:-translate-y-0.5"
                  >
                    <IconWhatsapp className="h-5 w-5" />
                    Enviar no WhatsApp
                  </button>
                </form>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Rodapé no preto e cobre da marca, em qualquer tema. */}
      <footer className="border-t border-[#3a2b20] bg-[#0e0a07] pb-28 text-sm text-[#c4ab97] sm:pb-10">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div className="space-y-3">
            <p className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#f8efe6]">{storeName}</p>
            {settings.tagline && <p className="leading-relaxed">{settings.tagline}</p>}
            <p className="leading-relaxed">Peças criadas sob medida, do projeto à impressão e ao acabamento.</p>
          </div>

          <nav aria-label="Navegação" className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#edb48a]">Loja</p>
            <ul className="space-y-2">
              {TABS.map((label, i) => (
                <li key={label}>
                  <button
                    onClick={() => goTab(i)}
                    className="underline-offset-4 transition hover:text-[#f8efe6] hover:underline"
                  >
                    {label}
                  </button>
                </li>
              ))}
              <li>
                <a
                  href={whatsappLink(settings.whatsapp, `Olá, ${storeName}! Gostaria de uma peça personalizada.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-4 transition hover:text-[#f8efe6] hover:underline"
                >
                  Peças personalizadas
                </a>
              </li>
            </ul>
          </nav>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#edb48a]">Atendimento</p>
            <ul className="space-y-2">
              <li>
                <a
                  href={waGeneral}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 underline-offset-4 transition hover:text-[#f8efe6] hover:underline"
                >
                  <IconWhatsapp className="h-4 w-4" />
                  {formatWhatsappDisplay(settings.whatsapp)}
                </a>
              </li>
              {settings.instagram && (
                <li>
                  <a
                    href={`https://instagram.com/${settings.instagram.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 underline-offset-4 transition hover:text-[#f8efe6] hover:underline"
                  >
                    <IconInstagram className="h-4 w-4" />@{settings.instagram.replace(/^@/, "")}
                  </a>
                </li>
              )}
              {settings.hours && <li className="whitespace-pre-line">{settings.hours}</li>}
              {settings.address && <li className="whitespace-pre-line">{settings.address}</li>}
            </ul>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#edb48a]">Compra e entrega</p>
            <ul className="space-y-2 leading-relaxed">
              <li>Pedido enviado pelo WhatsApp, sem cadastro.</li>
              <li>
                {settings.production_days?.trim()
                  ? `Produção em ${settings.production_days.trim()}, conforme a quantidade de peças.`
                  : "Prazo de produção combinado no WhatsApp, conforme a quantidade de peças."}
              </li>
              <li>{PAYMENT_TERMS}</li>
              <li>Frete e prazo de entrega combinados no WhatsApp para a sua região.</li>
            </ul>
          </div>
        </div>

        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 pb-8 sm:px-6">
          <TrustBadges badges={settings.trust_badges} variant="compact" className="justify-center text-[#f8efe6]" />
          <InstallAppButton storeName={storeName} className="flex flex-col items-center text-[#f8efe6]" />
        </div>

        <div className="border-t border-[#3a2b20]">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs sm:flex-row sm:px-6">
            <p>
              © {new Date().getFullYear()} {storeName}. Todos os direitos reservados.
            </p>
            <p>
              Produzido por <span className="font-semibold tracking-[0.15em] text-[#f8efe6]">NIKLAUS</span>
            </p>
          </div>
        </div>
      </footer>

      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
        {units > 0 && (
          <button
            onClick={() => setCartOpen(true)}
            className="fx-btn fx-pulse flex animate-fade-up items-center gap-3 rounded-full bg-[var(--accent)] py-3 pl-5 pr-6 text-sm font-semibold text-[var(--accent-ink)] shadow-2xl transition hover:-translate-y-0.5"
          >
            <IconCart className="h-5 w-5" />
            {units} {units === 1 ? "item" : "itens"}
            {total > 0 ? ` · ${formatCurrency(total)}` : ""}
          </button>
        )}
        <a
          href={waGeneral}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar no WhatsApp"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25d366] text-white shadow-xl shadow-[#25d366]/40 transition hover:scale-110"
        >
          <IconWhatsapp className="h-7 w-7" />
        </a>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-[90] flex justify-center px-4">
          <div className="flex animate-toast-in items-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-medium text-white shadow-2xl">
            <IconCheck className="h-4 w-4 text-emerald-400" />
            {toast}
          </div>
        </div>
      )}

      <SearchOverlay
        open={searchOpen}
        products={store.products}
        onClose={closeSearch}
        onOpenProduct={(id) => setOpenProductId(id)}
        onSeeAll={seeAllResults}
      />

      {openProduct && (
        <ProductModal
          product={openProduct}
          related={pickRelated(openProduct, store.products)}
          onOpenProduct={setOpenProductId}
          productionDays={settings.production_days}
          shareUrl={productLink(openProduct.id)}
          line={lines.find((l) => l.id === openProduct.id)}
          storeName={storeName}
          whatsapp={settings.whatsapp}
          onClose={() => setOpenProductId(null)}
          onSave={(qty, note) => {
            setLine(openProduct.id, qty, note);
            setOpenProductId(null);
            showToast(`${openProduct.name} no seu pedido`);
          }}
        />
      )}

      <CartDrawer
        open={cartOpen}
        lines={orderLines}
        storeName={storeName}
        whatsapp={settings.whatsapp}
        customer={customer}
        onCustomer={setCustomer}
        onClose={() => setCartOpen(false)}
        onQty={(id, qty) => setLine(id, qty)}
        onNote={(id, note) =>
          setLines((prev) => prev.map((l) => (l.id === id ? { ...l, note } : l)))
        }
        onRemove={(id) => setLines((prev) => prev.filter((l) => l.id !== id))}
        onClear={() => setLines([])}
        onBrowse={() => goTab(1)}
        onSent={() => showToast("Abrindo o WhatsApp…")}
        badges={settings.trust_badges}
        productionDays={settings.production_days}
        rules={discountRules}
      />
    </div>
    </>
  );
}
