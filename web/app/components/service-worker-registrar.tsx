"use client";

import { useEffect } from "react";

// Registers the push-only service worker (SPEC.md § The service worker).
// Mounted in the (app) shell, not the root layout, on purpose: the worker is
// only useful to a signed-in user, and registering from the marketing pages
// would install one for visitors who will never grant notification permission.
// DOM-less — it renders nothing.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      // A failed registration must not break the shell — but it must not be
      // silent either, or a CSP/matcher regression looks like "push just
      // stopped working" with nothing to grep for.
      console.error("service worker registration failed", error);
    });
  }, []);

  return null;
}
