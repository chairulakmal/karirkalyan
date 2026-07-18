"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getPushPublicKey, subscribePush, unsubscribePush } from "@/app/lib/actions";
import { usePushSupported } from "@/app/lib/push";

// The notifications toggle — the ONLY surface that may fire the permission
// prompt (SPEC.md § The service worker): a denied permission is sticky and
// near-unrecoverable, so the first ask has to be one the user invited. Never
// on load.
//
// Status is read from the browser, not the server: the subscription lives in
// the service worker registration, and the browser is the authority on
// whether this device holds one.
type PushStatus = "loading" | "off" | "on" | "denied" | "no-worker";

export function PushManager() {
  const t = useTranslations("settings");
  const supported = usePushSupported();
  const [status, setStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    (async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        if (!cancelled) setStatus("no-worker");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      const subscription = await registration.pushManager.getSubscription();
      if (!cancelled) setStatus(subscription ? "on" : "off");
    })();

    return () => {
      cancelled = true;
    };
  }, [supported]);

  async function onEnable() {
    setError(null);
    setBusy(true);
    try {
      // The invited ask — this click is the one place the prompt may appear.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }

      const keyResult = await getPushPublicKey();
      if (!keyResult.ok) {
        setError(keyResult.error);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyResult.publicKey,
      });

      const result = await subscribePush(subscription.toJSON());
      if (!result.ok) {
        // The server refused the row — leave the browser consistent with it.
        await subscription.unsubscribe();
        setError(result.error);
        return;
      }
      setStatus("on");
    } catch {
      setError(t("pushFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onDisable() {
    setError(null);
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        // Browser first, then the row: a dangling server row self-prunes on
        // the next digest (SPEC.md § Push notifications), while a dangling
        // browser subscription would keep receiving nothing forever.
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        const result = await unsubscribePush(endpoint);
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      setStatus("off");
    } catch {
      setError(t("pushFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return <p className="mt-4 text-sm text-ink-soft">{t("pushUnsupported")}</p>;
  }

  return (
    <div className="mt-4 space-y-3">
      {status === "denied" ? (
        <p className="text-sm text-ink-soft">{t("pushDenied")}</p>
      ) : status === "on" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-ink-soft">{t("pushEnabled")}</p>
          <button
            type="button"
            onClick={onDisable}
            disabled={busy}
            className="border border-dune bg-linen px-3 py-1.5 text-sm text-ink-soft hover:bg-sand disabled:opacity-50"
          >
            {busy ? t("pushDisabling") : t("pushDisable")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onEnable}
          disabled={busy || status === "loading"}
          className="border border-cobalt px-4 py-2 text-sm font-medium text-cobalt transition hover:bg-cobalt hover:text-linen disabled:opacity-50"
        >
          {busy ? t("pushEnabling") : t("pushEnable")}
        </button>
      )}

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
