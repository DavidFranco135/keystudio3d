// Busca de produtos sem diferenciar acentos nem maiúsculas: "arvore" acha "Árvore".
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Todas as palavras digitadas precisam aparecer em algum dos textos (em qualquer ordem).
export function matchesSearch(term: string, ...texts: (string | null | undefined)[]): boolean {
  const words = normalizeSearch(term).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearch(texts.filter(Boolean).join(" "));
  return words.every((w) => haystack.includes(w));
}
