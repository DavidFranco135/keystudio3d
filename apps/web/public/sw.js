// Service worker da loja pública: abre mais rápido nas próximas visitas e
// mostra a última versão vista quando o celular está sem internet.
// Só mexe em GET do próprio site; chamadas da API e do painel passam direto.
const VERSION = "loja-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGES_CACHE = `${VERSION}-pages`;
const DATA_CACHE = `${VERSION}-data`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Arquivos do site com nome versionado (nunca mudam): guardados de vez.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fotos-catalogo/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // Dados da loja: sempre tenta a internet; sem conexão, usa a última cópia.
  if (url.pathname === "/loja-data" && !url.searchParams.has("refresh")) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }
  // Páginas da loja (início e /loja): idem.
  if (request.mode === "navigate" && (url.pathname === "/" || /^\/loja(\/|\.html)?$/.test(url.pathname))) {
    event.respondWith(networkFirst(request, PAGES_CACHE));
  }
});
