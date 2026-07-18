import { useSyncExternalStore } from "react";

// Feature detection for the passkey ceremonies (SPEC.md § Auth flow). The
// native WebAuthn JSON methods are the only (de)serialization the app uses —
// no hand-rolled Base64URL, no client library — so a browser without them
// simply never sees a passkey button.
export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "PublicKeyCredential" in window &&
    typeof PublicKeyCredential.parseRequestOptionsFromJSON === "function" &&
    typeof PublicKeyCredential.parseCreationOptionsFromJSON === "function"
  );
}

const subscribeNever = () => () => {};

// Hydration-safe client-only read: the server snapshot is false (the server
// cannot know what the browser supports), the client snapshot is the real
// detection — so the button appears after hydration without a mismatch, and
// without the set-state-in-effect dance.
export function usePasskeysSupported(): boolean {
  return useSyncExternalStore(subscribeNever, passkeysSupported, () => false);
}
