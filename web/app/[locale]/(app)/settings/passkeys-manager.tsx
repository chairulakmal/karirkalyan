"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { deletePasskey, getPasskeyRegistrationOptions, registerPasskey } from "@/app/lib/actions";
import { formatDate } from "@/app/lib/format";
import { usePasskeysSupported } from "@/app/lib/passkeys";
import type { Passkey } from "@/app/lib/types";

// The enrollment ceremony (SPEC.md § Auth flow): options via server action,
// the browser creates the credential, the attestation goes back via server
// action. Only the sign-in legs need route handlers — an enrollment is an
// ordinary authenticated mutation.
export function PasskeysManager({ passkeys }: { passkeys: Passkey[] }) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  // False on the server render, the real detection after hydration — same
  // rule as the sign-in button.
  const ready = usePasskeysSupported();

  async function onAdd() {
    setError(null);
    setAdding(true);
    try {
      const optionsResult = await getPasskeyRegistrationOptions();
      if (!optionsResult.ok) {
        setError(optionsResult.error);
        return;
      }

      let created: Credential | null;
      try {
        created = await navigator.credentials.create({
          publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(
            optionsResult.options as unknown as PublicKeyCredentialCreationOptionsJSON,
          ),
        });
      } catch (e) {
        // Cancelling the browser's own dialog is not an error to repeat back.
        if (e instanceof DOMException && e.name === "NotAllowedError") return;
        setError(t("createFailed"));
        return;
      }
      if (!(created instanceof PublicKeyCredential)) return;

      const result = await registerPasskey(created.toJSON(), nickname);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNickname("");
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  function onRemove(id: number) {
    setError(null);
    startTransition(async () => {
      const result = await deletePasskey(id);
      if (!result.ok) setError(result.error);
      setConfirmingId(null);
      router.refresh();
    });
  }

  return (
    <div className="mt-4 space-y-4">
      {passkeys.length === 0 ? (
        <p className="text-sm text-ink-soft">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-dune border border-dune">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {passkey.nickname ?? t("unnamed")}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {t("added", { date: formatDate(passkey.created_at, locale) })}
                  {" · "}
                  {passkey.last_used_at
                    ? t("lastUsed", { date: formatDate(passkey.last_used_at, locale) })
                    : t("neverUsed")}
                </p>
              </div>
              {confirmingId === passkey.id ? (
                // Inline confirm, not window.confirm — the one destructive-action
                // pattern across the app (see delete-button.tsx).
                <div className="basis-full text-right sm:basis-auto">
                  <p className="text-xs text-danger">{t("confirmRemove")}</p>
                  <div className="mt-1.5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onRemove(passkey.id)}
                      disabled={pending}
                      className="border border-danger/40 bg-danger/10 px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/20 disabled:opacity-50"
                    >
                      {pending ? t("removing") : t("remove")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      disabled={pending}
                      className="border border-dune bg-linen px-3 py-1.5 text-sm text-ink-soft hover:bg-sand disabled:opacity-50"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingId(passkey.id)}
                  className="border border-danger/40 bg-linen px-3 py-1.5 text-sm text-danger hover:bg-danger/10"
                >
                  {t("remove")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {ready ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1">
            <span className="kk-label block text-xs text-ink-soft">{t("nickname")}</span>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t("nicknamePlaceholder")}
              maxLength={100}
              className="mt-1 w-full border border-dune bg-linen px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={onAdd}
            disabled={adding}
            className="border border-cobalt px-4 py-2 text-sm font-medium text-cobalt transition hover:bg-cobalt hover:text-linen disabled:opacity-50"
          >
            {adding ? t("addingPasskey") : t("addPasskey")}
          </button>
        </div>
      ) : (
        <p className="text-sm text-ink-soft">{t("unsupported")}</p>
      )}

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
