import { getTranslations } from "next-intl/server";
import { AuthForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const [{ expired }, t] = await Promise.all([searchParams, getTranslations("auth")]);

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
      <AuthForm defaultMode="sign-in" />
    </>
  );
}
