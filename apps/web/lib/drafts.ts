// Rascunhos e "onde eu estava" guardados no aparelho.
//
// No celular, ao trocar de app o sistema costuma fechar o app/aba da loja para
// liberar memória; ao voltar, tudo recomeça do zero. Aqui o que a pessoa está
// digitando (e a tela em que estava) fica salvo no localStorage e volta sozinho.
// Rascunhos são apagados ao salvar/cancelar e expiram depois de alguns dias.

const DRAFT_PREFIX = "ks_draft:";
const DRAFT_MAX_AGE_MS = 3 * 24 * 3600 * 1000;

export function readDraft<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; value: T };
    if (!parsed || Date.now() - parsed.at > DRAFT_MAX_AGE_MS) {
      window.localStorage.removeItem(DRAFT_PREFIX + key);
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // armazenamento cheio/bloqueado: segue sem rascunho
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(DRAFT_PREFIX + key);
  } catch {
    // ignora
  }
}

// --- Última tela do painel ----------------------------------------------------

const LAST_ROUTE_KEY = "ks_last_route";
const RESTORED_FLAG = "ks_route_restored";
const LAST_ROUTE_MAX_AGE_MS = 12 * 3600 * 1000;

/**
 * Chamado a cada troca de tela do painel. Na primeira tela de uma nova sessão
 * (app reaberto pelo sistema, que sempre começa no /dashboard), devolve a tela
 * em que a pessoa estava para voltar até ela; senão só registra a atual.
 */
export function trackPanelRoute(currentPath: string): string | null {
  try {
    if (!window.sessionStorage.getItem(RESTORED_FLAG)) {
      window.sessionStorage.setItem(RESTORED_FLAG, "1");
      const saved = JSON.parse(window.localStorage.getItem(LAST_ROUTE_KEY) || "null") as
        | { path: string; at: number }
        | null;
      if (
        saved &&
        currentPath === "/dashboard" &&
        saved.path !== "/dashboard" &&
        saved.path.startsWith("/") &&
        Date.now() - saved.at < LAST_ROUTE_MAX_AGE_MS
      ) {
        return saved.path;
      }
    }
    window.localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify({ path: currentPath, at: Date.now() }));
  } catch {
    // armazenamento indisponível
  }
  return null;
}
