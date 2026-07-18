import { getTranslations } from "next-intl/server";
import { apiFetch } from "@/app/lib/api";
import type { Passkey } from "@/app/lib/types";
import { PasskeysManager } from "./passkeys-manager";

// Settings — passkey enrollment and management (SPEC.md § Auth flow,
// § Passkeys). Desktop-first by design: a passkey created here syncs through
// the password manager to the phone, so there is no phone enrollment flow.
export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const res = await apiFetch<Passkey[]>("/passkeys");

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl">{t("title")}</h1>

      <section className="mt-8 border border-dune p-5">
        <h2 className="text-lg">{t("passkeysTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t("passkeysDescription")}</p>

        {res.ok ? (
          <PasskeysManager passkeys={res.data} />
        ) : (
          <p className="mt-4 text-sm text-danger">{res.error}</p>
        )}
      </section>
    </div>
  );
}
