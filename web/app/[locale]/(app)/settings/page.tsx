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
  const tErrors = await getTranslations("errors");
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
        {/* Three states, not two: a failure carries `error`, but a success with
            no body (204, or a non-JSON 200 from a proxy mid-deploy) carries
            neither an error nor a profile, and this form has nothing to edit
            without one. Both dead ends render as an error, since from the user's
            side they are the same thing. */}
        {profileRes.ok && profileRes.data ? (
          <ResidenceManager profile={profileRes.data} />
        ) : (
          <p className="mt-4 text-sm text-danger">
            {profileRes.ok ? tErrors("emptyResponse") : profileRes.error}
          </p>
        )}
      </section>

      <section className="mt-8 border border-dune p-5">
        <h2 className="text-lg">{t("passkeysTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t("passkeysDescription")}</p>

        {res.ok ? (
          // A body-less success reads as "no passkeys yet", which is the same
          // thing an empty list means to this component.
          <PasskeysManager passkeys={res.data ?? []} />
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
