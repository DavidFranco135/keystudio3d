// Fotos do ImgBB passam pela função /img da Cloudflare (functions/img.js),
// que as guarda em cache perto do cliente — direto do i.ibb.co muitas
// conexões no Brasil carregam muito devagar. Em desenvolvimento (`next dev`)
// a função não existe, então lá a URL original é usada.
const PROXIED_PREFIX = "https://i.ibb.co/";

export function imgSrc(url: string): string;
export function imgSrc(url: string | undefined): string | undefined;
export function imgSrc(url: string | undefined): string | undefined {
  if (!url || process.env.NODE_ENV !== "production" || !url.startsWith(PROXIED_PREFIX)) return url;
  return `/img?u=${encodeURIComponent(url)}`;
}
