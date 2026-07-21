import { getTranslations } from "next-intl/server";
import { apiFetch } from "@/app/lib/api";
import type { Passkey, Profile } from "@/app/lib/types";
import { PasskeysManager } from "./passkeys-manager";
import { PushManager } from "./push-manager";
import { ResidenceManager } from "./residence-manager";

// Settings — passkey enrollment (SPEC.md § Auth flow, § Passkeys) and the
// push-notification toggle (§ The service worker), which is the one surface
// allowed to fire the permission prompt.
export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const [res, profileRes] = await Promise.all([
    apiFetch<Passkey[]>("/passkeys"),
    apiFetch<Profile>("/me"),
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl">{t("title")}</h1>

      <section className="mt-8 border border-dune p-5">
        <h2 className="text-lg">{t("residenceTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t("residenceDescription")}</p>
        {profileRes.ok ? (
          <ResidenceManager profile={profileRes.data} />
        ) : (
          <p className="mt-4 text-sm text-danger">{profileRes.error}</p>
        )}
      </section>

      <section className="mt-8 border border-dune p-5">
        <h2 className="text-lg">{t("passkeysTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t("passkeysDescription")}</p>

        {res.ok ? (
          <PasskeysManager passkeys={res.data} />
        ) : (
          <p className="mt-4 text-sm text-danger">{res.error}</p>
        )}
      </section>

      <section className="mt-6 border border-dune p-5">
        <h2 className="text-lg">{t("pushTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t("pushDescription")}</p>
        <PushManager />
      </section>
    </div>
  );
}
