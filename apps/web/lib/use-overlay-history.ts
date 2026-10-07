import { useEffect, useRef } from "react";

// Janelas abertas, da mais antiga para a de cima. Um único ouvinte de
// "popstate" fecha só a de cima — com várias abertas (ex.: produto por cima da
// pesquisa), o "voltar" do celular não pode fechar todas de uma vez.
type Entry = { close: () => void };
const stack: Entry[] = [];
// "Voltar" disparados por nós mesmos ao fechar pelo botão/Esc: não fecham nada.
let pendingSelfBacks = 0;
let installed = false;

function installListener() {
  if (installed) return;
  installed = true;
  window.addEventListener("popstate", () => {
    if (pendingSelfBacks > 0) {
      pendingSelfBacks -= 1;
      return;
    }
    stack.pop()?.close();
  });
}

/**
 * Makes the browser/phone "back" action close an overlay (photo viewer, cart,
 * dialog) instead of leaving the page. Opening pushes one history entry;
 * "back" pops it and closes only the top-most overlay; closing by button/Esc
 * consumes the entry.
 */
export function useOverlayHistory(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    installListener();
    let closedByBack = false;
    const entry: Entry = {
      close: () => {
        closedByBack = true;
        onCloseRef.current();
      },
    };
    stack.push(entry);
    window.history.pushState({ overlay: true }, "");
    return () => {
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
      if (!closedByBack) {
        pendingSelfBacks += 1;
        window.history.back();
      }
    };
  }, [open]);
}
