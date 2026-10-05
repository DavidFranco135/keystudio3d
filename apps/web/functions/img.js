// Cloudflare Pages Function: GET /img?u=<url da foto no ImgBB>&w=<largura>
//
// As fotos ficam no ImgBB (i.ibb.co), que em várias conexões no Brasil
// carrega muito devagar ou nem carrega, e estão na resolução original da
// câmera (1–4 MB cada). Aqui a Cloudflare pede uma versão reduzida (WebP, na
// largura pedida) ao wsrv.nl — serviço público de redimensionamento — e a
// guarda no cache da borda; daí em diante a foto sai da rede da Cloudflare,
// perto do cliente, com uma fração do tamanho. Se o redimensionamento falhar,
// usa a foto original do ImgBB.
//
// Só aceita i.ibb.co (para não virar um proxy aberto) e larguras fixas (para
// o cache não ser inflado com tamanhos arbitrários).
const ALLOWED_HOST = "i.ibb.co";
const WIDTHS = [240, 640, 1280, 1920];
const ONE_YEAR = 31536000;

function pickWidth(raw) {
  const asked = Number(raw);
  if (!Number.isFinite(asked) || asked <= 0) return null;
  return WIDTHS.find((w) => w >= asked) ?? WIDTHS[WIDTHS.length - 1];
}

async function fetchResized(target, width) {
  const resizer = new URL("https://wsrv.nl/");
  resizer.searchParams.set("url", target.toString());
  resizer.searchParams.set("w", String(width));
  resizer.searchParams.set("we", ""); // não aumenta fotos menores que a largura
  resizer.searchParams.set("output", "webp");
  resizer.searchParams.set("q", "80");
  try {
    const res = await fetch(resizer.toString(), { cf: { cacheEverything: true, cacheTtl: ONE_YEAR } });
    if (res.ok && (res.headers.get("Content-Type") || "").startsWith("image/")) return res;
  } catch {
    // cai para a original
  }
  return null;
}

export async function onRequestGet({ request, waitUntil }) {
  const url = new URL(request.url);
  let target;
  try {
    target = new URL(url.searchParams.get("u") || "");
  } catch {
    return new Response("URL inválida", { status: 400 });
  }
  if (target.protocol !== "https:" || target.hostname !== ALLOWED_HOST) {
    return new Response("Origem não permitida", { status: 400 });
  }
  const width = pickWidth(url.searchParams.get("w"));

  const cacheUrl = new URL(url.origin + url.pathname);
  cacheUrl.searchParams.set("u", target.toString());
  if (width) cacheUrl.searchParams.set("w", String(width));
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let upstream = width ? await fetchResized(target, width) : null;
  if (!upstream) {
    upstream = await fetch(target.toString(), { cf: { cacheEverything: true, cacheTtl: ONE_YEAR } });
  }
  if (!upstream.ok) {
    return new Response(null, { status: upstream.status === 404 ? 404 : 502 });
  }

  const response = new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "image/jpeg",
      // As URLs do ImgBB nunca mudam de conteúdo, então podem ficar em cache para sempre.
      "Cache-Control": `public, max-age=${ONE_YEAR}, immutable`,
      "Access-Control-Allow-Origin": "*",
    },
  });
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
