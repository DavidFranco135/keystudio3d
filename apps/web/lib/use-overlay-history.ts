import { useEffect, useRef } from "react";

/**
 * Makes the browser/phone "back" action close an overlay (photo viewer, cart,
 * dialog) instead of leaving the page. Opening pushes one history entry;
 * "back" pops it and closes; closing by button/Esc consumes the entry.
 */
export function useOverlayHistory(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    let pending = true;
    window.history.pushState({ overlay: true }, "");
    const onPop = () => {
      pending = false;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (pending) window.history.back();
    };
  }, [open]);
}
