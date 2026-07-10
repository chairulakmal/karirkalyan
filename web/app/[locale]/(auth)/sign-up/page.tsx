import { getTranslations } from "next-intl/server";
import { AuthForm } from "../sign-in/sign-in-form";

export default async function SignUpPage() {
  const t = await getTranslations("auth");

  return (
    <>
      <p className="kk-label">{t("welcome")}</p>
      <h1 className="mt-2 text-2xl">KarirKalyan</h1>
      <p className="mt-1 text-sm text-ink-soft">{t("tagline")}</p>
      <AuthForm defaultMode="sign-up" />
    </>
  );
}
