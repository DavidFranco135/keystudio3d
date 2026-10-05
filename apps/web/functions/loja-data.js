// Cloudflare Pages Function: GET /loja-data?s=<slug>
//
// Dados da loja pública (o mesmo JSON de /api/v1/public/stores/<slug>)
// servidos do cache da Cloudflare, perto do cliente. Montar a lista no
// servidor leva alguns segundos (preço de cada produto); aqui o cliente
// sempre recebe na hora a última versão guardada e, se ela tiver mais de
// FRESH_SECONDS, a Cloudflare busca a nova em segundo plano para o próximo
// visitante ("stale-while-revalidate"). Alterações feitas em Minha Loja
// aparecem em ~30 s, como antes.
const DEFAULT_API = "https://api-r4x5wktcva-uc.a.run.app";
const FRESH_SECONDS = 30;
const KEEP_SECONDS = 7 * 24 * 3600; // por quanto tempo uma cópia antiga ainda serve
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/i;

async function fetchFromApi(apiBase, slug) {
  const res = await fetch(`${apiBase}/api/v1/public/stores/${encodeURIComponent(slug)}`, {
    headers: { Accept: "application/json" },
  });
  const body = await res.text();
  return { status: res.status, body };
}

function jsonResponse(body, status, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // O navegador não guarda: quem guarda é o cache da Cloudflare abaixo.
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("s") || "";
  if (!SLUG_RE.test(slug)) return jsonResponse('{"detail":"Loja inválida"}', 400);

  const apiBase = (env && env.NEXT_PUBLIC_API_URL) || DEFAULT_API;
  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/loja-data?s=${encodeURIComponent(slug.toLowerCase())}`, {
    method: "GET",
  });

  const refresh = async () => {
    const { status, body } = await fetchFromApi(apiBase, slug);
    if (status !== 200) return { status, body };
    await cache.put(
      cacheKey,
      new Response(body, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": `public, max-age=${KEEP_SECONDS}`,
          "X-Fetched-At": String(Date.now()),
        },
      })
    );
    return { status, body };
  };

  // ?refresh=1: chamado pelo painel logo após salvar, para a próxima visita
  // já ver a alteração.
  const cached = url.searchParams.get("refresh") === "1" ? undefined : await cache.match(cacheKey);
  if (cached) {
    const fetchedAt = Number(cached.headers.get("X-Fetched-At") || 0);
    const ageSeconds = (Date.now() - fetchedAt) / 1000;
    if (ageSeconds > FRESH_SECONDS) waitUntil(refresh().catch(() => {}));
    return jsonResponse(await cached.text(), 200, { "X-Loja-Cache": ageSeconds > FRESH_SECONDS ? "stale" : "hit" });
  }

  try {
    const { status, body } = await refresh();
    return jsonResponse(body, status, { "X-Loja-Cache": "miss" });
  } catch {
    return jsonResponse('{"detail":"Falha ao carregar a loja"}', 502);
  }
}
