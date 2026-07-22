"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

type Tone = "success" | "error";
type Toast = { id: number; message: string; tone: Tone };
type ToastApi = { success: (message: string) => void; error: (message: string) => void };

const ToastContext = createContext<ToastApi | null>(null);
const AUTO_DISMISS_MS = 5000;

/**
 * One toast primitive for every write surface (v1.11.0): a single polite live
 * region that replaces the board's hand-rolled `role="alert"` box and gives a
 * silent success ("Saved", "Moved to Applied") a voice. Polite, not assertive:
 * a toast is the result of the user's own action, so it waits rather than
 * cutting in, the same rule the list's count region already follows. It
 * auto-dismisses, and has no entrance animation, so there is nothing for
 * prefers-reduced-motion to fight. See SPEC.md § Toast feedback.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("toast");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: Tone) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  // Stable identity: callers read `.success`/`.error` in event handlers, and a
  // fresh object each render would re-render every consumer when a toast appears.
  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push(message, "success"),
      error: (message) => push(message, "error"),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Above the phone tab bar (fixed, bottom), flush to the corner on wider
          screens. pointer-events-none on the stack so it never eats a click; the
          toasts themselves re-enable it for the dismiss button. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-16 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex max-w-md items-center gap-3 border px-4 py-2.5 text-sm shadow-lg ${
              toast.tone === "error"
                ? "border-danger/40 bg-danger/10 text-danger"
                : "border-dune bg-linen text-midnight"
            }`}
          >
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label={t("dismiss")}
              className="text-ink-soft transition hover:text-midnight"
            >
              <span aria-hidden>×</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used within a ToastProvider");
  return api;
}
