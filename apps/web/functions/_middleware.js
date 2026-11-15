// Cloudflare Pages Function (middleware): SEO e prévia de links.
//
// O site é estático: todo mundo recebe o mesmo HTML, com título genérico.
// Quem lê esse HTML sem rodar o JavaScript (WhatsApp, Instagram, Facebook,
// Google) veria sempre a mesma prévia. Aqui, só nas páginas da loja, o HTML
// sai com título, descrição e foto certos:
//   - link de produto (?p=<id>): nome, preço, descrição e foto do produto;
//   - página da loja: nome, frase e logo da loja.
// Também responde /sitemap.xml (todos os produtos) e /robots.txt.
// Qualquer falha devolve a página original, sem mexer em nada.

// ---- Configuração deste site ---------------------------------------------
// Caminho da loja → slug (null = vem do ?s= do endereço).
const STORE_ROUTES = { "/loja": null, "/loja/": null, "/loja.html": null };
const DEFAULT_SLUG = "keystudio";
// Página da loja usada no sitemap (com o ?s=).
const SITEMAP_BASE = "/loja?s=keystudio";
// Imagem da prévia da página da loja ("" = usa a logo da loja).
const STORE_SHARE_IMAGE = "";
// ----------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/i;

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function short(text, max) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

const brl = (v) =>
  `R$ ${Number(v).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

// Foto para a prévia: JPEG em tamanho bom para WhatsApp/Facebook.
function shareImage(url, origin) {
  if (!url) return "";
  if (url.startsWith("/")) return `${origin}${url}`;
  if (url.startsWith("https://i.ibb.co/")) {
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=1200&h=1200&fit=inside&output=jpg&q=82`;
  }
  return url;
}

function slugFor(url) {
  if (!(url.pathname in STORE_ROUTES)) return null;
  const fixed = STORE_ROUTES[url.pathname];
  const slug = fixed ?? url.searchParams.get("s") ?? DEFAULT_SLUG;
  return SLUG_RE.test(slug) ? slug : null;
}

async function loadStore(origin, slug) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(`${origin}/loja-data?s=${encodeURIComponent(slug)}`, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildMeta(store, url) {
  const s = store.settings || {};
  const storeName = s.display_name || store.name || "Loja";
  const productId = url.searchParams.get("p");
  const product = productId ? (store.products || []).find((p) => p.id === productId) : null;
  const origin = url.origin;

  if (product) {
    const price = product.price_on_request ? "Preço a consultar" : brl(product.price);
    const title = `${product.name} · ${storeName}`;
    const description = short(
      [price, product.size, product.description || s.tagline, "Peça pelo WhatsApp."].filter(Boolean).join(" · "),
      190
    );
    const image = shareImage(product.photo_urls?.[0] || s.logo_url, origin);
    const ld = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description: short(product.description || s.tagline || "", 500) || undefined,
      image: (product.photo_urls || []).slice(0, 4).map((u) => shareImage(u, origin)),
      brand: { "@type": "Brand", name: storeName },
      url: url.toString(),
      offers: product.price_on_request
        ? undefined
        : {
            "@type": "Offer",
            price: Number(product.price).toFixed(2),
            priceCurrency: "BRL",
            availability: product.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            url: url.toString(),
          },
    };
    return { title, description, image, canonical: url.toString(), type: "product", ld, storeName };
  }

  const title = s.tagline ? `${storeName} · ${short(s.tagline, 70)}` : storeName;
  const description = short(
    s.about || `${s.tagline || storeName}. Catálogo completo e pedido direto pelo WhatsApp, sem cadastro.`,
    190
  );
  const canonical = new URL(url.toString());
  canonical.searchParams.delete("p");
  const ld = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: storeName,
    description: short(s.tagline || s.about || "", 300) || undefined,
    image: shareImage(s.logo_url, origin) || undefined,
    url: canonical.toString(),
    telephone: s.whatsapp ? `+${String(s.whatsapp).replace(/\D/g, "")}` : undefined,
    address: s.address || undefined,
    sameAs: s.instagram ? [`https://instagram.com/${String(s.instagram).replace(/^@/, "")}`] : undefined,
  };
  return {
    title,
    description,
    image: shareImage(STORE_SHARE_IMAGE || s.logo_url, origin),
    canonical: canonical.toString(),
    type: "website",
    ld,
    storeName,
  };
}

function metaTags(m) {
  const tags = [
    `<meta name="description" content="${esc(m.description)}">`,
    `<link rel="canonical" href="${esc(m.canonical)}">`,
    `<meta property="og:type" content="${m.type}">`,
    `<meta property="og:site_name" content="${esc(m.storeName)}">`,
    `<meta property="og:locale" content="pt_BR">`,
    `<meta property="og:title" content="${esc(m.title)}">`,
    `<meta property="og:description" content="${esc(m.description)}">`,
    `<meta property="og:url" content="${esc(m.canonical)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(m.title)}">`,
    `<meta name="twitter:description" content="${esc(m.description)}">`,
  ];
  if (m.image) {
    tags.push(`<meta property="og:image" content="${esc(m.image)}">`);
    tags.push(`<meta name="twitter:image" content="${esc(m.image)}">`);
  }
  // "<" escapado: o JSON não pode fechar a tag <script> por engano.
  tags.push(`<script type="application/ld+json">${JSON.stringify(m.ld).replace(/</g, "\\u003c")}</script>`);
  return tags.join("");
}

class Remove {
  element(el) {
    el.remove();
  }
}

async function sitemap(url) {
  const store = await loadStore(url.origin, DEFAULT_SLUG);
  const base = `${url.origin}${SITEMAP_BASE}`;
  const join = (id) => `${base}${base.includes("?") ? "&" : "?"}p=${encodeURIComponent(id)}`;
  const urls = [base, ...((store && store.products) || []).map((p) => join(p.id))];
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join("\n") +
    `\n</urlset>\n`;
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

function robots(url) {
  const body = [
    "User-agent: *",
    "Allow: /",
    // Painel interno: fora do Google.
    "Disallow: /dashboard",
    "Disallow: /login",
    "Disallow: /register",
    "Disallow: /produtos",
    "Disallow: /pedidos",
    "Disallow: /clientes",
    "Disallow: /estoque",
    "Disallow: /financeiro",
    "Disallow: /loja-admin",
    `Sitemap: ${url.origin}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function onRequest(context) {
  const { request, next } = context;
  if (request.method !== "GET") return next();
  const url = new URL(request.url);
  if (url.pathname === "/sitemap.xml") return sitemap(url);
  if (url.pathname === "/robots.txt") return robots(url);

  const slug = slugFor(url);
  if (!slug) return next();

  const response = await next();
  const type = response.headers.get("Content-Type") || "";
  if (!response.ok || !type.includes("text/html")) return response;

  try {
    const store = await loadStore(url.origin, slug);
    if (!store || !store.settings) return response;
    const meta = buildMeta(store, url);
    return new HTMLRewriter()
      .on("title", {
        element(el) {
          el.setInnerContent(meta.title);
        },
      })
      .on('meta[name="description"]', new Remove())
      .on('meta[property^="og:"]', new Remove())
      .on('meta[name^="twitter:"]', new Remove())
      .on('link[rel="canonical"]', new Remove())
      .on("head", {
        element(el) {
          el.append(metaTags(meta), { html: true });
        },
      })
      .transform(response);
  } catch {
    return response;
  }
}
