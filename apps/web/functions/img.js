// Cloudflare Pages Function: GET /img?u=<url da foto no ImgBB>
//
// As fotos ficam no ImgBB (i.ibb.co), que em várias conexões no Brasil
// carrega muito devagar ou nem carrega. Aqui a Cloudflare busca a foto uma
// vez e a guarda no cache da borda; daí em diante ela sai da rede da
// Cloudflare, perto do cliente. Só aceita i.ibb.co para não virar um proxy
// aberto para qualquer site.
const ALLOWED_HOST = "i.ibb.co";
const ONE_YEAR = 31536000;

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

  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const upstream = await fetch(target.toString(), {
    cf: { cacheEverything: true, cacheTtl: ONE_YEAR },
  });
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
