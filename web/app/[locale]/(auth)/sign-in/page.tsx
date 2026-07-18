import { getTranslations } from "next-intl/server";
import { capturedShare } from "@/app/lib/share";
import { AuthForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  /* Beyond `expired`: a signed-out share bounces here with its share_target
     params intact (the proxy's redirect preserves the query string), and the
     capture must survive sign-in rather than being dropped for /dashboard.
     SPEC.md § Installable app § Share target. */
  searchParams: Promise<{
    expired?: string;
    url?: string | string[];
    text?: string | string[];
    title?: string | string[];
  }>;
}) {
  const [params, t] = await Promise.all([searchParams, getTranslations("auth")]);
  const { expired } = params;
  const share = capturedShare(params);

  return (
    <>
      <p className="kk-label">{t("welcome")}</p>
      <h1 className="mt-2 text-2xl">KarirKalyan</h1>
      <p className="mt-1 text-sm text-ink-soft">{t("tagline")}</p>
      {expired && (
        <p
          role="status"
          className="mt-4 border border-saffron bg-linen px-4 py-3 text-sm text-midnight"
        >
          {t("expired")}
        </p>
      )}
      <AuthForm share={share} />
    </>
  );
}
