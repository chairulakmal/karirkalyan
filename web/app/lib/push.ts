import { useSyncExternalStore } from "react";

// Feature detection for Web Push (SPEC.md § The service worker) — the same
// shape as app/lib/passkeys.ts and for the same reason: support is a static
// fact about the browser, the server render cannot know it, and a false
// server snapshot avoids both the hydration mismatch and the
// set-state-in-effect dance.
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

const subscribeNever = () => () => {};

export function usePushSupported(): boolean {
  return useSyncExternalStore(subscribeNever, pushSupported, () => false);
}
